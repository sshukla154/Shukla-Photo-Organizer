"""Document + screenshot detection using cheap heuristics.

For better accuracy you can swap in a MobileNet classifier later;
these heuristics cost nothing and catch the obvious cases.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

# Documents often have aspect ratios near A4 (1:1.414) or letter (1:1.294)
DOC_RATIOS = [1.414, 1.294, 1.0]  # and portrait inverses
DOC_RATIO_TOLERANCE = 0.15
DOC_EDGE_DENSITY_MIN = 0.12  # fraction of strong-edge pixels

# Common phone / desktop screen resolutions
SCREEN_DIMENSIONS = {
    (1170, 2532), (1179, 2556), (1284, 2778), (1290, 2796),  # iPhone
    (1080, 1920), (1080, 2340), (1440, 3120),                # Android
    (1920, 1080), (2560, 1440), (3840, 2160),                # desktop
    (750, 1334), (828, 1792), (1125, 2436),                  # older iPhones
}


def _edge_density(img: Image.Image) -> float:
    """Fraction of pixels that are strong edges (proxy for 'has lots of text')."""
    gray = img.convert("L")
    gray.thumbnail((400, 400))
    arr = np.asarray(gray, dtype=np.float32)

    # simple Sobel magnitude
    gx = np.zeros_like(arr)
    gy = np.zeros_like(arr)
    gx[:, 1:-1] = arr[:, 2:] - arr[:, :-2]
    gy[1:-1, :] = arr[2:, :] - arr[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)

    threshold = mag.mean() + mag.std()
    return float((mag > threshold).mean())


def _aspect_matches_document(width: int, height: int) -> bool:
    if width == 0 or height == 0:
        return False
    ratio = max(width, height) / min(width, height)
    return any(abs(ratio - r) < DOC_RATIO_TOLERANCE for r in DOC_RATIOS)


def looks_like_document(img: Image.Image) -> bool:
    """Heuristic: documents have high edge density and paper-like aspect ratios."""
    w, h = img.size
    if not _aspect_matches_document(w, h):
        return False
    return _edge_density(img) >= DOC_EDGE_DENSITY_MIN


def looks_like_screenshot(img: Image.Image, path: Path) -> bool:
    """Screenshots: filename hints OR exact common screen resolution."""
    name = path.name.lower()
    if "screenshot" in name or "screen shot" in name or name.startswith("scr_"):
        return True
    dims = img.size
    return dims in SCREEN_DIMENSIONS or (dims[1], dims[0]) in SCREEN_DIMENSIONS
