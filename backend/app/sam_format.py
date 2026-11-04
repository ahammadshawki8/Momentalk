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


def split_mask_payload(data: str) -> tuple[int, int, str] | None:
    """`data=H,W,<marker><body>` -> (H, W, "<marker><body>"). Marker is '!' (one_bit) or '~' (lossless)."""
    parts = data.split(",", 2)
    if len(parts) != 3 or not parts[2] or parts[2][0] not in "!~":
        return None
    return int(parts[0]), int(parts[1]), parts[2]


def _official_decoder():
    """Meta's reference decoder (pip package meta-sam-parser). The body is range coded, see docs/API_NOTES.md."""
    try:
        from meta_sam_parser import SegmentationMask, decode_mask_to_raster  # type: ignore
    except Exception:
        return None

    def decode(payload: str, width: int, height: int) -> bytes:
        encoding = "one_bit" if payload[0] == "!" else "lossless"
        return decode_mask_to_raster(SegmentationMask(encoding=encoding, payload=payload, width=width, height=height))

    return decode


def decode_mask(obj: SamObject) -> np.ndarray | None:
    """Decode a mask to a (frame_h, frame_w) uint8 array of 0/1 in full frame coordinates.

    The H x W raster covers the inclusive bounding box, with raster (0, 0) at (x1, y1)
    (official docs: mask dims always equal the inclusive box size; x and y are literal 0).
    Returns None when the official decoder is unavailable so callers fall back to the box.
    """
    if not obj.mask_payload:
        return None
    split = split_mask_payload(obj.mask_payload)
    decoder = _official_decoder()
    if not split or decoder is None:
        return None
    h, w, payload = split
    try:
        raster = decoder(payload, w, h)
        local = np.frombuffer(bytes(raster), dtype=np.uint8).reshape(h, w)
    except Exception:
        return None
    fw, fh = obj.frame_size
    x1, y1 = obj.box[0], obj.box[1]
    full = np.zeros((fh, fw), dtype=np.uint8)
    ph, pw = min(h, fh - y1), min(w, fw - x1)
    full[y1:y1 + ph, x1:x1 + pw] = local[:ph, :pw]
    return full
