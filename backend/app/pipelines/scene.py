"""Instant Talking Scene: photo in, talking scene out.

1. Muse Spark reads the photo and proposes tappable concepts with labels and phrases.
2. SAM 3.1 segments each concept by its phrase (one concept per request, in parallel).
3. Masks become simplified polygons; duplicates are removed; small objects sit on top.
4. Every phrase is pre-voiced so taps speak instantly.
"""

from __future__ import annotations

import asyncio
import re
import io
import time
from typing import Any, Awaitable, Callable

import numpy as np
from PIL import Image, ImageOps

from .. import meta_client, store, tts
from ..geometry import box_to_polygon, mask_iou, mask_to_polygons
from ..sam_format import SamObject, decode_mask, parse_sam_output

MAX_SIDE = 1536
MAX_CONCEPTS = 12
SAM_PARALLEL = 6

Progress = Callable[[str, dict], Awaitable[None]]

CONCEPT_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string", "description": "Short scene title, 2 to 4 words"},
        "concepts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "sam_phrase": {"type": "string", "description": "Short visual noun phrase SAM can find, e.g. 'woman in red apron'"},
                    "label": {"type": "string", "description": "1 to 3 word label shown on the hotspot"},
                    "phrase": {"type": "string", "description": "Short first person sentence the user says by tapping it"},
                    "synonyms": {"type": "array", "items": {"type": "string"},
                                 "description": "Words a caregiver might say for this thing"},
                    "kind": {"type": "string", "enum": ["person", "animal", "object", "food", "toy"]},
                    "many": {"type": "boolean", "description": "True when this covers several similar things, like 'race cars'"},
                },
                "required": ["sam_phrase", "label", "phrase", "synonyms", "kind", "many"],
            },
        },
    },
    "required": ["title", "concepts"],
}


def concept_prompt(language: str, person_name: str, narration: str | None) -> str:
    lines = [
        "You are helping build a visual scene display, a talking picture board for a person who cannot rely on speech.",
        f"The person using it is called {person_name}. Write labels and phrases in language code '{language}'.",
        f"Pick {MAX_CONCEPTS // 2} to {MAX_CONCEPTS} things in this photo that {person_name} would most want to talk about:",
        "people, pets, food, toys, and meaningful objects. ALWAYS include every visible person and pet first.",
        "NEVER pick backgrounds or surfaces: no ground, grass, park, sky, trees in the distance, table, floor, wall,",
        "crowd in the background, or the whole scene. Busy photos deserve more things."
        "Only concrete things you can point at; never actions, feelings, or events.",
        "For each: sam_phrase is 1 to 4 plain English words describing what it LOOKS like, never a name",
        "(say 'black and white dog', not 'Biscuit'; distinctive when similar things exist, e.g. 'girl in yellow shirt').",
        "Set many=true for a group of similar things (e.g. 'race cars'), so every one of them gets outlined.",
        "phrase is one short, warm, natural first person sentence (max 6 words) that fits WHAT the thing is:",
        "people get greetings or feelings ('Hi Nana!', 'I love you Nana'), pets get actions ('Pet the doggy!'),",
        "food gets wants or tastes ('Yummy pancakes!', 'More please'), toys get play ('Let's play trains!', 'My turn').",
        "Vary the phrases: never start more than two phrases the same way.",
        "synonyms are 1 to 4 everyday words a parent might say for it, in the same language, lowercase.",
    ]
    if narration:
        lines.append(f"The caregiver described this photo: \"{narration}\". Use the names and words they used, and include EVERY person or pet they name as its own thing.")
    return "\n".join(lines)


def prepare_image(raw: bytes) -> tuple[bytes, int, int]:
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=90)
    return buf.getvalue(), img.width, img.height


LOCATION_WORDS = re.compile(r"\s+\b(in|on|at|near|with|behind|under|beside|by|next to|holding)\b.*$", re.I)
NOT_THINGS = {"foreground", "background", "left", "right", "top", "bottom", "middle", "center", "corner", "side",
              "front", "back", "the", "a", "an"}


def fallback_phrases(phrase: str) -> list[str]:
    """'long stick in the foreground' -> ['long stick in the foreground', 'long stick', 'stick']. Never a location word."""
    phrases = [phrase]
    core = LOCATION_WORDS.sub("", phrase).strip()
    words = [w for w in core.split() if w.lower() not in NOT_THINGS]
    for candidate in (" ".join(words), " ".join(words[-2:]), words[-1] if words else ""):
        if candidate and candidate not in phrases:
            phrases.append(candidate)
    return phrases


def best_object(text: str) -> SamObject | None:
    objects = matching_objects(text, many=False)
    return objects[0] if objects else None


def matching_objects(text: str, many: bool) -> list[SamObject]:
    """Most confident match first. For group concepts keep every confident instance (all the race cars)."""
    frames = parse_sam_output(text)
    if not frames or not frames[0].objects:
        return []
    objects = sorted(frames[0].objects, key=lambda o: o.confidence or 0.0, reverse=True)
    if not many:
        return objects[:1]
    top = objects[0].confidence or 0.0
    return [o for o in objects if (o.confidence or 0.0) >= max(0.35, top * 0.6)][:12]


def hotspot_from_object(obj: SamObject, width: int, height: int) -> tuple[list, np.ndarray | None, float]:
    return hotspot_from_objects([obj], width, height)


def hotspot_from_objects(objs: list[SamObject], width: int, height: int) -> tuple[list, np.ndarray | None, float]:
    """Union of the objects' masks as outline polygons; falls back to boxes when a mask cannot be decoded."""
    union = np.zeros((height, width), dtype=np.uint8)
    boxes: list = []
    for obj in objs:
        mask = decode_mask(obj)
        if mask is not None and mask.shape == (height, width):
            union |= mask
        else:
            boxes.append(box_to_polygon(obj.box, width, height))
    polygons = mask_to_polygons(union) if union.any() else []
    polygons += boxes
    area = float(union.sum()) / (width * height) + sum(
        ((o.box[2] - o.box[0]) * (o.box[3] - o.box[1])) / (width * height) for o in objs if decode_mask(o) is None)
    return polygons, (union if union.any() else None), area


async def voice_hotspots(hotspots: list[dict], language: str, voice: str | None) -> None:
    async def one(h: dict) -> None:
        try:
            path = await tts.synthesize(h["phrase"], store.AUDIO_DIR, language, voice)
            h["audio_url"] = store.media_url(path)
        except Exception:
            h["audio_url"] = None  # browser speech synthesis takes over in the app

    await asyncio.gather(*(one(h) for h in hotspots))


async def build_photo_scene(raw: bytes, *, language: str = "en", person_name: str = "me", voice: str | None = None,
                            narration: str | None = None, created_by: str = "caregiver",
                            progress: Progress | None = None) -> dict[str, Any]:
    async def report(stage: str, **info: Any) -> None:
        if progress:
            await progress(stage, info)

    started = time.time()
    image, width, height = prepare_image(raw)
    scene_id = store.new_id("s_")
    folder = store.scene_dir(scene_id)
    (folder / "photo.jpg").write_bytes(image)
    await report("understanding", model=meta_client.language_model()["name"])

    plan = await meta_client.chat_json(
        [{"role": "user", "content": [
            {"type": "text", "text": concept_prompt(language, person_name, narration)},
            {"type": "image_url", "image_url": {"url": meta_client.image_data_url(image)}},
        ]}],
        CONCEPT_SCHEMA, schema_name="scene_plan", reasoning_effort="minimal",
    )
    concepts = plan["concepts"][:MAX_CONCEPTS]
    await report("segmenting", model="SAM 3.1", count=len(concepts), labels=[c["label"] for c in concepts])

    sem = asyncio.Semaphore(SAM_PARALLEL)

    async def segment(concept: dict) -> tuple[dict, list[SamObject]]:
        many = bool(concept.get("many"))
        phrases = fallback_phrases(concept["sam_phrase"])
        async with sem:
            for attempt, phrase in enumerate(phrases):
                try:
                    objects = matching_objects(await meta_client.sam_image(image, phrase), many)
                except meta_client.MetaAPIError:
                    continue
                if attempt > 0:  # simpler phrases are looser, so demand a confident match
                    objects = [o for o in objects if (o.confidence or 0.0) >= 0.5]
                if objects:
                    concept["sam_phrase"] = phrase
                    return concept, objects
            return concept, []

    results = await asyncio.gather(*(segment(c) for c in concepts))

    candidates = []
    dropped = [f'{c["label"]} ({c["sam_phrase"]})' for c, objs in results if not objs]
    for concept, objs in results:
        if not objs:
            continue
        polygons, mask, area = hotspot_from_objects(objs, width, height)
        if area > 0.35 and concept.get("kind") != "person":
            dropped.append(f'{concept["label"]} (covered {area:.0%} of the photo)')
            continue
        if polygons:
            candidates.append((concept, objs[0], polygons, mask, area))

    # Dedupe near identical masks, keeping the more confident one.
    candidates.sort(key=lambda c: c[1].confidence or 0.0, reverse=True)
    kept: list[tuple] = []
    for cand in candidates:
        if cand[3] is not None and any(k[3] is not None and mask_iou(cand[3], k[3]) > 0.7 for k in kept):
            continue
        kept.append(cand)
    # Large first, small last, so small objects render on top and win taps.
    kept.sort(key=lambda c: c[4], reverse=True)

    hotspots = []
    for order, (concept, obj, polygons, mask, area) in enumerate(kept):
        hotspots.append({
            "id": store.new_id("h_"),
            "label": concept["label"],
            "phrase": concept["phrase"],
            "synonyms": concept.get("synonyms", []),
            "kind": concept.get("kind", "object"),
            "sam_phrase": concept["sam_phrase"],
            "polygons": polygons,
            "confidence": obj.confidence,
            "order": order,
        })
    await report("voicing", count=len(hotspots))
    await voice_hotspots(hotspots, language, voice)

    scene = {
        "id": scene_id,
        "kind": "photo",
        "title": plan.get("title") or "New moment",
        "media_url": store.media_url(folder / "photo.jpg"),
        "width": width,
        "height": height,
        "language": language,
        "status": "draft" if created_by == "agent" else "approved",
        "created_by": created_by,
        "created_at": time.time(),
        "build_seconds": round(time.time() - started, 1),
        "models": [meta_client.language_model()["id"], "sam-3.1"],
        "not_found": dropped,  # concepts Spark proposed that SAM could not locate
        "hotspots": hotspots,
    }
    store.save_scene(scene)
    await report("done", scene_id=scene_id, seconds=scene["build_seconds"])
    return scene


async def add_hotspot_at_point(scene: dict[str, Any], x: float, y: float, language: str | None = None,
                               voice: str | None = None) -> dict[str, Any] | None:
    """Caregiver tapped an uncovered spot: SAM point prompt, then Spark names it."""
    folder = store.scene_dir(scene["id"])
    image = (folder / "photo.jpg").read_bytes()
    w, h = scene["width"], scene["height"]
    px, py = int(x * w), int(y * h)
    prompt = f"<0f>1<|point;x={px};y={py};w={w};h={h}|>"
    obj = best_object(await meta_client.sam_image(image, prompt))
    if obj is None:
        return None
    polygons, _, _ = hotspot_from_object(obj, w, h)
    x1, y1, x2, y2 = obj.box
    crop = Image.open(io.BytesIO(image)).crop((max(0, x1 - 20), max(0, y1 - 20), min(w, x2 + 20), min(h, y2 + 20)))
    buf = io.BytesIO()
    crop.save(buf, format="JPEG", quality=90)
    lang = language or scene.get("language", "en")
    named = await meta_client.chat_json(
        [{"role": "user", "content": [
            {"type": "text", "text": f"Name the main thing in this crop for a talking picture board. Language code '{lang}'. "
                                     "label: 1 to 3 words. phrase: short first person sentence. synonyms: 1 to 4 lowercase words."},
            {"type": "image_url", "image_url": {"url": meta_client.image_data_url(buf.getvalue())}},
        ]}],
        {"type": "object", "properties": {"label": {"type": "string"}, "phrase": {"type": "string"},
                                          "synonyms": {"type": "array", "items": {"type": "string"}}},
         "required": ["label", "phrase", "synonyms"]},
        schema_name="named_hotspot",
    )
    hotspot = {"id": store.new_id("h_"), "label": named["label"], "phrase": named["phrase"],
               "synonyms": named.get("synonyms", []), "kind": "object", "sam_phrase": "point prompt",
               "polygons": polygons, "confidence": obj.confidence, "order": len(scene["hotspots"])}
    await voice_hotspots([hotspot], lang, voice)
    scene["hotspots"].append(hotspot)
    store.save_scene(scene)
    return hotspot
