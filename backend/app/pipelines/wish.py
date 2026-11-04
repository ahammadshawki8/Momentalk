"""Wish Scenes: a moment that has not happened yet, so the person can ask for it.

Muse Image composes an illustrated avatar into a place the family photographed (the park,
grandma's kitchen) doing the activity the caregiver typed. The result then goes through the
normal photo pipeline so it becomes a talking moment. Never generated from a real child's face.
"""

from __future__ import annotations

import time
from typing import Any

from .. import meta_client, store
from .scene import Progress, build_photo_scene

AVATAR = ("a friendly illustrated child character with simple rounded shapes, soft colors and a big smile, "
          "clearly a drawing and not a real person")


def wish_prompt(activity: str) -> str:
    return (
        f"Add {AVATAR} into this photo, {activity}. Keep the real place exactly as it is: same light, same objects, "
        "same camera angle. The character should look happy and be the clear subject. No text, no logos."
    )


async def build_wish_scene(place_scene: dict[str, Any], activity: str, *, person_name: str, language: str,
                           progress: Progress | None = None, replace_source: bool = False) -> dict[str, Any]:
    started = time.time()
    if progress:
        await progress("imagining", {"model": "Muse Image"})
    folder = store.scene_dir(place_scene["id"])
    place = (folder / ("photo.jpg" if place_scene["kind"] != "video" else "keyframe.jpg")).read_bytes()
    image = await meta_client.image_edit(wish_prompt(activity), [(place, "image/jpeg")])
    scene = await build_photo_scene(image, language=language, person_name=person_name,
                                    narration=f"This is a wish: {person_name} {activity}.", progress=progress)
    # Muse Image output waits for the caregiver, like every other AI made moment.
    scene.update({"kind": "wish", "title": f"Wish: {activity[:28]}", "wish_of": place_scene["id"],
                  "status": "draft", "build_seconds": round(time.time() - started, 1),
                  "models": ["muse-image-1.0", *scene["models"]]})
    saved = store.save_scene(scene)
    # A wish made from a draft replaces that draft, so only one version waits for review.
    if replace_source:
        store.delete_scene(place_scene["id"])
    return saved
