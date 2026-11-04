"""Guards for the public live demo (Hugging Face Space).

Judges share one instance, so in public mode:
- the demo moments are read only (nobody can delete or rewrite them for everyone else),
- model work is rate limited per visitor so a stranger cannot spend the whole credit,
- on first boot the bundled demo data is copied into the empty data folder.
"""

from __future__ import annotations

import os
import shutil
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import HTTPException, Request

from .config import settings

PUBLIC = os.environ.get("MOMENTALK_PUBLIC") == "1"
BUILDS_PER_HOUR = int(os.environ.get("MOMENTALK_BUILDS_PER_HOUR", "6"))
SEED_DIR = Path(os.environ.get("MOMENTALK_SEED_DIR", "/app/seed-data"))

_hits: dict[str, deque[float]] = defaultdict(deque)


def bootstrap_data() -> None:
    """Copy the bundled demo into an empty data folder (fresh container).

    In the public demo the sample moments are read only, so the bundled copies are always laid back
    on top: a redeploy with a newer seed updates them even when Postgres restored older ones.
    """
    if not SEED_DIR.exists():
        return
    scenes = settings.data_dir / "scenes"
    if not any(scenes.glob("*/scene.json")):
        shutil.copytree(SEED_DIR, settings.data_dir, dirs_exist_ok=True)
    elif PUBLIC:
        for part in ("scenes", "audio", "inbox"):
            if (SEED_DIR / part).exists():
                shutil.copytree(SEED_DIR / part, settings.data_dir / part, dirs_exist_ok=True)


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "unknown")


def limit_model_work(request: Request) -> None:
    """Allow BUILDS_PER_HOUR model heavy requests per visitor in public mode."""
    if not PUBLIC:
        return
    now = time.time()
    hits = _hits[client_ip(request)]
    while hits and now - hits[0] > 3600:
        hits.popleft()
    if len(hits) >= BUILDS_PER_HOUR:
        raise HTTPException(429, "This live demo allows a few new moments per hour per visitor. Try again soon.")
    hits.append(now)


def protect_demo_scene(scene: dict) -> None:
    if PUBLIC and scene.get("demo"):
        raise HTTPException(403, "Sample moments are read only in the live demo. Snap your own moment to edit it.")
