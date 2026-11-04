"""Caregiver preferences that persist on this device (person profile, Private Mode)."""

from __future__ import annotations

import json
from typing import Any

from .config import settings

PATH = settings.data_dir / "prefs.json"

DEFAULTS: dict[str, Any] = {
    "person_name": "Raya",
    "language": "en",
    "voice": None,
    "private_mode": False,
}


def load() -> dict[str, Any]:
    if PATH.exists():
        return {**DEFAULTS, **json.loads(PATH.read_text(encoding="utf-8"))}
    return dict(DEFAULTS)


def save(update: dict[str, Any]) -> dict[str, Any]:
    current = load()
    current.update({k: v for k, v in update.items() if k in DEFAULTS})
    tmp = PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(current, indent=2), encoding="utf-8")
    tmp.replace(PATH)
    return current
