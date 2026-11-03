"""Moment Builder: a Muse Wonder agent that turns the day's photos into draft moments.

The agent looks at what was captured today, decides which photos are worth a talking scene,
builds them, and writes the caregiver a short note of words to model, based on what the person
has been tapping. Every scene it makes is a DRAFT: nothing reaches the person until a caregiver
approves it (verifiable agent pattern). The full trace is kept so the caregiver can see why.
"""

from __future__ import annotations

import json
import time
from collections import Counter
from typing import Any, Awaitable, Callable

from . import meta_client, store
from .config import settings
from .pipelines.scene import build_photo_scene, prepare_image

INBOX = settings.data_dir / "inbox"
INBOX.mkdir(parents=True, exist_ok=True)
RUNS_DIR = settings.data_dir / "agent_runs"
MAX_STEPS = 14
MAX_SCENES = 3

Progress = Callable[[str, dict], Awaitable[None]]

TOOLS = [
    {"type": "function", "function": {
        "name": "list_todays_media",
        "description": "List photos captured today that are not yet moments.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "look_at_media",
        "description": "Get a short description of one photo: who and what is in it, and how clear it is.",
        "parameters": {"type": "object", "properties": {"media_id": {"type": "string"}}, "required": ["media_id"]}}},
    {"type": "function", "function": {
        "name": "get_tap_stats",
        "description": "Which words the person tapped most in the last days, and which words exist but were never tapped.",
        "parameters": {"type": "object", "properties": {}, "required": []}}},
    {"type": "function", "function": {
        "name": "build_draft_moment",
        "description": "Turn one photo into a draft talking moment that waits for caregiver approval.",
        "parameters": {"type": "object", "properties": {
            "media_id": {"type": "string"},
            "title": {"type": "string", "description": "2 to 4 word title"},
            "reason": {"type": "string", "description": "One sentence for the caregiver: why this moment matters"},
        }, "required": ["media_id", "title", "reason"]}}},
    {"type": "function", "function": {
        "name": "finish",
        "description": "End the run with a short note to the caregiver.",
        "parameters": {"type": "object", "properties": {
            "note": {"type": "string", "description": "2 or 3 sentences: what you made and which words to model tomorrow"},
        }, "required": ["note"]}}},
]


def system_prompt(person_name: str) -> str:
    return (
        f"You are Moment Builder inside Momentalk, a communication app for {person_name}, who cannot rely on speech. "
        "Each evening you review the photos the family captured today. "
        f"Pick at most {MAX_SCENES} photos that show clear, meaningful moments {person_name} would want to talk about: "
        "people they love, food, play, outings. Skip blurry, empty, or duplicate photos. "
        "Look at each photo before deciding. Check tap stats so you can suggest words to model. "
        "Build drafts only; a caregiver approves everything. Always end by calling finish."
    )


def list_media() -> list[dict[str, Any]]:
    used = {s.get("source_media") for s in store.list_scenes()}
    return [{"media_id": p.stem, "file": p.name} for p in sorted(INBOX.glob("*.jpg")) if p.stem not in used]


def tap_stats() -> dict[str, Any]:
    taps: Counter[str] = Counter()
    labels: dict[str, str] = {}
    for scene in store.list_scenes():
        for h in scene["hotspots"]:
            labels[h["id"]] = h["label"]
        for tap in scene.get("taps", []):
            taps[tap["hotspot_id"]] += 1
    top = [{"word": labels.get(hid, hid), "taps": n} for hid, n in taps.most_common(8)]
    never = sorted({labels[h] for h in labels if h not in taps})[:12]
    return {"most_tapped": top, "never_tapped": never}


async def describe(media_id: str) -> str:
    path = INBOX / f"{media_id}.jpg"
    if not path.exists():
        return "No such photo."
    image, _, _ = prepare_image(path.read_bytes())
    data = await meta_client.chat([{"role": "user", "content": [
        {"type": "text", "text": "In 2 sentences: who and what is in this photo, and is it clear enough to tap things in it?"},
        {"type": "image_url", "image_url": {"url": meta_client.image_data_url(image)}},
    ]}], max_tokens=300)
    return data["choices"][0]["message"]["content"]


async def run_moment_builder(person_name: str = "Maya", progress: Progress | None = None) -> dict[str, Any]:
    async def report(stage: str, **info: Any) -> None:
        if progress:
            await progress(stage, info)

    run = {"id": store.new_id("a_"), "started_at": time.time(), "trace": [], "drafts": [], "note": None}
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": system_prompt(person_name)},
        {"role": "user", "content": "Here is today. Build the best moments and tell me what words to model."},
    ]
    await report("agent_start", model="Muse Wonder")

    for _ in range(MAX_STEPS):
        reply = await meta_client.chat(messages, model=settings.wonder_model, tools=TOOLS, reasoning_effort="medium")
        message = reply["choices"][0]["message"]
        messages.append({k: v for k, v in message.items() if k in ("role", "content", "tool_calls")})
        calls = message.get("tool_calls") or []
        if message.get("content"):
            run["trace"].append({"kind": "thought", "text": message["content"]})
        if not calls:
            break
        finished = False
        for call in calls:
            name = call["function"]["name"]
            args = json.loads(call["function"].get("arguments") or "{}")
            result: Any
            if name == "list_todays_media":
                result = list_media()
            elif name == "look_at_media":
                result = await describe(args.get("media_id", ""))
            elif name == "get_tap_stats":
                result = tap_stats()
            elif name == "build_draft_moment" and len(run["drafts"]) < MAX_SCENES:
                path = INBOX / f"{args.get('media_id', '')}.jpg"
                if not path.exists():
                    result = {"error": "unknown media_id"}
                else:
                    scene = await build_photo_scene(path.read_bytes(), person_name=person_name, created_by="agent")
                    scene.update({"title": args.get("title") or scene["title"], "agent_note": args.get("reason"),
                                  "source_media": path.stem, "agent_run": run["id"]})
                    store.save_scene(scene)
                    run["drafts"].append(scene["id"])
                    result = {"scene_id": scene["id"], "words": [h["label"] for h in scene["hotspots"]]}
            elif name == "build_draft_moment":
                result = {"error": f"limit of {MAX_SCENES} drafts reached"}
            elif name == "finish":
                run["note"] = args.get("note")
                result = "done"
                finished = True
            else:
                result = {"error": f"unknown tool {name}"}
            run["trace"].append({"kind": "tool", "tool": name, "args": args, "result": result})
            await report("agent_step", tool=name, detail=args.get("title") or args.get("media_id") or "")
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(result)[:4000]})
        if finished:
            break

    run["finished_at"] = time.time()
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    (RUNS_DIR / f"{run['id']}.json").write_text(json.dumps(run, indent=2), encoding="utf-8")
    await report("done", drafts=len(run["drafts"]))
    return run
