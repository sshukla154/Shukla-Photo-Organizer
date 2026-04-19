"""Best-shot ranking for groups of similar photos."""
from __future__ import annotations

# Composite score weights (must sum to 1.0)
W_SHARPNESS = 0.5
W_EXPOSURE = 0.3
W_FACE = 0.2

# Blur score normalisation cap — scores above this are treated as max-sharp
BLUR_CAP = 2000.0


def _norm_blur(blur_score: float | None) -> float:
    if blur_score is None:
        return 0.0
    return min(1.0, (blur_score or 0.0) / BLUR_CAP)


def composite_score(photo: dict) -> float:
    sharpness = _norm_blur(photo.get("blur_score"))
    exposure = photo.get("exposure_score") or 0.0
    face = photo.get("best_face_score") or 0.0
    return W_SHARPNESS * sharpness + W_EXPOSURE * exposure + W_FACE * face


def rank_group(photos: list[dict]) -> list[dict]:
    """Return photos sorted best-first by composite score."""
    return sorted(photos, key=composite_score, reverse=True)


def pick_best(photos: list[dict]) -> dict:
    """Return the single best photo from a group."""
    return rank_group(photos)[0]
