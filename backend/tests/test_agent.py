import asyncio
import json

from PIL import Image

from app import agent, store


def tool_call(call_id, name, args):
    return {"id": call_id, "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}


def reply(*calls, content=None):
    return {"choices": [{"message": {"role": "assistant", "content": content, "tool_calls": list(calls) or None}}]}


def test_moment_builder_builds_drafts_and_finishes(tmp_path, monkeypatch):
    monkeypatch.setattr(agent, "INBOX", tmp_path)
    Image.new("RGB", (64, 48), (200, 120, 40)).save(tmp_path / "m_one.jpg")
    Image.new("RGB", (64, 48), (10, 10, 10)).save(tmp_path / "m_two.jpg")

    script = iter([
        reply(tool_call("c1", "list_todays_media", {}), content="Let me see what was captured."),
        reply(tool_call("c2", "look_at_media", {"media_id": "m_one"}), tool_call("c3", "look_at_media", {"media_id": "m_two"})),
        reply(tool_call("c4", "get_tap_stats", {})),
        reply(tool_call("c5", "build_draft_moment", {"media_id": "m_one", "title": "Baking", "reason": "Nana baked with Maya."})),
        reply(tool_call("c6", "finish", {"note": "Made one moment. Model the word cookie."})),
    ])
    seen_messages = []

    async def fake_chat(messages, **kwargs):
        seen_messages.append(list(messages))
        if kwargs.get("tools"):
            return next(script)
        return {"choices": [{"message": {"content": "A clear photo of baking."}}]}

    built = []

    async def fake_build(raw, **kwargs):
        built.append(kwargs)
        scene = {"id": store.new_id("s_"), "title": "x", "hotspots": [{"label": "Cookie"}], "status": "draft",
                 "created_at": 0, "kind": "photo"}
        return scene

    saved = []
    monkeypatch.setattr(agent.meta_client, "chat", fake_chat)
    monkeypatch.setattr(agent, "build_photo_scene", fake_build)
    monkeypatch.setattr(agent.store, "save_scene", lambda s: saved.append(s) or s)
    monkeypatch.setattr(agent, "list_media", lambda: [{"media_id": "m_one"}, {"media_id": "m_two"}])
    monkeypatch.setattr(agent, "tap_stats", lambda: {"most_tapped": [], "never_tapped": ["Cookie"]})
    monkeypatch.setattr(agent, "RUNS_DIR", tmp_path / "runs")

    run = asyncio.run(agent.run_moment_builder("Maya"))

    assert run["note"] == "Made one moment. Model the word cookie."
    assert len(run["drafts"]) == 1
    assert built[0]["created_by"] == "agent"  # drafts only, caregiver approves
    assert saved[0]["agent_note"] == "Nana baked with Maya."
    assert saved[0]["source_media"] == "m_one"
    tools_used = [t["tool"] for t in run["trace"] if t["kind"] == "tool"]
    assert tools_used == ["list_todays_media", "look_at_media", "look_at_media", "get_tap_stats", "build_draft_moment", "finish"]
    # Every tool call got a matching tool result message back to the model.
    last = seen_messages[-1]
    assert {m["tool_call_id"] for m in last if m.get("role") == "tool"} >= {"c1", "c2", "c3", "c4", "c5"}


def test_inbox_lists_photos_and_videos_and_refuses_bad_ids(tmp_path, monkeypatch):
    from app import agent, store

    monkeypatch.setattr(agent, "INBOX", tmp_path)
    monkeypatch.setattr(store, "SCENES_DIR", tmp_path / "scenes")
    (tmp_path / "m_aaa.jpg").write_bytes(b"jpg")
    (tmp_path / "m_bbb.mov").write_bytes(b"mov")
    (tmp_path / "notes.txt").write_text("ignored")
    items = {m["media_id"]: m["kind"] for m in agent.list_media()}
    assert items == {"m_aaa": "photo", "m_bbb": "video"}
    assert agent.media_path("m_bbb").name == "m_bbb.mov"
    assert agent.media_path("../secret") is None
    assert agent.media_path("m_missing") is None
