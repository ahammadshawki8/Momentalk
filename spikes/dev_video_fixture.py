"""Dev only: build a placeholder video scene to exercise the tracked overlay UI without the API.

Pans across the park photo and writes a synthetic track that follows the dogs box. The scene is
flagged placeholder and lives in backend/data (gitignored). Real tracks come from SAM 3.1.

    ..\\.venv\\Scripts\\python.exe ..\\spikes\\dev_video_fixture.py   (run from backend/)
"""

import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from PIL import Image  # noqa: E402

from app import store  # noqa: E402
from app.pipelines.video import normalize_clip  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PHOTO = ROOT / "demo-assets" / "unsplash" / "park.jpg"
W, H, SECONDS, FPS = 1200, 800, 6, 15


def main() -> None:
    src_w, src_h = Image.open(PHOTO).size
    travel = src_w - W
    folder = store.scene_dir("v_dev_park")
    raw = folder / "raw.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(PHOTO),
         "-vf", f"crop={W}:{H}:x='t/{SECONDS}*{travel}':y={(src_h - H) // 2},fps={FPS}",
         "-t", str(SECONDS), "-c:v", "libx264", "-pix_fmt", "yuv420p", str(raw)],
        check=True,
    )
    info = normalize_clip(raw, folder / "clip.mp4", folder / "keyframe.jpg")
    raw.unlink()

    # Dogs box in source pixels (approximate, placeholder only).
    bx1, by1, bx2, by2 = 0.24 * src_w, 0.36 * src_h, 0.62 * src_w, 0.66 * src_h
    keys = []
    for i in range(SECONDS * 10 + 1):
        t = i / 10
        off_x, off_y = t / SECONDS * travel, (src_h - H) // 2
        x1, x2 = (bx1 - off_x) / W, (bx2 - off_x) / W
        y1, y2 = (by1 - off_y) / H, (by2 - off_y) / H
        if x2 < 0.02:
            continue
        x1 = max(0.0, x1)
        keys.append({"t": round(t, 2), "poly": [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]})

    store.save_scene({
        "id": "v_dev_park", "kind": "video", "title": "Dogs at the park (dev)", "placeholder": True,
        "media_url": store.media_url(folder / "keyframe.jpg"), "video_url": store.media_url(folder / "clip.mp4"),
        "width": info["width"], "height": info["height"], "duration": info["duration"],
        "language": "en", "status": "approved", "created_by": "caregiver", "created_at": time.time(),
        "models": [], "hotspots": [{
            "id": "h_dev_dogs", "label": "Dogs", "phrase": "Look at the doggies!", "synonyms": ["dog", "dogs"],
            "kind": "animal", "sam_phrase": "dogs", "polygons": [keys[0]["poly"]], "track": keys,
            "confidence": None, "order": 0,
        }],
    })
    print(f"dev video scene ready: {info}")


if __name__ == "__main__":
    main()
