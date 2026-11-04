"""Tier 0 reality check for the Meta Model API.

Run one probe at a time and inspect the raw output saved in spikes/out/.

    python spikes/probe.py models
    python spikes/probe.py spark
    python spikes/probe.py sam_image
    python spikes/probe.py sam_point
    python spikes/probe.py sam_video
    python spikes/probe.py voice_file
    python spikes/probe.py voice_realtime
    python spikes/probe.py wonder
    python spikes/probe.py image
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "spikes" / "media"
OUT = ROOT / "spikes" / "out"
OUT.mkdir(parents=True, exist_ok=True)
MEDIA.mkdir(parents=True, exist_ok=True)

load_dotenv(ROOT / ".env")
KEY = os.environ.get("MODEL_API_KEY", "")
BASE = "https://api.meta.ai/v1"
HEADERS = {"Authorization": f"Bearer {KEY}"}

TEST_IMAGE = MEDIA / "test_photo.jpg"
TEST_VIDEO = MEDIA / "test_clip.mp4"
TEST_SPEECH = MEDIA / "test_speech.wav"


def save(name: str, content: str | bytes) -> Path:
    path = OUT / name
    if isinstance(content, bytes):
        path.write_bytes(content)
    else:
        path.write_text(content, encoding="utf-8")
    print(f"saved {path}")
    return path


def data_url(path: Path, mime: str = "image/jpeg") -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def ensure_media() -> None:
    """Build local test media from the brand poster and edge-tts, no external downloads."""
    poster = ROOT / "Momentalk_poster_4_3.png"
    if not TEST_IMAGE.exists():
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(poster), "-vf", "scale=1280:-2", str(TEST_IMAGE)],
            check=True,
        )
    if not TEST_VIDEO.exists():
        # Slow pan across the poster so objects move between frames.
        subprocess.run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(poster),
                "-vf", "scale=1600:-2,crop=1280:720:x='min(t*60,iw-1280)':y=(ih-720)/2,fps=15",
                "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(TEST_VIDEO),
            ],
            check=True,
        )
    if not TEST_SPEECH.exists():
        mp3 = MEDIA / "test_speech.mp3"
        subprocess.run(
            [sys.executable, "-m", "edge_tts", "--voice", "en-US-JennyNeural",
             "--text", "Do you want the ball or the juice? Look, grandma is here with the dog.",
             "--write-media", str(mp3)],
            check=True,
        )
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), "-ac", "1", "-ar", "16000",
             "-c:a", "pcm_s16le", "-map_metadata", "-1", str(TEST_SPEECH)],
            check=True,
        )


def client() -> httpx.Client:
    if not KEY:
        sys.exit("MODEL_API_KEY missing. Put it in .env at the project root.")
    return httpx.Client(base_url=BASE, headers=HEADERS, timeout=120)


def read_sse_text(resp: httpx.Response) -> tuple[str, list[dict]]:
    """Collect output_text deltas from an SSE stream. Returns (text, raw events)."""
    text, events = [], []
    for line in resp.iter_lines():
        if not line.startswith("data:"):
            continue
        payload = line[5:].strip()
        if payload == "[DONE]":
            break
        try:
            event = json.loads(payload)
        except json.JSONDecodeError:
            continue
        events.append(event)
        if event.get("type") == "response.output_text.delta":
            text.append(event.get("delta", ""))
    return "".join(text), events


def probe_models() -> None:
    with client() as c:
        r = c.get("/models")
        print(r.status_code)
        save("models.json", r.text)


def probe_spark() -> None:
    ensure_media()
    schema = {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "concepts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "sam_phrase": {"type": "string"},
                        "label": {"type": "string"},
                        "phrase": {"type": "string"},
                    },
                    "required": ["sam_phrase", "label", "phrase"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["title", "concepts"],
        "additionalProperties": False,
    }
    body = {
        "model": "muse-spark-1.3",
        "messages": [{
            "role": "user",
            "content": [
                {"type": "text", "text": "List up to 8 tappable people or objects in this photo for a picture communication board. sam_phrase is a short noun phrase a segmentation model can find. phrase is a short first person sentence."},
                {"type": "image_url", "image_url": {"url": data_url(TEST_IMAGE)}},
            ],
        }],
        "response_format": {"type": "json_schema", "json_schema": {"name": "scene", "schema": schema, "strict": True}},
        "reasoning_effort": "low",
    }
    with client() as c:
        t = time.time()
        r = c.post("/chat/completions", json=body)
        print(r.status_code, f"{time.time() - t:.1f}s")
        save("spark.json", r.text)


def sam_request(content: list[dict], extra: dict | None = None) -> dict:
    body = {"model": "sam-3.1", "input": [{"type": "message", "role": "user", "content": content}],
            "stream": True, "metadata": {"include_confidence": "true"}}
    if extra:
        body["metadata"].update(extra)
    return body


def probe_sam_image() -> None:
    ensure_media()
    with client() as c:
        for phrase in ["small white dog", "red ball"]:
            body = sam_request([{"type": "input_text", "text": phrase},
                                {"type": "input_image", "image_url": data_url(TEST_IMAGE)}])
            t = time.time()
            with c.stream("POST", "/responses", json=body) as r:
                print(phrase, r.status_code)
                if r.status_code != 200:
                    r.read()
                    save(f"sam_image_{phrase}_error.txt", r.text)
                    continue
                text, events = read_sse_text(r)
            print(f"  {time.time() - t:.1f}s, {len(text)} chars")
            save(f"sam_image_{phrase.replace(' ', '_')}.txt", text)
            save(f"sam_image_{phrase.replace(' ', '_')}_events.json", json.dumps(events[:5], indent=2))


def probe_sam_point() -> None:
    ensure_media()
    # Point roughly on the dog in the 1280 px wide test image.
    from PIL import Image
    w, h = Image.open(TEST_IMAGE).size
    x, y = int(w * 0.41), int(h * 0.78)
    prompt = f"<0f>1<|point;x={x};y={y};w={w};h={h}|>"
    with client() as c:
        body = sam_request([{"type": "input_text", "text": prompt},
                            {"type": "input_image", "image_url": data_url(TEST_IMAGE)}])
        with c.stream("POST", "/responses", json=body) as r:
            print(r.status_code)
            if r.status_code != 200:
                r.read()
                save("sam_point_error.txt", r.text)
                return
            text, _ = read_sse_text(r)
        save("sam_point.txt", text)


def probe_sam_video() -> None:
    ensure_media()
    with client() as c:
        with TEST_VIDEO.open("rb") as f:
            up = c.post("/files", data={"purpose": "user_data"}, files={"file": ("clip.mp4", f, "video/mp4")})
        print("upload", up.status_code)
        save("sam_video_upload.json", up.text)
        if up.status_code != 200:
            return
        file_id = up.json()["id"]
        body = sam_request([{"type": "input_text", "text": "dog"},
                            {"type": "input_video", "file_id": file_id}])
        t = time.time()
        with c.stream("POST", "/responses", json=body) as r:
            print("track", r.status_code)
            if r.status_code != 200:
                r.read()
                save("sam_video_error.txt", r.text)
                return
            text, _ = read_sse_text(r)
        print(f"  {time.time() - t:.1f}s, {text.count(chr(10)) + 1} frame lines")
        save("sam_video.txt", text)


def probe_voice_file() -> None:
    ensure_media()
    request = {"mode": "PUSH_TO_TALK", "model": "muse-voice-transcribe-1.0", "audioEncoding": "WAV"}
    with client() as c:
        t = time.time()
        r = c.post(
            "/asr/transcribe",
            files={
                "request": (None, json.dumps(request), "application/json"),
                "audio": ("speech.wav", TEST_SPEECH.read_bytes(), "audio/wav"),
            },
            headers={"Accept": "application/json"},
        )
        print(r.status_code, f"{time.time() - t:.1f}s")
        save("voice_file.json", r.text)


async def _voice_realtime() -> None:
    import websockets

    ensure_media()
    with wave.open(str(TEST_SPEECH)) as w:
        pcm = w.readframes(w.getnframes())
        rate = w.getframerate()
    log = []
    t0 = time.time()
    async with websockets.connect("wss://api.meta.ai/v1/asr/realtime") as ws:
        await ws.send(json.dumps({
            "authorization": {"accessToken": f"Bearer {KEY}"},
            "audioEncoding": "PCM_16KHZ", "model": "muse-voice-transcribe-1.0",
            "mode": "PUSH_TO_TALK", "partialMode": "CUMULATIVE", "emitAudioProgress": False,
            "keywords": ["ball", "juice", "grandma", "dog"],
        }))
        ack = await ws.recv()
        log.append({"t": 0, "ack": ack})

        async def sender() -> None:
            chunk = int(rate * 0.1) * 2  # 100 ms of 16-bit mono
            for i in range(0, len(pcm), chunk):
                await ws.send(pcm[i:i + chunk])
                await asyncio.sleep(0.1)
            await ws.send(json.dumps({"type": "endStream"}))

        task = asyncio.create_task(sender())
        try:
            async for msg in ws:
                log.append({"t": round(time.time() - t0, 2), "msg": msg})
                print(round(time.time() - t0, 2), msg[:160] if isinstance(msg, str) else "<binary>")
        finally:
            await task
    save("voice_realtime.json", json.dumps(log, indent=2))


def probe_voice_realtime() -> None:
    if not KEY:
        sys.exit("MODEL_API_KEY missing.")
    asyncio.run(_voice_realtime())


def probe_wonder() -> None:
    tools = [{
        "type": "function",
        "function": {
            "name": "propose_scene",
            "description": "Propose a draft communication scene for caregiver approval.",
            "parameters": {
                "type": "object",
                "properties": {"media_id": {"type": "string"}, "reason": {"type": "string"}},
                "required": ["media_id", "reason"],
            },
        },
    }]
    body = {
        "model": "muse-wonder-1.0",
        "messages": [{"role": "user", "content": "Today's media: m1 = blurry photo of the ceiling, m2 = grandma baking cookies with the child, m3 = the child at the park on a swing. Propose scenes worth building for a nonverbal child's communication board."}],
        "tools": tools,
    }
    with client() as c:
        t = time.time()
        r = c.post("/chat/completions", json=body)
        print(r.status_code, f"{time.time() - t:.1f}s")
        save("wonder.json", r.text)


def probe_image() -> None:
    body = {"model": "muse-image-1.0", "prompt": "A friendly flat illustrated child avatar, simple shapes, warm colors, plain background, no text.",
            "n": 1, "size": "1024x1024", "output_format": "png"}
    with client() as c:
        t = time.time()
        r = c.post("/images/generations", json=body)
        print(r.status_code, f"{time.time() - t:.1f}s")
        if r.status_code == 200:
            img = base64.b64decode(r.json()["data"][0]["b64_json"])
            save("image_avatar.png", img)
        else:
            save("image_error.txt", r.text)


PROBES = {
    "models": probe_models, "spark": probe_spark, "sam_image": probe_sam_image,
    "sam_point": probe_sam_point, "sam_video": probe_sam_video, "voice_file": probe_voice_file,
    "voice_realtime": probe_voice_realtime, "wonder": probe_wonder, "image": probe_image,
    "media": ensure_media,
}

if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in PROBES:
        sys.exit(__doc__)
    PROBES[sys.argv[1]]()
