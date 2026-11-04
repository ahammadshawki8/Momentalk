"""Momentalk API server."""

from __future__ import annotations

import asyncio
import time
from typing import Any

import os
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import agent, live, meta_client, prefs, public_demo, store, tts
from .config import settings
from .cost import BudgetExceeded
from .pipelines import scene as scene_pipeline
from .pipelines import narration
from .pipelines import video as video_pipeline
from .pipelines import wish as wish_pipeline

public_demo.bootstrap_data()
app = FastAPI(title="Momentalk API")
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
        "open_weights_available": settings.has_open_weights,
        "language_model": meta_client.language_model(),
        "cost": meta_client.ledger.summary(),
    }


@app.get("/api/prefs")
def get_prefs() -> dict:
    return prefs.load()


class PrefsUpdate(BaseModel):
    person_name: str | None = None
    language: str | None = None
    voice: str | None = None
    private_mode: bool | None = None


@app.patch("/api/prefs")
def update_prefs(update: PrefsUpdate) -> dict:
    if public_demo.PUBLIC:
        raise HTTPException(403, "Shared settings are locked in the live demo. Name and language are saved on this device.")
    data = update.model_dump(exclude_none=True)
    if data.get("private_mode") and not settings.has_open_weights:
        raise HTTPException(409, "Private Mode needs an open weights partner key (OPEN_WEIGHTS_API_KEY)")
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

@app.get("/api/inbox")
def list_inbox() -> list[dict]:
    return [{**m, "url": store.media_url(agent.INBOX / m["file"])} for m in agent.list_media()]


@app.post("/api/inbox")
async def add_to_inbox(photos: list[UploadFile] = File(...)) -> list[dict]:
    for photo in photos:
        image, _, _ = scene_pipeline.prepare_image(await photo.read())
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

class WishRequest(BaseModel):
    activity: str


@app.post("/api/scenes/{scene_id}/wish")
async def make_wish(scene_id: str, body: WishRequest, request: Request) -> dict:
    place = get_scene(scene_id)
    public_demo.limit_model_work(request)
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    p = prefs.load()
    job = _new_job("wish")
    asyncio.create_task(_run_job(job, wish_pipeline.build_wish_scene(
        place, body.activity.strip()[:80], person_name=p["person_name"], language=p["language"],
        progress=_progress(job))))
    return job



# ---------- Built frontend (single container deploy) ----------

_DIST = Path(os.environ.get("MOMENTALK_FRONTEND_DIST", Path(__file__).resolve().parents[2] / "frontend" / "dist"))
if _DIST.exists():
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
