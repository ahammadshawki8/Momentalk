"""Mask and polygon helpers for hotspots."""

from __future__ import annotations

import cv2
import numpy as np

Polygon = list[list[float]]  # [[x, y], ...] normalized 0..1


def mask_to_polygons(mask: np.ndarray, min_area_frac: float = 0.002, epsilon_frac: float = 0.004) -> list[Polygon]:
    """Convert a binary mask to simplified, normalized outer polygons (largest first)."""
    h, w = mask.shape
    contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    min_area = min_area_frac * h * w
    polys: list[tuple[float, Polygon]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        eps = epsilon_frac * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, eps, True).reshape(-1, 2)
        if len(approx) < 3:
            continue
        polys.append((area, [[round(x / w, 4), round(y / h, 4)] for x, y in approx]))
    polys.sort(key=lambda item: item[0], reverse=True)
    return [poly for _, poly in polys]


def box_to_polygon(box: tuple[int, int, int, int], frame_w: int, frame_h: int) -> Polygon:
    x1, y1, x2, y2 = box
    return [[round(x1 / frame_w, 4), round(y1 / frame_h, 4)], [round(x2 / frame_w, 4), round(y1 / frame_h, 4)],
            [round(x2 / frame_w, 4), round(y2 / frame_h, 4)], [round(x1 / frame_w, 4), round(y2 / frame_h, 4)]]


def mask_iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    return float(inter / union) if union else 0.0
