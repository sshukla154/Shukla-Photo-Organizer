"""Folder scanner — walks images and orchestrates the analyzers."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import AsyncIterator

from PIL import Image

from analyzers.blur import compute_blur_score, is_blurry
from analyzers.document import looks_like_document, looks_like_screenshot
from analyzers.duplicate import compute_phash, find_duplicate_clusters
from analyzers.events import cluster_events
from analyzers.exif import extract_exif
from analyzers.exposure import compute_exposure_score
from analyzers.faces import cluster_faces, extract_face_encodings
from analyzers.ranking import pick_best
from db import Database

SUPPORTED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"}


class Scanner:
    def __init__(self, db: Database) -> None:
        self.db = db

    async def scan(self, folder: Path, *, include_faces: bool
                   ) -> AsyncIterator[str]:
        # 1. discover files
        files = [
            p for p in folder.rglob("*")
            if p.is_file()
            and p.suffix.lower() in SUPPORTED_EXT
            and ".photo_organizer_trash" not in p.parts
        ]
        yield json.dumps({"phase": "discovered", "total": len(files)})

        if not files:
            yield json.dumps({"phase": "done", "total": 0})
            return

        # 2. clear stale groups for this folder so re-scans are clean
        self.db.clear_groups(str(folder))

        # 3. analyze each file
        photo_ids: list[int] = []
        for idx, path in enumerate(files, start=1):
            try:
                data = self._analyze_file(path, folder)
                pid = self.db.upsert_photo(data)
                photo_ids.append(pid)
                yield json.dumps({
                    "phase": "analyzed",
                    "index": idx,
                    "total": len(files),
                    "filename": path.name,
                    "flags": {
                        "blurry": data["is_blurry"],
                        "document": data["is_document"],
                        "screenshot": data["is_screenshot"],
                    },
                })
            except Exception as e:
                yield json.dumps({
                    "phase": "error",
                    "filename": path.name,
                    "message": str(e),
                })

        # 4. find duplicate clusters
        yield json.dumps({"phase": "grouping", "step": "duplicates"})
        photos = self.db.photos_in_folder(str(folder))
        clusters = find_duplicate_clusters(photos, hamming_threshold=5)
        for cluster in clusters:
            best = pick_best(cluster)
            self.db.save_duplicate_group(
                str(folder),
                [p["id"] for p in cluster],
                best["id"],
            )
        yield json.dumps({
            "phase": "grouped",
            "step": "duplicates",
            "count": len(clusters),
        })

        # 5. face clustering (optional, slower)
        if include_faces:
            yield json.dumps({"phase": "grouping", "step": "faces"})
            try:
                encodings_per_photo = {}
                for photo in photos:
                    encs = extract_face_encodings(Path(photo["path"]))
                    if encs:
                        encodings_per_photo[photo["id"]] = encs
                face_clusters = cluster_faces(encodings_per_photo)
                for cluster in face_clusters:
                    self.db.save_face_cluster(str(folder), cluster)
                yield json.dumps({
                    "phase": "grouped",
                    "step": "faces",
                    "count": len(face_clusters),
                })
            except ImportError:
                yield json.dumps({
                    "phase": "grouped",
                    "step": "faces",
                    "count": 0,
                    "note": "face_recognition not installed — skipping",
                })

        # 6. event clustering
        yield json.dumps({"phase": "grouping", "step": "events"})
        event_clusters = cluster_events(photos)
        for ec in event_clusters:
            ids = [p["id"] for p in ec]
            times = [
                p.get("exif_datetime") or p.get("mtime")
                for p in ec
                if p.get("exif_datetime") or p.get("mtime")
            ]
            start_t = min(times) if times else None
            end_t = max(times) if times else None
            self.db.save_event_album(str(folder), ids, start_t, end_t)
        yield json.dumps({
            "phase": "grouped",
            "step": "events",
            "count": len(event_clusters),
        })

        yield json.dumps({"phase": "done", "total": len(files)})

    def _analyze_file(self, path: Path, folder: Path) -> dict:
        stat = path.stat()
        md5 = _md5(path)

        with Image.open(path) as img:
            img = img.convert("RGB")
            width, height = img.size
            phash = compute_phash(img)
            blur_score = compute_blur_score(img)
            is_doc = looks_like_document(img)
            is_screen = looks_like_screenshot(img, path)
            exposure_score = compute_exposure_score(img)

        # EXIF extraction needs the original (not converted) image
        with Image.open(path) as raw_img:
            exif_data = extract_exif(raw_img)

        return {
            "folder": str(folder),
            "path": str(path),
            "size_bytes": stat.st_size,
            "width": width,
            "height": height,
            "mtime": stat.st_mtime,
            "md5": md5,
            "phash": phash,
            "blur_score": blur_score,
            "is_blurry": is_blurry(blur_score),
            "is_document": is_doc,
            "is_screenshot": is_screen,
            "exposure_score": exposure_score,
            **exif_data,
        }


def _md5(path: Path, chunk_size: int = 65536) -> str:
    h = hashlib.md5()
    with path.open("rb") as f:
        while chunk := f.read(chunk_size):
            h.update(chunk)
    return h.hexdigest()
