"""Momentalk API server."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import live, meta_client, store, tts
from .config import settings
from .cost import BudgetExceeded
from .pipelines import scene as scene_pipeline

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
    return {"ok": True, "api_key": settings.has_api_key, "cost": meta_client.ledger.summary()}


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
    if not store.delete_scene(scene_id):
        raise HTTPException(404, "Scene not found")
    return {"ok": True}


@app.post("/api/scenes/photo")
async def create_photo_scene(photo: UploadFile = File(...), language: str = Form("en"),
                             person_name: str = Form("me"), narration: str | None = Form(None)) -> dict:
    if not settings.has_api_key:
        raise HTTPException(503, "Meta API key not configured")
    raw = await photo.read()
    job = _new_job("photo")
    asyncio.create_task(_run_job(job, scene_pipeline.build_photo_scene(
        raw, language=language, person_name=person_name, narration=narration, progress=_progress(job))))
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
async def add_hotspot(scene_id: str, point: PointRequest) -> dict:
    scene = get_scene(scene_id)
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
