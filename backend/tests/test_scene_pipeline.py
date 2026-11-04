import asyncio
import io

from PIL import Image

from app import store
from app.pipelines import scene as scene_pipeline


def photo_bytes(w=400, h=300):
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 180, 90)).save(buf, format="JPEG")
    return buf.getvalue()


def test_build_photo_scene_end_to_end_with_mocked_models(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "SCENES_DIR", tmp_path / "scenes")
    monkeypatch.setattr(store, "AUDIO_DIR", tmp_path / "audio")

    async def fake_chat_json(messages, schema, **kw):
        return {"title": "Park day", "concepts": [
            {"sam_phrase": "big dog", "label": "Biscuit", "phrase": "I love Biscuit", "synonyms": ["dog"], "kind": "animal"},
            {"sam_phrase": "red ball", "label": "Ball", "phrase": "Throw the ball", "synonyms": ["ball"], "kind": "object"},
            {"sam_phrase": "unicorn", "label": "Unicorn", "phrase": "A unicorn", "synonyms": [], "kind": "object"},
        ]}

    async def fake_sam(image, prompt, mime="image/jpeg"):
        boxes = {
            "big dog": "<0f>0<|box;x1=40;y1=60;x2=240;y2=260;w=400;h=300;c=0.93|>",
            "red ball": "<0f>0<|box;x1=250;y1=200;x2=290;y2=240;w=400;h=300;c=0.88|>,1<|box;x1=10;y1=10;x2=20;y2=20;w=400;h=300;c=0.2|>",
            "unicorn": "",
        }
        return boxes[prompt]

    async def fake_tts(text, cache_dir, language="en", voice=None):
        cache_dir.mkdir(parents=True, exist_ok=True)
        path = cache_dir / f"{abs(hash(text))}.mp3"
        path.write_bytes(b"mp3")
        return path

    monkeypatch.setattr(scene_pipeline.meta_client, "chat_json", fake_chat_json)
    monkeypatch.setattr(scene_pipeline.meta_client, "sam_image", fake_sam)
    monkeypatch.setattr(scene_pipeline.tts, "synthesize", fake_tts)
    monkeypatch.setattr(store, "media_url", lambda p: "/media/" + p.name)

    stages = []

    async def progress(stage, info):
        stages.append(stage)

    scene = asyncio.run(scene_pipeline.build_photo_scene(photo_bytes(), person_name="Maya", progress=progress))

    assert stages == ["understanding", "segmenting", "voicing", "done"]
    assert scene["title"] == "Park day"
    labels = [h["label"] for h in scene["hotspots"]]
    assert labels == ["Biscuit", "Ball"]  # unicorn not found by SAM is dropped; big first, small on top
    ball = scene["hotspots"][1]
    assert ball["confidence"] == 0.88  # most confident object chosen when SAM finds several
    xs = [x for x, _ in ball["polygons"][0]]
    assert min(xs) == 250 / 400 and max(xs) == 290 / 400
    assert all(h["audio_url"].endswith(".mp3") for h in scene["hotspots"])
    assert store.load_scene(scene["id"])["hotspots"][0]["label"] == "Biscuit"


def test_fallback_phrases_keep_the_thing_not_the_location():
    from app.pipelines.scene import fallback_phrases
    assert fallback_phrases("long stick in the foreground") == ["long stick in the foreground", "long stick", "stick"]
    assert fallback_phrases("black and white dog") == ["black and white dog", "white dog", "dog"]
    assert fallback_phrases("girl on the left holding a cup") == ["girl on the left holding a cup", "girl"]
    assert "foreground" not in fallback_phrases("foreground grass")
