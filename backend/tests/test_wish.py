import asyncio

from app import store
from app.pipelines import wish


def _patch(tmp_path, monkeypatch):
    monkeypatch.setattr(store, "SCENES_DIR", tmp_path / "scenes")

    async def fake_edit(prompt, images):
        return b"wish-image"

    async def fake_build(image, **kw):
        return {"id": store.new_id("s_"), "kind": "photo", "title": "x", "status": "approved", "models": ["muse-spark-1.3"]}

    monkeypatch.setattr(wish.meta_client, "image_edit", fake_edit)
    monkeypatch.setattr(wish, "build_photo_scene", fake_build)


def _place(status):
    place = {"id": store.new_id("s_"), "kind": "photo", "status": status}
    folder = store.scene_dir(place["id"])
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "photo.jpg").write_bytes(b"jpg")
    return store.save_scene(place)


def test_wish_is_a_draft_and_keeps_an_approved_place(tmp_path, monkeypatch):
    _patch(tmp_path, monkeypatch)
    place = _place("approved")
    made = asyncio.run(wish.build_wish_scene(place, "flying a kite", person_name="Raya", language="en"))
    assert made["status"] == "draft" and made["kind"] == "wish"
    assert store.load_scene(place["id"]) is not None


def test_wish_replaces_a_draft_place(tmp_path, monkeypatch):
    _patch(tmp_path, monkeypatch)
    place = _place("draft")
    made = asyncio.run(wish.build_wish_scene(place, "baking", person_name="Raya", language="en", replace_source=True))
    assert made["status"] == "draft"
    assert store.load_scene(place["id"]) is None
    assert store.load_scene(made["id"]) is not None
