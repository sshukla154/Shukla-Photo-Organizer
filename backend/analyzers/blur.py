"""Blur detection using Laplacian variance.

A sharp image produces high-variance second derivatives;
a blurry one produces low-variance ones.

Threshold is intentionally conservative (30) to avoid flagging
low-detail-but-sharp shots (plain sky, walls, solid backgrounds).
Raise it if you want to catch soft/mildly out-of-focus shots too.
"""
from __future__ import annotations

import numpy as np
from PIL import Image

BLUR_THRESHOLD = 30.0  # only flag clearly blurry photos


def compute_blur_score(img: Image.Image) -> float:
    """Return the Laplacian variance. Higher = sharper."""
    gray = img.convert("L")
    gray.thumbnail((512, 512))
    arr = np.asarray(gray, dtype=np.float32)

    # 3x3 Laplacian kernel — manual convolution, no OpenCV dependency
    kernel = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], dtype=np.float32)
    h, w = arr.shape
    padded = np.pad(arr, 1, mode="edge")
    out = np.zeros_like(arr)
    for dy in range(3):
        for dx in range(3):
            out += kernel[dy, dx] * padded[dy:dy + h, dx:dx + w]
    return float(out.var())


def is_blurry(score: float, threshold: float = BLUR_THRESHOLD) -> bool:
    return score < threshold
