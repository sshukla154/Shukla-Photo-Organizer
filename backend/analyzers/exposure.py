"""Exposure quality scoring using histogram analysis."""
from __future__ import annotations

import numpy as np
from PIL import Image

# fraction of pixels that count as "clipped"
CLIP_THRESHOLD = 0.02


def compute_exposure_score(img: Image.Image) -> float:
    """Return 0-1 score where 1 = well-exposed, 0 = severely over/under-exposed."""
    gray = img.convert("L")
    gray.thumbnail((256, 256))
    arr = np.asarray(gray, dtype=np.float32)
    total = arr.size

    blown = float(np.sum(arr >= 253)) / total
    crushed = float(np.sum(arr <= 2)) / total

    # penalise clipping — each percent of clipped pixels subtracts from score
    clip_penalty = min(1.0, (blown + crushed) / CLIP_THRESHOLD)

    # reward photos whose mean is near mid-gray (128)
    mean_dev = abs(float(arr.mean()) - 128.0) / 128.0  # 0 = perfect, 1 = worst

    score = 1.0 - 0.6 * clip_penalty - 0.4 * mean_dev
    return max(0.0, min(1.0, score))
