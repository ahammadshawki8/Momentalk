"""Text to speech with edge-tts (free, no key). Meta has no TTS model.

Audio is cached on disk by a hash of (voice, text), so each phrase is synthesized once.
The free service rate limits bursts, so calls are throttled and retried; if it still fails,
the caller keeps the hotspot without audio and the browser speaks it with its own voice.
"""

from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path

import edge_tts

# One warm, clear default voice per supported language. Expand as needed.
VOICES = {
    "en": "en-US-AnaNeural",
    "es": "es-MX-DaliaNeural",
    "hi": "hi-IN-SwaraNeural",
    "bn": "bn-BD-NabanitaNeural",
    "ar": "ar-EG-SalmaNeural",
    "fr": "fr-FR-DeniseNeural",
}

_SLOTS = asyncio.Semaphore(3)


def voice_for(language: str, voice: str | None = None) -> str:
    return voice or VOICES.get(language, VOICES["en"])


async def synthesize(text: str, cache_dir: Path, language: str = "en", voice: str | None = None) -> Path:
    voice_name = voice_for(language, voice)
    key = hashlib.sha256(f"{voice_name}|{text}".encode()).hexdigest()[:24]
    cache_dir.mkdir(parents=True, exist_ok=True)
    path = cache_dir / f"{key}.mp3"
    if path.exists():
        return path
    delay = 1.0
    async with _SLOTS:
        for attempt in range(4):
            try:
                tmp = path.with_suffix(f".{attempt}.tmp")
                await edge_tts.Communicate(text, voice_name).save(str(tmp))
                tmp.replace(path)
                return path
            except Exception:
                if attempt == 3:
                    raise
                await asyncio.sleep(delay)
                delay *= 2
    return path
