"""Live Modeling: caregiver speech makes matching hotspots pulse.

Browser  --(16 kHz s16le PCM, binary frames)-->  this proxy  --(Meta realtime ASR)-->  transcripts
Browser  <--({"type":"heard","hotspot_ids":[...]})--  local LiveMatcher  <--  transcripts

The API key never leaves the server. A text frame {"type":"say","text":"..."} feeds the
matcher directly, which lets the pipeline be tested without a microphone or API key.
"""

from __future__ import annotations

import asyncio
import json

import websockets
from fastapi import WebSocket, WebSocketDisconnect

from . import store
from .config import settings
from .cost import PRICES
from .matcher import HotspotTerms, LiveMatcher
from .meta_client import ledger

META_ASR_URL = "wss://api.meta.ai/v1/asr/realtime"
LANGUAGE_NAMES = {"en": "English", "es": "Spanish", "hi": "Hindi", "bn": "Bengali", "ar": "Arabic", "fr": "French"}


def build_matcher(scene: dict) -> tuple[LiveMatcher, list[str]]:
    terms = []
    keywords: list[str] = []
    for h in scene["hotspots"]:
        words = [h["label"], *h.get("synonyms", [])]
        terms.append(HotspotTerms(h["id"], words))
        keywords.extend(words)
    return LiveMatcher(terms), sorted(set(k for k in keywords if k))[:100]


async def live_session(ws: WebSocket, scene_id: str) -> None:
    await ws.accept()
    scene = store.load_scene(scene_id)
    if not scene:
        await ws.send_json({"type": "error", "message": "Scene not found"})
        await ws.close()
        return
    matcher, keywords = build_matcher(scene)

    async def emit_hits(text: str, final: bool) -> None:
        hits = matcher.feed(text)
        await ws.send_json({"type": "transcript", "text": text, "final": final})
        if hits:
            await ws.send_json({"type": "heard", "hotspot_ids": hits})
        if final:
            matcher.reset_turn()

    if not settings.has_api_key:
        await ws.send_json({"type": "status", "state": "offline",
                            "message": "Meta API key missing: only typed test phrases work."})
        try:
            while True:
                msg = await ws.receive()
                if msg.get("text"):
                    data = json.loads(msg["text"])
                    if data.get("type") == "say":
                        await emit_hits(data.get("text", ""), True)
                elif msg.get("type") == "websocket.disconnect":
                    return
        except WebSocketDisconnect:
            return

    ledger.check()
    handshake = {
        "authorization": {"accessToken": f"Bearer {settings.model_api_key}"},
        "audioEncoding": "PCM_16KHZ",
        "model": settings.voice_model,
        "mode": "ENDPOINTING",
        "partialMode": "CUMULATIVE",
        "emitAudioProgress": False,
        "keywords": keywords,
        "languageBias": [LANGUAGE_NAMES.get(scene.get("language", "en"), "English")],
    }
    audio_bytes = 0
    try:
        async with websockets.connect(META_ASR_URL, max_size=None) as meta:
            await meta.send(json.dumps(handshake))
            ack = json.loads(await asyncio.wait_for(meta.recv(), timeout=10))
            await ws.send_json({"type": "status", "state": "listening", "session": ack.get("sessionId")})

            async def browser_to_meta() -> None:
                nonlocal audio_bytes
                while True:
                    msg = await ws.receive()
                    if msg.get("bytes"):
                        audio_bytes += len(msg["bytes"])
                        await meta.send(msg["bytes"])
                    elif msg.get("text"):
                        data = json.loads(msg["text"])
                        if data.get("type") == "say":
                            await emit_hits(data.get("text", ""), True)
                        elif data.get("type") == "stop":
                            await meta.send(json.dumps({"type": "endStream"}))
                            return
                    elif msg.get("type") == "websocket.disconnect":
                        await meta.send(json.dumps({"type": "endStream"}))
                        return

            async def meta_to_browser() -> None:
                async for raw in meta:
                    if not isinstance(raw, str):
                        continue
                    event = json.loads(raw)
                    kind = event.get("type")
                    if kind == "transcript":
                        await emit_hits(event.get("transcript", ""), bool(event.get("final")))
                    elif kind == "speechComplete":
                        await emit_hits(event.get("transcript", ""), True)
                    elif kind == "speechStart":
                        matcher.reset_turn()
                    elif kind == "error":
                        await ws.send_json({"type": "error", "message": event.get("message", "ASR error")})

            sender = asyncio.create_task(browser_to_meta())
            receiver = asyncio.create_task(meta_to_browser())
            done, pending = await asyncio.wait({sender, receiver}, return_when=asyncio.FIRST_COMPLETED)
            if sender in done:
                # Let final transcripts drain briefly after the caregiver stops.
                try:
                    await asyncio.wait_for(receiver, timeout=3)
                except asyncio.TimeoutError:
                    receiver.cancel()
            for task in pending:
                task.cancel()
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "message": f"Live listening stopped: {type(exc).__name__}"})
        except Exception:
            pass
    finally:
        seconds = audio_bytes / 32000  # 16 kHz * 2 bytes
        if seconds:
            ledger.record("voice", PRICES["voice_per_hour"] * seconds / 3600)
