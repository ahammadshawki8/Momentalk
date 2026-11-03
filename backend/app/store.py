"""File based scene store: one folder per scene with scene.json plus media.

Chosen over SQLite for speed of development; the data is small and per device.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .config import settings

SCENES_DIR = settings.data_dir / "scenes"
AUDIO_DIR = settings.data_dir / "audio"
SCENES_DIR.mkdir(parents=True, exist_ok=True)
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

_lock = threading.Lock()


def new_id(prefix: str = "") -> str:
    return prefix + uuid.uuid4().hex[:10]


def scene_dir(scene_id: str) -> Path:
    path = SCENES_DIR / scene_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def save_scene(scene: dict[str, Any]) -> dict[str, Any]:
    scene["updated_at"] = time.time()
    with _lock:
        path = scene_dir(scene["id"]) / "scene.json"
        tmp = path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(scene, indent=2), encoding="utf-8")
        tmp.replace(path)  # atomic, so readers never see a half written file
    return scene


def load_scene(scene_id: str) -> dict[str, Any] | None:
    path = SCENES_DIR / scene_id / "scene.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def list_scenes() -> list[dict[str, Any]]:
    scenes = []
    for path in SCENES_DIR.glob("*/scene.json"):
        scenes.append(json.loads(path.read_text(encoding="utf-8")))
    scenes.sort(key=lambda s: s.get("created_at", 0), reverse=True)
    return scenes


def delete_scene(scene_id: str) -> bool:
    import shutil

    path = SCENES_DIR / scene_id
    if not path.exists():
        return False
    shutil.rmtree(path)
    return True


def media_url(path: Path) -> str:
    return "/media/" + path.relative_to(settings.data_dir).as_posix()
