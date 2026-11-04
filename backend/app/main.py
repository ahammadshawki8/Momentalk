"""Momentalk API server."""

from __future__ import annotations

import asyncio
import contextlib
import os
import shutil
import time
from pathlib import Path
from typing import Any

from . import persist

# Before anything reads the data folder (the cost ledger loads at import), bring it back from Postgres.
persist.restore_safely()

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import agent, live, meta_client, prefs, public_demo, store, tts
from .config import settings
from .cost import BudgetExceeded
from .pipelines import scene as scene_pipeline
from .pipelines import avatar as avatar_pipeline
from .pipelines import narration
from .pipelines import video as video_pipeline
from .pipelines import wish as wish_pipeline

public_demo.bootstrap_data()


@contextlib.asynccontextmanager
async def lifespan(_app: FastAPI):
    task = None
    if persist.enabled():
        await asyncio.to_thread(persist.sync_once)  # first upload (a fresh database gets the demo)
        task = asyncio.create_task(persist.run_forever())
    yield
    if task:
        task.cancel()
        await asyncio.to_thread(persist.sync_once)  # flush the last changes before the container stops


app = FastAPI(title="Momentalk API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory=settings.data_dir), name="media")

# In memory job registry for long running builds (progress shown in the UI).
JOBS: dict[str, dict[str, Any]] = {}


def _new_job(kind: str) -> dict[str, Any]:
    job = {"id": store.new_id("j_"), "kind": kind, "status": "running", "stages": [],
           "scene_id": None, "error": None, "started_at": time.time()}
    JOBS[job["id"]] = job
    return job


def _progress(job: dict[str, Any]):
    async def report(stage: str, info: dict) -> None:
        job["stages"].append({"stage": stage, "t": round(time.time() - job["started_at"], 1), **info})
    return report


async def _run_job(job: dict[str, Any], coro) -> None:
    try:
        result = await coro
        if job["kind"] == "agent":
            job["run"] = result
        elif job["kind"] == "avatar":
            job["avatar"] = result
        else:
            job["scene_id"] = result["id"]
        job["status"] = "done"
    except BudgetExceeded as exc:
        job["status"], job["error"] = "error", str(exc)
    except meta_client.MetaAPIError as exc:
        job["status"], job["error"] = "error", f"Meta API error {exc.status}"
    except Exception as exc:  # surfaced to the caregiver as a friendly failure
        job["status"], job["error"] = "error", f"{type(exc).__name__}: {exc}"


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "public": public_demo.PUBLIC,
        "api_key": settings.has_api_key,
        "language_model": meta_client.language_model(),
        "cost": meta_client.ledger.summary(),
    }


@app.post("/api/profile/reset")
def reset_profile() -> dict:
    """Delete everything the person's profile made: their moments, drafts, avatar and uploads.

    Sample moments (flagged demo) always stay, so the live demo keeps working for everyone.
    """
    removed = 0
    for scene in store.list_scenes():
        if not scene.get("demo"):
            store.delete_scene(scene["id"])
            removed += 1
    for drawing in avatar_pipeline.AVATAR_DIR.glob("*"):
        if drawing.is_file() and not drawing.name.startswith(avatar_pipeline.SEED_PREFIX):
            drawing.unlink()
    for folder in (agent.INBOX, agent.POSTERS):
        for item in folder.glob("*"):
            if item.is_file() and not item.stem.startswith("m_demo"):
                item.unlink()
    return {"ok": True, "removed_moments": removed}


@app.get("/api/prefs")
def get_prefs() -> dict:
    return prefs.load()


class PrefsUpdate(BaseModel):
    person_name: str | None = None
    language: str | None = None
    voice: str | None = None


@app.patch("/api/prefs")
def update_prefs(update: PrefsUpdate) -> dict:
    if public_demo.PUBLIC:
        raise HTTPException(403, "Shared settings are locked in the live demo. Name and language are saved on this device.")
    data = update.model_dump(exclude_none=True)
    return prefs.save(data)


@app.get("/api/scenes")
def list_scenes(status: str | None = None) -> list[dict]:
    scenes = store.list_scenes()
    if status:
        scenes = [s for s in scenes if s.get("status") == status]
    return scenes


@app.get("/api/scenes/{scene_id}")
def get_scene(scene_id: str) -> dict:
    scene = store.load_scene(scene_id)
    if not scene:
        raise HTTPException(404, "Scene not found")
    return scene


@app.delete("/api/scenes/{scene_id}")
def delete_scene(scene_id: str) -> dict:
    public_demo.protect_demo_scene(get_scene(scene_id))
    if not store.delete_scene(scene_id):
        raise HTTPException(404, "Scene not found")
    return {"ok": True}


@app.post("/api/scenes/photo")
async def create_photo_scene(request: Request, photo: UploadFile = File(...), language: str = Form("en"),
                             person_name: str = Form("me"), narration: str | None = Form(None)) -> dict:
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    public_demo.limit_model_work(request)
    raw = await photo.read()
    job = _new_job("photo")
    asyncio.create_task(_run_job(job, scene_pipeline.build_photo_scene(
        raw, language=language, person_name=person_name, narration=narration, progress=_progress(job))))
    return job


@app.post("/api/scenes/video")
async def create_video_scene(request: Request, video: UploadFile = File(...), language: str = Form("en"),
                             person_name: str = Form("me"), narration: str | None = Form(None)) -> dict:
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    public_demo.limit_model_work(request)
    raw = await video.read()
    job = _new_job("video")
    asyncio.create_task(_run_job(job, video_pipeline.build_video_scene(
        raw, video.filename or "clip.mp4", language=language, person_name=person_name,
        narration=narration, progress=_progress(job))))
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


class HotspotUpdate(BaseModel):
    label: str | None = None
    phrase: str | None = None
    synonyms: list[str] | None = None


@app.patch("/api/scenes/{scene_id}/hotspots/{hotspot_id}")
async def update_hotspot(scene_id: str, hotspot_id: str, update: HotspotUpdate) -> dict:
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    for hotspot in scene["hotspots"]:
        if hotspot["id"] == hotspot_id:
            if update.label is not None:
                hotspot["label"] = update.label
            if update.synonyms is not None:
                hotspot["synonyms"] = update.synonyms
            if update.phrase is not None and update.phrase != hotspot["phrase"]:
                hotspot["phrase"] = update.phrase
                path = await tts.synthesize(update.phrase, store.AUDIO_DIR, scene.get("language", "en"))
                hotspot["audio_url"] = store.media_url(path)
            store.save_scene(scene)
            return hotspot
    raise HTTPException(404, "Hotspot not found")


@app.delete("/api/scenes/{scene_id}/hotspots/{hotspot_id}")
def delete_hotspot(scene_id: str, hotspot_id: str) -> dict:
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    before = len(scene["hotspots"])
    scene["hotspots"] = [h for h in scene["hotspots"] if h["id"] != hotspot_id]
    if len(scene["hotspots"]) == before:
        raise HTTPException(404, "Hotspot not found")
    store.save_scene(scene)
    return {"ok": True}


class PointRequest(BaseModel):
    x: float
    y: float


@app.post("/api/scenes/{scene_id}/hotspots/at-point")
async def add_hotspot(scene_id: str, point: PointRequest, request: Request) -> dict:
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    hotspot = await scene_pipeline.add_hotspot_at_point(scene, point.x, point.y)
    if not hotspot:
        raise HTTPException(422, "Nothing found at that spot")
    return hotspot


@app.post("/api/scenes/{scene_id}/reject")
def reject_scene(scene_id: str) -> dict:
    """A caregiver says no to a draft: it is deleted, and its photo is not proposed again."""
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    if scene.get("status") != "draft":
        raise HTTPException(409, "Only drafts can be rejected")
    if scene.get("source_media"):
        agent.reject_media(scene["source_media"])
    store.delete_scene(scene_id)
    return {"ok": True}


@app.post("/api/scenes/{scene_id}/approve")
def approve_scene(scene_id: str) -> dict:
    scene = get_scene(scene_id)
    scene["status"] = "approved"
    return store.save_scene(scene)


class TapEvent(BaseModel):
    hotspot_id: str


@app.post("/api/scenes/{scene_id}/taps")
def record_tap(scene_id: str, tap: TapEvent) -> dict:
    scene = get_scene(scene_id)
    scene.setdefault("taps", []).append({"hotspot_id": tap.hotspot_id, "t": time.time()})
    store.save_scene(scene)
    return {"ok": True}


@app.websocket("/ws/live/{scene_id}")
async def live_modeling(ws: WebSocket, scene_id: str) -> None:
    await live.live_session(ws, scene_id)


# ---------- Moment Builder agent (Muse Wonder) ----------

MAX_INBOX_VIDEO_BYTES = 120 * 1024 * 1024


def _inbox_item(m: dict) -> dict:
    if m["kind"] == "video":
        return {**m, "url": store.media_url(agent.POSTERS / f"{m['media_id']}.jpg"),
                "video_url": store.media_url(agent.INBOX / m["file"])}
    return {**m, "url": store.media_url(agent.INBOX / m["file"])}


@app.get("/api/inbox")
def list_inbox() -> list[dict]:
    return [_inbox_item(m) for m in agent.list_media()]


@app.post("/api/inbox")
async def add_to_inbox(photos: list[UploadFile] = File(...)) -> list[dict]:
    """Today's photos and short videos, waiting for Moment Builder (the field keeps its old name)."""
    for upload in photos:
        raw = await upload.read()
        suffix = Path(upload.filename or "").suffix.lower()
        if (upload.content_type or "").startswith("video/") or suffix in agent.VIDEO_EXT:
            if len(raw) > MAX_INBOX_VIDEO_BYTES:
                raise HTTPException(413, "That video is too large. Keep it under about 20 seconds.")
            media_id = store.new_id("m_")
            path = agent.INBOX / f"{media_id}{suffix if suffix in agent.VIDEO_EXT else '.mp4'}"
            path.write_bytes(raw)
            try:
                await asyncio.to_thread(video_pipeline.poster_frame, path, agent.POSTERS / f"{media_id}.jpg")
            except Exception:
                path.unlink(missing_ok=True)
                raise HTTPException(422, "That video could not be read. Try an MP4 or MOV clip.")
        else:
            image, _, _ = scene_pipeline.prepare_image(raw)
            (agent.INBOX / f"{store.new_id('m_')}.jpg").write_bytes(image)
    return list_inbox()


@app.post("/api/agent/run")
async def run_agent(request: Request) -> dict:
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    job = _new_job("agent")
    person = prefs.load()["person_name"]
    asyncio.create_task(_run_job(job, agent.run_moment_builder(person_name=person, progress=_progress(job))))
    return job


# ---------- Narrated Labels (Muse Voice Transcribe plus Muse Spark) ----------

@app.post("/api/scenes/{scene_id}/narration")
async def narrate_scene(scene_id: str, request: Request, audio: UploadFile = File(...)) -> dict:
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    return await narration.propose_from_narration(scene, await audio.read(), audio.filename or "narration.webm")


class NarrationApply(BaseModel):
    changes: list[dict]
    title: str | None = None


@app.post("/api/scenes/{scene_id}/narration/apply")
async def apply_narration(scene_id: str, body: NarrationApply) -> dict:
    scene = get_scene(scene_id)
    public_demo.protect_demo_scene(scene)
    return await narration.apply_changes(scene, body.changes, body.title)


# ---------- Wish Scenes (Muse Image) ----------

@app.post("/api/avatar")
async def make_avatar(traits: avatar_pipeline.AvatarTraits, request: Request) -> dict:
    """Illustrated avatar from described traits only (no photo), reused by every wish."""
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    job = _new_job("avatar")
    asyncio.create_task(_run_job(job, avatar_pipeline.build_avatar(traits)))
    return job


class WishRequest(BaseModel):
    activity: str
    avatar_id: str | None = None
    person_name: str | None = None
    language: str | None = None


@app.post("/api/scenes/{scene_id}/wish")
async def make_wish(scene_id: str, body: WishRequest, request: Request) -> dict:
    place = get_scene(scene_id)
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    p = prefs.load()
    replace_source = place.get("status") == "draft" and not (public_demo.PUBLIC and place.get("demo"))
    job = _new_job("wish")
    asyncio.create_task(_run_job(job, wish_pipeline.build_wish_scene(
        place, body.activity.strip()[:80], person_name=(body.person_name or p["person_name"])[:24],
        language=body.language or p["language"], progress=_progress(job), replace_source=replace_source,
        avatar=avatar_pipeline.load_avatar(body.avatar_id))))
    return job



# ---------- Built frontend (single container deploy) ----------

_DIST = Path(os.environ.get("MOMENTALK_FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _DIST.exists():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
