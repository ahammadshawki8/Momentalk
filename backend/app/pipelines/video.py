"""Talking Video Scene: a short family clip whose people and things stay tappable as they move.

1. ffmpeg trims the clip (max 20 s), scales it to 960 px wide, re-encodes H.264, grabs a keyframe.
2. Muse Spark picks trackable concepts on the keyframe (same schema as photos).
3. SAM 3.1 video tracks each concept (one concept per request) with stable identities.
4. Tracks are sampled into a compact per-frame polygon timeline the browser interpolates.
"""

from __future__ import annotations

import asyncio
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from .. import meta_client, store
from ..geometry import box_to_polygon, mask_to_polygons
from ..sam_format import SamFrame, decode_mask, parse_sam_output
from .scene import CONCEPT_SCHEMA, Progress, concept_prompt, voice_hotspots

MAX_SECONDS = 20
TARGET_WIDTH = 960
SAMPLE_FPS = 10
MAX_VIDEO_CONCEPTS = 4


def _ffmpeg() -> str:
    path = shutil.which("ffmpeg")
    if not path:
        raise RuntimeError("ffmpeg is required for video scenes")
    return path


def probe(path: Path) -> dict[str, Any]:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,r_frame_rate,nb_frames:format=duration", "-of", "json", str(path)],
        check=True, capture_output=True, text=True,
    )
    data = json.loads(out.stdout)
    stream = data["streams"][0]
    num, den = stream.get("r_frame_rate", "30/1").split("/")
    return {
        "width": int(stream["width"]),
        "height": int(stream["height"]),
        "fps": float(num) / float(den or 1),
        "duration": float(data.get("format", {}).get("duration", 0) or 0),
    }


def normalize_clip(src: Path, dst: Path, keyframe: Path) -> dict[str, Any]:
    """Trim, scale, and re-encode to an H.264 MP4 SAM accepts, then extract a keyframe."""
    ff = _ffmpeg()
    subprocess.run(
        [ff, "-y", "-loglevel", "error", "-i", str(src), "-t", str(MAX_SECONDS),
         "-vf", f"scale={TARGET_WIDTH}:-2,fps=15", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-movflags", "+faststart", str(dst)],
        check=True,
    )
    subprocess.run([ff, "-y", "-loglevel", "error", "-ss", "0.5", "-i", str(dst), "-frames:v", "1",
                    "-q:v", "3", str(keyframe)], check=True)
    return probe(dst)


def sample_frames(clip: Path, duration: float, folder: Path, count: int = 3) -> list[Path]:
    """Frames from start, middle and end so the model sees things that appear later (the ball)."""
    ff = _ffmpeg()
    frames = []
    for i in range(count):
        t = max(0.3, min(duration - 0.3, duration * (i + 0.5) / count))
        out = folder / f"sample_{i}.jpg"
        subprocess.run([ff, "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", str(clip), "-frames:v", "1",
                        "-vf", "scale=768:-2", "-q:v", "4", str(out)], check=True)
        frames.append(out)
    return frames


def build_tracks(frames: list[SamFrame], fps: float, width: int, height: int,
                 sample_fps: int = SAMPLE_FPS) -> list[dict[str, Any]]:
    """Convert SAM frames for ONE concept into per object timelines: [{t, poly}] sampled at sample_fps.

    Each SAM object id becomes its own track. Frames without the object are skipped, so the
    browser hides the hotspot while the object is out of view.
    """
    step = max(1, round(fps / sample_fps))
    by_obj: dict[int, list[dict[str, Any]]] = {}
    for frame in frames:
        if frame.index % step:
            continue
        t = round(frame.index / fps, 3)
        for obj in frame.objects:
            mask = decode_mask(obj)
            polys = mask_to_polygons(mask, epsilon_frac=0.006) if mask is not None else []
            poly = polys[0] if polys else box_to_polygon(obj.box, width, height)
            by_obj.setdefault(obj.obj_id, []).append({"t": t, "poly": poly})
    tracks = [{"obj_id": oid, "keys": sorted(keys, key=lambda k: k["t"])} for oid, keys in by_obj.items()]
    # Longest visible track first: it is the main subject for this concept.
    tracks.sort(key=lambda tr: len(tr["keys"]), reverse=True)
    return tracks


async def build_video_scene(raw: bytes, filename: str, *, language: str = "en", person_name: str = "me",
                            narration: str | None = None, created_by: str = "caregiver",
                            progress: Progress | None = None) -> dict[str, Any]:
    async def report(stage: str, **info: Any) -> None:
        if progress:
            await progress(stage, info)

    started = time.time()
    scene_id = store.new_id("v_")
    folder = store.scene_dir(scene_id)
    src = folder / ("source" + (Path(filename).suffix or ".mp4"))
    src.write_bytes(raw)
    clip, keyframe = folder / "clip.mp4", folder / "keyframe.jpg"
    info = await asyncio.to_thread(normalize_clip, src, clip, keyframe)
    src.unlink(missing_ok=True)
    width, height, fps = info["width"], info["height"], info["fps"]
    frame_count = int(info["duration"] * fps) or 1

    await report("understanding", model=meta_client.language_model()["name"])
    samples = await asyncio.to_thread(sample_frames, clip, info["duration"], folder)
    video_rules = (
        f"\nThese are {len(samples)} frames from the start, middle and end of one short video. "
        f"Pick at most {MAX_VIDEO_CONCEPTS} things: ONLY people, pets, and the things they play with or hold "
        "(a ball, a toy, food). Never scenery, plants, buildings, furniture, or vehicles."
    )
    plan = await meta_client.chat_json(
        [{"role": "user", "content": [
            {"type": "text", "text": concept_prompt(language, person_name, narration) + video_rules},
            *[{"type": "image_url", "image_url": {"url": meta_client.image_data_url(f.read_bytes())}} for f in samples],
        ]}],
        CONCEPT_SCHEMA, schema_name="video_plan", reasoning_effort="minimal",
    )
    for f in samples:
        f.unlink(missing_ok=True)
    concepts = plan["concepts"][:MAX_VIDEO_CONCEPTS]

    await report("segmenting", model="SAM 3.1 video", count=len(concepts), labels=[c["label"] for c in concepts])
    file_id = await meta_client.upload_file(clip.read_bytes(), "clip.mp4", "video/mp4")

    async def track(concept: dict) -> tuple[dict, list[dict]]:
        try:
            text = await meta_client.sam_video(file_id, concept["sam_phrase"], frame_count)
        except meta_client.MetaAPIError:
            return concept, []
        return concept, build_tracks(parse_sam_output(text), fps, width, height)

    results = await asyncio.gather(*(track(c) for c in concepts))

    hotspots = []
    for order, (concept, tracks) in enumerate(results):
        if not tracks:
            continue
        main = tracks[0]
        hotspots.append({
            "id": store.new_id("h_"),
            "label": concept["label"], "phrase": concept["phrase"],
            "synonyms": concept.get("synonyms", []), "kind": concept.get("kind", "object"),
            "sam_phrase": concept["sam_phrase"],
            "polygons": [main["keys"][0]["poly"]],  # first visible outline, used for thumbnails and labels
            "track": main["keys"],
            "confidence": None, "order": order,
        })

    await report("voicing", count=len(hotspots))
    await voice_hotspots(hotspots, language, None)

    scene = {
        "id": scene_id, "kind": "video", "title": plan.get("title") or "New moment",
        "media_url": store.media_url(keyframe), "video_url": store.media_url(clip),
        "width": width, "height": height, "duration": info["duration"],
        "language": language, "status": "draft" if created_by == "agent" else "approved",
        "created_by": created_by, "created_at": time.time(),
        "build_seconds": round(time.time() - started, 1),
        "models": [meta_client.language_model()["id"], "sam-3.1"], "hotspots": hotspots,
    }
    store.save_scene(scene)
    await report("done", scene_id=scene_id, seconds=scene["build_seconds"])
    return scene
