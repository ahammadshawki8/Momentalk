"""Package Momentalk and deploy it to a Hugging Face Docker Space.

Run from the project root after `hf auth login`:

    .venv/Scripts/python.exe deploy/deploy_space.py

It builds the web app, bundles the demo moments, creates (or updates) the Space
`<your-username>/momentalk`, stores MODEL_API_KEY from .env as a Space secret (never
printed, never uploaded as a file), and uploads the bundle.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "deploy" / "space"
DATA = ROOT / "backend" / "data"
SPACE_NAME = "momentalk"

SPACE_README = """---
title: Momentalk
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Everyday photos become a voice for people who cannot rely on speech
---

# Momentalk

Every moment has a story. Momentalk turns everyday photos into a voice for people who cannot rely on speech.

Built with Meta SAM 3.1, Muse Spark, Muse Voice Transcribe, Muse Wonder and Muse Image.
Source code: https://github.com/ahammadshawki8/Momentalk
"""


def read_env_key(name: str) -> str:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip()
    return ""


def build_bundle() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    print("building web app")
    npx = "npx.cmd" if sys.platform == "win32" else "npx"
    subprocess.run([npx, "vite", "build"], cwd=ROOT / "frontend", check=True)
    shutil.copytree(ROOT / "frontend" / "dist", OUT / "frontend-dist")

    print("copying backend")
    shutil.copytree(ROOT / "backend", OUT / "backend",
                    ignore=shutil.ignore_patterns("data", "__pycache__", ".pytest_cache", "tests"))
    shutil.copy(ROOT / "deploy" / "Dockerfile", OUT / "Dockerfile")
    (OUT / "README.md").write_text(SPACE_README, encoding="utf-8")

    print("bundling demo moments")
    seed = OUT / "seed-data"
    audio_needed: set[str] = set()
    for scene_file in (DATA / "scenes").glob("*/scene.json"):
        scene = json.loads(scene_file.read_text(encoding="utf-8"))
        if not scene.get("demo") or scene.get("placeholder"):
            continue
        shutil.copytree(scene_file.parent, seed / "scenes" / scene["id"])
        for h in scene["hotspots"]:
            if h.get("audio_url"):
                audio_needed.add(Path(h["audio_url"]).name)
        print(f"  {scene['title']}: {len(scene['hotspots'])} words")
    (seed / "audio").mkdir(parents=True, exist_ok=True)
    for name in audio_needed:
        src = DATA / "audio" / name
        if src.exists():
            shutil.copy(src, seed / "audio" / name)
    if (DATA / "inbox").exists():
        shutil.copytree(DATA / "inbox", seed / "inbox", ignore=shutil.ignore_patterns("m_[!d]*"))
    if (DATA / "prefs.json").exists():
        shutil.copy(DATA / "prefs.json", seed / "prefs.json")


def deploy() -> None:
    from huggingface_hub import HfApi

    api = HfApi()
    user = api.whoami()["name"]
    repo_id = f"{user}/{SPACE_NAME}"
    print(f"deploying to https://huggingface.co/spaces/{repo_id}")
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", exist_ok=True)
    key = read_env_key("MODEL_API_KEY")
    if not key:
        sys.exit("MODEL_API_KEY missing in .env")
    api.add_space_secret(repo_id, "MODEL_API_KEY", key)
    for optional in ("OPEN_WEIGHTS_API_KEY", "OPEN_WEIGHTS_BASE_URL", "OPEN_WEIGHTS_MODEL", "OPEN_WEIGHTS_PROVIDER"):
        value = read_env_key(optional)
        if value:
            api.add_space_secret(repo_id, optional, value)
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(OUT),
                      commit_message="Deploy Momentalk")
    print(f"done. App URL: https://{user}-{SPACE_NAME}.hf.space  (first build takes a few minutes)")


if __name__ == "__main__":
    build_bundle()
    if "--bundle-only" not in sys.argv:
        deploy()
