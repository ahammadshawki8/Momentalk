"""Narrated Labels: the caregiver describes a moment out loud and Momentalk uses their words.

"This is Nana, she makes pancakes" becomes a label "Nana" with the phrase "Hi Nana!" on the
right outline. Voice Transcribe turns speech into text (biased toward the moment's labels),
Muse Spark maps the narration onto existing hotspots, and nothing changes until the caregiver
confirms the proposals.
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

from .. import meta_client, store, tts

PROPOSAL_SCHEMA = {
    "type": "object",
    "properties": {
        "changes": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "hotspot_id": {"type": "string"},
                    "label": {"type": "string"},
                    "phrase": {"type": "string"},
                    "why": {"type": "string", "description": "Which words from the narration justify this"},
                },
                "required": ["hotspot_id", "label", "phrase", "why"],
            },
        },
        "title": {"type": "string", "description": "Better moment title if the narration suggests one, else empty"},
    },
    "required": ["changes", "title"],
}


def to_wav(raw: bytes, suffix: str) -> bytes:
    """Any browser recording (webm, ogg, mp4, wav) to 16 kHz mono 16-bit WAV."""
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError("ffmpeg is required for narration")
    with tempfile.TemporaryDirectory() as tmp:
        src, dst = Path(tmp) / f"in{suffix or '.webm'}", Path(tmp) / "out.wav"
        src.write_bytes(raw)
        subprocess.run([ff, "-y", "-loglevel", "error", "-i", str(src), "-ac", "1", "-ar", "16000",
                        "-c:a", "pcm_s16le", "-map_metadata", "-1", str(dst)], check=True)
        return dst.read_bytes()


async def propose_from_narration(scene: dict[str, Any], audio: bytes, filename: str) -> dict[str, Any]:
    wav = await asyncio.to_thread(to_wav, audio, Path(filename).suffix)
    keywords = [h["label"] for h in scene["hotspots"]]
    transcript = (await meta_client.transcribe_wav(wav, keywords=keywords)).get("transcript", "").strip()
    if not transcript:
        return {"transcript": "", "changes": [], "title": ""}

    hotspots = [{"hotspot_id": h["id"], "label": h["label"], "phrase": h["phrase"], "kind": h.get("kind")}
                for h in scene["hotspots"]]
    plan = await meta_client.chat_json(
        [{"role": "user", "content": [
            {"type": "text", "text": (
                "A caregiver described this photo for a talking picture board. Use their names and words.\n"
                f"Narration: \"{transcript}\"\n"
                f"Current hotspots: {hotspots}\n"
                "Propose changes ONLY where the narration clearly refers to a hotspot (for example a person's name). "
                "Keep labels 1 to 3 words, phrases short and first person. Language code: " + scene.get("language", "en"))},
            {"type": "image_url", "image_url": {"url": meta_client.image_data_url(
                (store.scene_dir(scene["id"]) / ("photo.jpg" if scene["kind"] != "video" else "keyframe.jpg")).read_bytes())}},
        ]}],
        PROPOSAL_SCHEMA, schema_name="narration_plan",
    )
    valid = {h["id"] for h in scene["hotspots"]}
    changes = [c for c in plan.get("changes", []) if c.get("hotspot_id") in valid]
    return {"transcript": transcript, "changes": changes, "title": plan.get("title", "")}


async def apply_changes(scene: dict[str, Any], changes: list[dict[str, Any]], title: str | None) -> dict[str, Any]:
    by_id = {h["id"]: h for h in scene["hotspots"]}
    for change in changes:
        h = by_id.get(change.get("hotspot_id"))
        if not h:
            continue
        h["label"] = change.get("label") or h["label"]
        if change.get("phrase") and change["phrase"] != h["phrase"]:
            h["phrase"] = change["phrase"]
            path = await tts.synthesize(h["phrase"], store.AUDIO_DIR, scene.get("language", "en"))
            h["audio_url"] = store.media_url(path)
        if h["label"].lower() not in [s.lower() for s in h.get("synonyms", [])]:
            h.setdefault("synonyms", []).append(h["label"].lower())
    if title:
        scene["title"] = title
    return store.save_scene(scene)
