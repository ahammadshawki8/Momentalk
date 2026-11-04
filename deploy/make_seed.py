"""Copy the built demo moments into deploy/seed-data so the container starts with them.

    .venv/Scripts/python.exe deploy/make_seed.py

Only moments flagged demo (Unsplash photos, see docs/ASSETS.md) are copied, plus the voice
clips they use and the agent's demo inbox. Placeholders and dev fixtures are skipped.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "backend" / "data"
SEED = ROOT / "deploy" / "seed-data"


def main() -> None:
    if SEED.exists():
        shutil.rmtree(SEED)
    audio_needed: set[str] = set()
    for scene_file in sorted((DATA / "scenes").glob("*/scene.json")):
        scene = json.loads(scene_file.read_text(encoding="utf-8"))
        if not scene.get("demo") or scene.get("placeholder"):
            continue
        shutil.copytree(scene_file.parent, SEED / "scenes" / scene["id"])
        audio_needed |= {Path(h["audio_url"]).name for h in scene["hotspots"] if h.get("audio_url")}
        print(f"{scene['title']}: {len(scene['hotspots'])} words")
    (SEED / "audio").mkdir(parents=True, exist_ok=True)
    for name in sorted(audio_needed):
        if (DATA / "audio" / name).exists():
            shutil.copy(DATA / "audio" / name, SEED / "audio" / name)
    inbox = SEED / "inbox"
    inbox.mkdir(parents=True, exist_ok=True)
    for photo in (DATA / "inbox").glob("m_demo_*.jpg"):
        shutil.copy(photo, inbox / photo.name)
    avatars = SEED / "avatars"
    avatars.mkdir(parents=True, exist_ok=True)
    for drawing in (DATA / "avatars").glob("a_5eed*"):
        shutil.copy(drawing, avatars / drawing.name)
    if (DATA / "prefs.json").exists():
        shutil.copy(DATA / "prefs.json", SEED / "prefs.json")
    print(f"seed ready: {len(audio_needed)} voice clips")


if __name__ == "__main__":
    main()
