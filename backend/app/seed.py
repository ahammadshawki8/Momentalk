"""Seed demo moments from the licensed photos in demo-assets/unsplash (see docs/ASSETS.md).

    python -m app.seed           # photos only, no outlines yet (works without an API key)
    python -m app.seed --build   # run every photo through the real pipeline (Spark, SAM 3.1, voice)
"""

from __future__ import annotations

import asyncio
import sys
import time

from . import store
from .config import PROJECT_ROOT
from .pipelines.scene import build_photo_scene, prepare_image

PHOTOS = PROJECT_ROOT / "demo-assets" / "unsplash"

# Newest first in the album: (file, title, caregiver narration that personalizes labels)
DEMO = [
    ("toys.jpg", "Toy box", "Maya's toy box. Her favorite is the sock monkey, she calls him Mr. Stripes."),
    ("park.jpg", "Park with Biscuit", "At the park. The black and white dog is our dog Biscuit, the white one is his friend Pip."),
    ("nana.jpg", "Nana", "This is Nana. She always gives a thumbs up."),
    ("birthday.jpg", "Birthday", "Maya's birthday cake with candles."),
    ("breakfast.jpg", "Breakfast", "Pancakes for breakfast."),
]


def clear_demo() -> None:
    for scene in store.list_scenes():
        if scene["id"].startswith("s_demo") or scene.get("demo"):
            store.delete_scene(scene["id"])


async def seed_photos_only() -> None:
    now = time.time()
    for i, (file, title, _) in enumerate(DEMO):
        image, width, height = prepare_image((PHOTOS / file).read_bytes())
        scene_id = f"s_demo_{file.split('.')[0]}"
        folder = store.scene_dir(scene_id)
        (folder / "photo.jpg").write_bytes(image)
        store.save_scene({
            "id": scene_id, "kind": "photo", "title": title, "placeholder": True, "demo": True,
            "media_url": store.media_url(folder / "photo.jpg"), "width": width, "height": height,
            "language": "en", "status": "approved", "created_by": "caregiver",
            "created_at": now - i * 3600, "models": [], "hotspots": [],
        })
        print(f"seeded photo {scene_id}")


async def seed_built() -> None:
    for file, title, narration in reversed(DEMO):  # oldest first so the album order matches DEMO
        scene = await build_photo_scene((PHOTOS / file).read_bytes(), person_name="Maya", narration=narration)
        scene.update({"title": title, "demo": True})
        store.save_scene(scene)
        print(f"built {scene['id']} '{title}': {len(scene['hotspots'])} hotspots in {scene['build_seconds']}s")


def seed_inbox() -> None:
    """Today's photos for the Moment Builder agent demo."""
    from .agent import INBOX

    for old in INBOX.glob("m_demo_*.jpg"):
        old.unlink()
    for path in sorted(PHOTOS.glob("inbox_*.jpg")):
        image, _, _ = prepare_image(path.read_bytes())
        (INBOX / f"m_demo_{path.stem.removeprefix('inbox_')}.jpg").write_bytes(image)
        print(f"inbox {path.name}")


async def rebuild_one(file: str) -> None:
    """Rebuild a single demo moment, e.g. python -m app.seed --only park.jpg"""
    title, narration = next((t, n) for f, t, n in DEMO if f == file)
    for scene in store.list_scenes():
        if scene.get("demo") and scene["title"] == title:
            store.delete_scene(scene["id"])
    scene = await build_photo_scene((PHOTOS / file).read_bytes(), person_name="Maya", narration=narration)
    scene.update({"title": title, "demo": True})
    store.save_scene(scene)
    print(f"built '{title}': {[h['label'] for h in scene['hotspots']]} not found: {scene.get('not_found')}")


async def main() -> None:
    if "--only" in sys.argv:
        await rebuild_one(sys.argv[sys.argv.index("--only") + 1])
        return
    clear_demo()
    seed_inbox()
    if "--build" in sys.argv:
        await seed_built()
    else:
        await seed_photos_only()


if __name__ == "__main__":
    asyncio.run(main())
