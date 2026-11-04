"""Illustrated avatar for the person, built from a caregiver's description (never from a photo).

The caregiver picks a few traits in onboarding. Muse Image draws one illustrated character from
text only, and every Wish Scene then uses that drawing as its reference image, so the child in each
wish is the same character. No real face is ever sent to a model.
"""

from __future__ import annotations

import re
from typing import Any

from pydantic import BaseModel, Field

from .. import meta_client, store
from ..config import settings

AVATAR_DIR = settings.data_dir / "avatars"

SKIN = {"light": "light", "fair": "fair", "medium": "medium brown", "tan": "warm tan", "deep": "deep brown"}
HAIR_COLOR = {"black": "black", "brown": "brown", "blond": "blond", "red": "red", "gray": "silver gray"}
HAIR_STYLE = {"short": "short", "curly": "curly", "long": "long straight", "ponytail": "in a ponytail", "bun": "in two buns"}
OUTFIT = {"yellow": "yellow", "red": "red", "blue": "blue", "green": "green", "purple": "purple"}


class AvatarTraits(BaseModel):
    skin: str = Field("medium")
    hair_color: str = Field("black")
    hair_style: str = Field("short")
    glasses: bool = False
    outfit: str = Field("yellow")


def describe(t: AvatarTraits) -> str:
    """Plain words for the character, shared by the avatar prompt and every wish prompt."""
    parts = [
        f"{SKIN.get(t.skin, 'medium brown')} skin",
        f"{HAIR_COLOR.get(t.hair_color, 'black')} hair worn {HAIR_STYLE.get(t.hair_style, 'short')}",
        f"a {OUTFIT.get(t.outfit, 'yellow')} top",
    ]
    if t.glasses:
        parts.append("round glasses")
    return "a friendly illustrated young child with " + ", ".join(parts)


def avatar_prompt(t: AvatarTraits) -> str:
    return (
        f"A full body character illustration of {describe(t)}, standing and smiling, facing forward. "
        "Soft watercolor children's book style, simple rounded shapes, clearly a drawing and not a photo of a real person. "
        "Plain white background, no text, no logos."
    )


async def build_avatar(traits: AvatarTraits) -> dict[str, Any]:
    image = await meta_client.image_generate(avatar_prompt(traits))
    avatar_id = store.new_id("a_")
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    path = AVATAR_DIR / f"{avatar_id}.png"
    path.write_bytes(image)
    (AVATAR_DIR / f"{avatar_id}.json").write_text(traits.model_dump_json(), encoding="utf-8")
    return {"avatar_id": avatar_id, "url": store.media_url(path), "description": describe(traits)}


def load_avatar(avatar_id: str | None) -> tuple[bytes, str] | None:
    """The avatar image and its description, if this id is a real saved avatar."""
    if not avatar_id or not re.fullmatch(r"a_[0-9a-f]+", avatar_id):
        return None
    image = AVATAR_DIR / f"{avatar_id}.png"
    traits = AVATAR_DIR / f"{avatar_id}.json"
    if not image.exists() or not traits.exists():
        return None
    return image.read_bytes(), describe(AvatarTraits.model_validate_json(traits.read_text(encoding="utf-8")))
