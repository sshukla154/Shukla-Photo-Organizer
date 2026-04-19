"""Duplicate + near-duplicate detection via perceptual hashing."""
from __future__ import annotations

import imagehash
from PIL import Image


def compute_phash(img: Image.Image) -> str:
    """Return the pHash as a hex string."""
    return str(imagehash.phash(img, hash_size=8))


def hamming(a: str, b: str) -> int:
    """Hamming distance between two pHash hex strings."""
    ha = imagehash.hex_to_hash(a)
    hb = imagehash.hex_to_hash(b)
    return ha - hb


def find_duplicate_clusters(
    photos: list[dict],
    hamming_threshold: int = 5,
) -> list[list[dict]]:
    """Cluster visually-similar photos using union-find on pHash distances.

    Exact duplicates (same md5) always cluster. Near-duplicates within
    `hamming_threshold` Hamming distance on the pHash also cluster.
    Singletons are dropped — we only return sets of 2+.
    """
    n = len(photos)
    parent = list(range(n))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    # exact md5 match (cheap)
    by_md5: dict[str, list[int]] = {}
    for i, p in enumerate(photos):
        if p["md5"]:
            by_md5.setdefault(p["md5"], []).append(i)
    for indices in by_md5.values():
        for j in indices[1:]:
            union(indices[0], j)

    # near-duplicate via pHash (O(n^2) but fast; fine up to ~5k photos)
    for i in range(n):
        if not photos[i]["phash"]:
            continue
        for j in range(i + 1, n):
            if not photos[j]["phash"]:
                continue
            if hamming(photos[i]["phash"], photos[j]["phash"]) <= hamming_threshold:
                union(i, j)

    clusters: dict[int, list[dict]] = {}
    for i, p in enumerate(photos):
        root = find(i)
        clusters.setdefault(root, []).append(p)

    return [c for c in clusters.values() if len(c) >= 2]
