"""SQLite persistence for scan results."""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

DB_PATH = Path(__file__).parent / "photo_organizer.db"


class Database:
    def __init__(self, path: Path = DB_PATH) -> None:
        self.path = path
        self._init_schema()
        self._migrate()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._conn() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS photos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    folder TEXT NOT NULL,
                    path TEXT NOT NULL UNIQUE,
                    original_path TEXT NOT NULL,
                    size_bytes INTEGER,
                    width INTEGER,
                    height INTEGER,
                    mtime REAL,
                    md5 TEXT,
                    phash TEXT,
                    blur_score REAL,
                    is_blurry INTEGER DEFAULT 0,
                    is_document INTEGER DEFAULT 0,
                    is_screenshot INTEGER DEFAULT 0,
                    trashed INTEGER DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder);
                CREATE INDEX IF NOT EXISTS idx_photos_md5 ON photos(md5);
                CREATE INDEX IF NOT EXISTS idx_photos_phash ON photos(phash);

                CREATE TABLE IF NOT EXISTS duplicate_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    folder TEXT NOT NULL,
                    best_photo_id INTEGER,
                    FOREIGN KEY (best_photo_id) REFERENCES photos(id)
                );

                CREATE TABLE IF NOT EXISTS duplicate_members (
                    group_id INTEGER NOT NULL,
                    photo_id INTEGER NOT NULL,
                    PRIMARY KEY (group_id, photo_id),
                    FOREIGN KEY (group_id) REFERENCES duplicate_groups(id) ON DELETE CASCADE,
                    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS face_clusters (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    folder TEXT NOT NULL,
                    label TEXT
                );

                CREATE TABLE IF NOT EXISTS face_members (
                    cluster_id INTEGER NOT NULL,
                    photo_id INTEGER NOT NULL,
                    encoding BLOB,
                    PRIMARY KEY (cluster_id, photo_id),
                    FOREIGN KEY (cluster_id) REFERENCES face_clusters(id) ON DELETE CASCADE,
                    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS event_albums (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    folder TEXT NOT NULL,
                    start_time REAL,
                    end_time REAL,
                    photo_count INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS event_members (
                    album_id INTEGER NOT NULL,
                    photo_id INTEGER NOT NULL,
                    PRIMARY KEY (album_id, photo_id),
                    FOREIGN KEY (album_id) REFERENCES event_albums(id) ON DELETE CASCADE,
                    FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE
                );
                """
            )

    def _migrate(self) -> None:
        """Add new columns to existing databases (idempotent)."""
        with self._conn() as c:
            existing = {
                row[1]
                for row in c.execute("PRAGMA table_info(photos)").fetchall()
            }
            new_cols = {
                "exif_datetime": "REAL",
                "gps_lat": "REAL",
                "gps_lon": "REAL",
                "exposure_score": "REAL",
                "face_count": "INTEGER DEFAULT 0",
                "best_face_score": "REAL DEFAULT 0",
            }
            for col, coltype in new_cols.items():
                if col not in existing:
                    c.execute(f"ALTER TABLE photos ADD COLUMN {col} {coltype}")

    # -------- photo operations --------

    def upsert_photo(self, data: dict) -> int:
        with self._conn() as c:
            cur = c.execute(
                "SELECT id FROM photos WHERE path = ?", (data["path"],)
            )
            row = cur.fetchone()
            if row:
                c.execute(
                    """UPDATE photos SET
                       size_bytes=?, width=?, height=?, mtime=?, md5=?, phash=?,
                       blur_score=?, is_blurry=?, is_document=?, is_screenshot=?,
                       exif_datetime=?, gps_lat=?, gps_lon=?,
                       exposure_score=?, face_count=?, best_face_score=?
                       WHERE id=?""",
                    (
                        data["size_bytes"], data["width"], data["height"],
                        data["mtime"], data["md5"], data["phash"],
                        data["blur_score"], int(data["is_blurry"]),
                        int(data["is_document"]), int(data["is_screenshot"]),
                        data.get("exif_datetime"), data.get("gps_lat"),
                        data.get("gps_lon"), data.get("exposure_score"),
                        data.get("face_count", 0), data.get("best_face_score", 0.0),
                        row["id"],
                    ),
                )
                return row["id"]
            cur = c.execute(
                """INSERT INTO photos
                   (folder, path, original_path, size_bytes, width, height, mtime, md5, phash,
                    blur_score, is_blurry, is_document, is_screenshot,
                    exif_datetime, gps_lat, gps_lon, exposure_score, face_count, best_face_score)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    data["folder"], data["path"], data["path"],
                    data["size_bytes"], data["width"], data["height"],
                    data["mtime"], data["md5"], data["phash"],
                    data["blur_score"], int(data["is_blurry"]),
                    int(data["is_document"]), int(data["is_screenshot"]),
                    data.get("exif_datetime"), data.get("gps_lat"),
                    data.get("gps_lon"), data.get("exposure_score"),
                    data.get("face_count", 0), data.get("best_face_score", 0.0),
                ),
            )
            return cur.lastrowid

    def get_photo(self, photo_id: int) -> dict | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT * FROM photos WHERE id = ?", (photo_id,)
            ).fetchone()
            return dict(row) if row else None

    def photos_in_folder(self, folder: str) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM photos WHERE folder = ? AND trashed = 0",
                (folder,),
            ).fetchall()
            return [dict(r) for r in rows]

    def mark_trashed(self, photo_id: int, trash_path: str) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE photos SET trashed=1, path=? WHERE id=?",
                (trash_path, photo_id),
            )

    def mark_restored(self, photo_id: int) -> None:
        with self._conn() as c:
            c.execute(
                "UPDATE photos SET trashed=0, path=original_path WHERE id=?",
                (photo_id,),
            )

    def get_trashed_photos(self, folder: str) -> list[dict]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT * FROM photos WHERE folder = ? AND trashed = 1",
                (folder,),
            ).fetchall()
            return [dict(r) for r in rows]

    # -------- group operations --------

    def save_duplicate_group(self, folder: str, photo_ids: list[int],
                             best_id: int) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO duplicate_groups (folder, best_photo_id) VALUES (?, ?)",
                (folder, best_id),
            )
            gid = cur.lastrowid
            c.executemany(
                "INSERT INTO duplicate_members (group_id, photo_id) VALUES (?, ?)",
                [(gid, pid) for pid in photo_ids],
            )
            return gid

    def clear_groups(self, folder: str) -> None:
        with self._conn() as c:
            c.execute("DELETE FROM duplicate_groups WHERE folder = ?", (folder,))
            c.execute("DELETE FROM face_clusters WHERE folder = ?", (folder,))
            c.execute("DELETE FROM event_albums WHERE folder = ?", (folder,))

    def save_face_cluster(self, folder: str,
                          members: list[tuple[int, bytes]]) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO face_clusters (folder) VALUES (?)", (folder,)
            )
            cid = cur.lastrowid
            c.executemany(
                "INSERT INTO face_members (cluster_id, photo_id, encoding) VALUES (?, ?, ?)",
                [(cid, pid, enc) for pid, enc in members],
            )
            return cid

    def save_event_album(self, folder: str, photo_ids: list[int],
                         start_time: float | None, end_time: float | None) -> int:
        with self._conn() as c:
            cur = c.execute(
                "INSERT INTO event_albums (folder, start_time, end_time, photo_count) VALUES (?, ?, ?, ?)",
                (folder, start_time, end_time, len(photo_ids)),
            )
            aid = cur.lastrowid
            c.executemany(
                "INSERT INTO event_members (album_id, photo_id) VALUES (?, ?)",
                [(aid, pid) for pid in photo_ids],
            )
            return aid

    def get_event_albums(self, folder: str) -> list[dict]:
        with self._conn() as c:
            albums = c.execute(
                "SELECT * FROM event_albums WHERE folder = ? ORDER BY start_time",
                (folder,),
            ).fetchall()
            result = []
            for album in albums:
                members = [
                    r["photo_id"] for r in c.execute(
                        "SELECT photo_id FROM event_members WHERE album_id = ?",
                        (album["id"],),
                    ).fetchall()
                ]
                result.append({
                    "album_id": album["id"],
                    "start_time": album["start_time"],
                    "end_time": album["end_time"],
                    "photo_count": album["photo_count"],
                    "photo_ids": members,
                })
            return result

    def get_groups(self, folder: str) -> dict:
        """Assemble all group categories for the UI."""
        with self._conn() as c:
            photos = [
                dict(r) for r in c.execute(
                    "SELECT * FROM photos WHERE folder = ? AND trashed = 0",
                    (folder,),
                ).fetchall()
            ]

            blurry = [p for p in photos if p["is_blurry"]]
            documents = [p for p in photos if p["is_document"]]
            screenshots = [p for p in photos if p["is_screenshot"]]

            # duplicate groups
            dup_rows = c.execute(
                "SELECT id, best_photo_id FROM duplicate_groups WHERE folder = ?",
                (folder,),
            ).fetchall()
            duplicate_sets = []
            for dup in dup_rows:
                members = [
                    r["photo_id"] for r in c.execute(
                        "SELECT photo_id FROM duplicate_members WHERE group_id = ?",
                        (dup["id"],),
                    ).fetchall()
                ]
                duplicate_sets.append({
                    "group_id": dup["id"],
                    "best_photo_id": dup["best_photo_id"],
                    "photo_ids": members,
                })

            # face clusters
            face_rows = c.execute(
                "SELECT id, label FROM face_clusters WHERE folder = ?", (folder,)
            ).fetchall()
            faces = []
            for face in face_rows:
                members = [
                    r["photo_id"] for r in c.execute(
                        "SELECT photo_id FROM face_members WHERE cluster_id = ?",
                        (face["id"],),
                    ).fetchall()
                ]
                faces.append({
                    "cluster_id": face["id"],
                    "label": face["label"],
                    "photo_ids": members,
                })

            # event albums
            event_rows = c.execute(
                "SELECT * FROM event_albums WHERE folder = ? ORDER BY start_time",
                (folder,),
            ).fetchall()
            events = []
            for album in event_rows:
                members = [
                    r["photo_id"] for r in c.execute(
                        "SELECT photo_id FROM event_members WHERE album_id = ?",
                        (album["id"],),
                    ).fetchall()
                ]
                events.append({
                    "album_id": album["id"],
                    "start_time": album["start_time"],
                    "end_time": album["end_time"],
                    "photo_count": album["photo_count"],
                    "photo_ids": members,
                })

            total_size = sum(p["size_bytes"] or 0 for p in photos)

            def slim(p: dict) -> dict:
                return {
                    "id": p["id"],
                    "path": p["path"],
                    "size_bytes": p["size_bytes"],
                    "width": p["width"],
                    "height": p["height"],
                    "blur_score": p.get("blur_score"),
                    "exposure_score": p.get("exposure_score"),
                    "exif_datetime": p.get("exif_datetime"),
                }

            return {
                "folder": folder,
                "total_photos": len(photos),
                "total_size_bytes": total_size,
                "blurry": [slim(p) for p in blurry],
                "documents": [slim(p) for p in documents],
                "screenshots": [slim(p) for p in screenshots],
                "duplicate_sets": duplicate_sets,
                "faces": faces,
                "events": events,
                "all_photos": {p["id"]: slim(p) for p in photos},
            }
