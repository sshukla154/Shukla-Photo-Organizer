"""Face detection + clustering.

Uses the `face_recognition` library (dlib under the hood).
Clusters are formed greedily: a new face either joins the closest existing
cluster (if within distance threshold) or starts its own.
"""
from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np

FACE_DISTANCE_THRESHOLD = 0.55  # 0.6 is dlib's default; slightly stricter


def extract_face_encodings(path: Path) -> list[np.ndarray]:
    """Return one 128-d encoding per face found in the photo."""
    try:
        import face_recognition  # type: ignore
    except ImportError as e:
        raise ImportError(
            "Install face_recognition: pip install face_recognition"
        ) from e

    image = face_recognition.load_image_file(str(path))
    # HOG model is ~10x faster than CNN and fine for most party photos
    locations = face_recognition.face_locations(image, model="hog")
    if not locations:
        return []
    return face_recognition.face_encodings(image, known_face_locations=locations)


def cluster_faces(
    encodings_per_photo: dict[int, list[np.ndarray]],
) -> list[list[tuple[int, bytes]]]:
    """Greedy online clustering.

    Returns a list of clusters; each cluster is a list of
    (photo_id, pickled_encoding) tuples.
    """
    cluster_centroids: list[np.ndarray] = []
    cluster_members: list[list[tuple[int, bytes]]] = []

    for photo_id, encs in encodings_per_photo.items():
        for enc in encs:
            assigned = False
            for i, centroid in enumerate(cluster_centroids):
                distance = np.linalg.norm(centroid - enc)
                if distance < FACE_DISTANCE_THRESHOLD:
                    cluster_members[i].append((photo_id, pickle.dumps(enc)))
                    # rolling mean for centroid update
                    n = len(cluster_members[i])
                    cluster_centroids[i] = centroid + (enc - centroid) / n
                    assigned = True
                    break
            if not assigned:
                cluster_centroids.append(enc.copy())
                cluster_members.append([(photo_id, pickle.dumps(enc))])

    # drop singletons — a face seen once isn't worth grouping
    return [c for c in cluster_members if len(c) >= 2]
