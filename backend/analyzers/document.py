"""Document + screenshot detection using cheap heuristics.

Three guards must ALL pass before a photo is flagged as a document:
  1. Aspect ratio matches a paper format (tight tolerance)
  2. NOT a common camera/phone aspect ratio
  3. High edge density (lots of text/lines)
  4. Predominantly light/white background (scanned paper, receipt, etc.)
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

# Paper aspect ratios (long / short side)
DOC_RATIOS = [1.414, 1.294]            # A4, US Letter  (square removed — too many false positives)
DOC_RATIO_TOLERANCE = 0.05             # tightened from 0.15

# Edge density: fraction of pixels above (mean + std) of Sobel magnitude
# ~15 % of pixels naturally exceed this in any image, so we need a clearly
# higher bar to imply "this image is full of text lines".
DOC_EDGE_DENSITY_MIN = 0.22

# Documents (scanned paper, receipts, IDs) have predominantly white/light backgrounds.
# Personal photos rarely exceed this fraction of near-white pixels.
DOC_LIGHT_BG_MIN = 0.35               # fraction of pixels with brightness > 200

# Common camera / phone aspect ratios — explicitly excluded so we never
# mistake a portrait or landscape photo for a document.
_PHOTO_RATIOS = [4 / 3, 3 / 2, 16 / 9, 21 / 9]
_PHOTO_RATIO_TOL = 0.07

# Common phone / desktop screen resolutions
SCREEN_DIMENSIONS = {
    (1170, 2532), (1179, 2556), (1284, 2778), (1290, 2796),  # iPhone
    (1080, 1920), (1080, 2340), (1440, 3120),                # Android
    (1920, 1080), (2560, 1440), (3840, 2160),                # desktop
    (750, 1334), (828, 1792), (1125, 2436),                  # older iPhones
}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _aspect_ratio(width: int, height: int) -> float:
    """Long side / short side."""
    return max(width, height) / min(width, height) if min(width, height) else 0.0


def _is_photo_ratio(width: int, height: int) -> bool:
    """True if this looks like a standard camera/phone crop — never a document."""
    r = _aspect_ratio(width, height)
    return any(abs(r - pr) < _PHOTO_RATIO_TOL for pr in _PHOTO_RATIOS)


def _matches_paper(width: int, height: int) -> bool:
    """True if aspect ratio is close to a paper format."""
    r = _aspect_ratio(width, height)
    return any(abs(r - dr) < DOC_RATIO_TOLERANCE for dr in DOC_RATIOS)


def _edge_density(img: Image.Image) -> float:
    """Fraction of pixels that are strong edges (proxy for 'has lots of text')."""
    gray = img.convert("L")
    gray.thumbnail((400, 400))
    arr = np.asarray(gray, dtype=np.float32)

    gx = np.zeros_like(arr)
    gy = np.zeros_like(arr)
    gx[:, 1:-1] = arr[:, 2:] - arr[:, :-2]
    gy[1:-1, :] = arr[2:, :] - arr[:-2, :]
    mag = np.sqrt(gx * gx + gy * gy)

    threshold = mag.mean() + mag.std()
    return float((mag > threshold).mean())


def _has_light_background(img: Image.Image) -> bool:
    """True if the image is mostly white/light — characteristic of scanned paper."""
    gray = img.convert("L")
    gray.thumbnail((256, 256))
    arr = np.asarray(gray)
    return float((arr > 200).mean()) >= DOC_LIGHT_BG_MIN


# ── Public API ────────────────────────────────────────────────────────────────

def looks_like_document(img: Image.Image) -> bool:
    """All four guards must pass."""
    w, h = img.size

    # Guard 1: never flag common photo aspect ratios
    if _is_photo_ratio(w, h):
        return False

    # Guard 2: must look like a paper format
    if not _matches_paper(w, h):
        return False

    # Guard 3: must have high edge density (text / printed lines)
    if _edge_density(img) < DOC_EDGE_DENSITY_MIN:
        return False

    # Guard 4: must have predominantly white/light background
    if not _has_light_background(img):
        return False

    return True


def looks_like_screenshot(img: Image.Image, path: Path) -> bool:
    """Screenshots: filename hints OR exact common screen resolution."""
    name = path.name.lower()
    if "screenshot" in name or "screen shot" in name or name.startswith("scr_"):
        return True
    dims = img.size
    return dims in SCREEN_DIMENSIONS or (dims[1], dims[0]) in SCREEN_DIMENSIONS
