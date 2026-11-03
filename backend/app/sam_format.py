"""Parser for the SAM 3.1 streamed text format.

Each output line describes one frame:

    <Nf>id<|box;x1=..;y1=..;x2=..;y2=..;w=..;h=..[;c=..]|><|mask;x=0;y=0[;c=..];data=H,W,ENC payload|>,id<...>

Boxes are parsed here and are fully specified by the docs. The mask payload is
base85 with an encoding marker; its exact bit layout is decoded in decode_mask,
which must be verified against real API output in the Tier 0 spike.
"""

from __future__ import annotations

import base64
import re
from dataclasses import dataclass, field

import numpy as np

FRAME_RE = re.compile(r"<(\d+)f>")
OBJECT_RE = re.compile(r"(\d+)<\|box;([^|]*)\|>(?:<\|mask;([^|]*)\|>)?")


@dataclass
class SamObject:
    obj_id: int
    box: tuple[int, int, int, int]
    frame_size: tuple[int, int]  # (w, h)
    confidence: float | None = None
    mask_header: dict[str, str] = field(default_factory=dict)
    mask_payload: str | None = None


@dataclass
class SamFrame:
    index: int
    objects: list[SamObject]


def _kv(fields: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for part in fields.split(";"):
        if "=" in part:
            key, value = part.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def parse_sam_output(text: str) -> list[SamFrame]:
    frames: list[SamFrame] = []
    for line in text.splitlines():
        line = line.strip()
        match = FRAME_RE.match(line)
        if not match:
            continue
        index = int(match.group(1))
        objects = []
        for obj in OBJECT_RE.finditer(line[match.end():]):
            box = _kv(obj.group(2))
            mask = _kv(obj.group(3)) if obj.group(3) else {}
            payload = mask.pop("data", None)
            conf = box.get("c") or mask.get("c")
            objects.append(SamObject(
                obj_id=int(obj.group(1)),
                box=(int(box["x1"]), int(box["y1"]), int(box["x2"]), int(box["y2"])),
                frame_size=(int(box["w"]), int(box["h"])),
                confidence=float(conf) if conf else None,
                mask_header=mask,
                mask_payload=payload,
            ))
        frames.append(SamFrame(index=index, objects=objects))
    return frames


def decode_mask(obj: SamObject) -> np.ndarray | None:
    """Decode a mask to a (H, W) uint8 array of 0/1, placed in full frame coordinates.

    UNVERIFIED: assumes `data=H,W,ENC payload` where ENC is '!' (one_bit: bits packed
    MSB first, row major) or '~' (lossless). Returns None when the layout is not
    understood so callers can fall back to the bounding box.
    """
    if not obj.mask_payload:
        return None
    try:
        head, payload = obj.mask_payload.split(" ", 1) if " " in obj.mask_payload else (obj.mask_payload, "")
        parts = head.split(",")
        h, w, enc = int(parts[0]), int(parts[1]), parts[2] if len(parts) > 2 else ""
        if not payload and len(parts) > 3:
            payload = ",".join(parts[3:])
        raw = base64.b85decode(payload)
        if enc == "!":
            bits = np.unpackbits(np.frombuffer(raw, dtype=np.uint8))[: h * w]
            local = bits.reshape(h, w)
        else:
            return None
    except Exception:
        return None
    fw, fh = obj.frame_size
    full = np.zeros((fh, fw), dtype=np.uint8)
    ox, oy = int(obj.mask_header.get("x", 0)), int(obj.mask_header.get("y", 0))
    full[oy:oy + h, ox:ox + w] = local[: fh - oy, : fw - ox]
    return full
