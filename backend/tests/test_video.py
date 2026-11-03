from pathlib import Path

import pytest

from app.pipelines.video import build_tracks, normalize_clip
from app.sam_format import parse_sam_output

ROOT = Path(__file__).resolve().parents[2]
CLIP = ROOT / "spikes" / "media" / "test_clip.mp4"


def test_build_tracks_samples_frames_and_keeps_identity():
    lines = []
    for f in range(0, 30):
        x = 10 + f
        objs = [f"0<|box;x1={x};y1=10;x2={x + 20};y2=40;w=200;h=100|>"]
        if f >= 15:
            objs.append(f"3<|box;x1=150;y1=50;x2=180;y2=90;w=200;h=100|>")
        lines.append(f"<{f}f>" + ",".join(objs))
    tracks = build_tracks(parse_sam_output("\n".join(lines)), fps=30, width=200, height=100, sample_fps=10)
    assert [t["obj_id"] for t in tracks] == [0, 3]  # longest track first
    main = tracks[0]["keys"]
    assert [k["t"] for k in main] == pytest.approx([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
    # The box moves right over time and polygons stay normalized.
    assert main[0]["poly"][0][0] < main[-1]["poly"][0][0]
    assert all(0 <= x <= 1 and 0 <= y <= 1 for k in main for x, y in k["poly"])
    assert tracks[1]["keys"][0]["t"] == pytest.approx(0.5)


@pytest.mark.skipif(not CLIP.exists(), reason="spike clip not generated")
def test_normalize_clip_produces_h264_and_keyframe(tmp_path):
    info = normalize_clip(CLIP, tmp_path / "clip.mp4", tmp_path / "key.jpg")
    assert info["width"] == 960
    assert info["duration"] > 0
    assert (tmp_path / "key.jpg").stat().st_size > 1000
