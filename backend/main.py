"""
Photo Organizer — FastAPI backend.

Walks a folder, analyzes photos, and returns grouped results.
All processing is local. Nothing leaves your machine.
"""
from __future__ import annotations

import asyncio
import shutil
from pathlib import Path
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from db import Database
from exporter import export_gallery
from scanner import Scanner

app = FastAPI(title="Shukla Photo Organizer")

# Vite dev server runs on 5173 by default
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

db = Database()
scanner = Scanner(db)


class ScanRequest(BaseModel):
    folder_path: str
    include_faces: bool = True


class TrashRequest(BaseModel):
    photo_ids: list[int]


class ExportRequest(BaseModel):
    folder_path: str
    output_path: str
    categories: list[str] = []  # empty = all
    event_ids: list[int] = []   # empty = all events


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/browse")
def browse_folder() -> dict:
    """Open a native OS folder-picker dialog and return the chosen path."""
    import subprocess, sys

    # Windows: use PowerShell FolderBrowserDialog (no extra deps)
    if sys.platform == "win32":
        # Use a hidden topmost owner Form so the dialog always surfaces in front
        ps = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$owner = New-Object System.Windows.Forms.Form; "
            "$owner.TopMost = $true; "
            "$owner.StartPosition = 'CenterScreen'; "
            "$owner.Size = New-Object System.Drawing.Size(1,1); "
            "$owner.Show(); "
            "$owner.Activate(); "
            "$d = New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$d.Description = 'Select your photos folder'; "
            "$d.RootFolder = 'MyComputer'; "
            "$d.ShowNewFolderButton = $false; "
            "$r = $d.ShowDialog($owner); "
            "$owner.Dispose(); "
            "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $d.SelectedPath }"
        )
        try:
            result = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps],
                capture_output=True, text=True, timeout=60,
            )
            path = result.stdout.strip()
            return {"path": path}
        except Exception as e:
            raise HTTPException(500, f"Folder picker failed: {e}")

    # macOS / Linux: fall back to tkinter
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        path = filedialog.askdirectory(title="Select photo folder")
        root.destroy()
        return {"path": path or ""}
    except Exception as e:
        raise HTTPException(500, f"Could not open folder picker: {e}")


@app.post("/api/scan")
async def scan(req: ScanRequest) -> StreamingResponse:
    """Stream scan progress as server-sent events."""
    folder = Path(req.folder_path).expanduser().resolve()
    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, f"Folder not found: {folder}")

    async def event_stream() -> AsyncIterator[str]:
        async for event in scanner.scan(folder, include_faces=req.include_faces):
            yield f"data: {event}\n\n"
            await asyncio.sleep(0)  # let the event loop flush

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/groups")
def get_groups(folder_path: str) -> dict:
    """Return all groups for a previously scanned folder."""
    folder = Path(folder_path).expanduser().resolve()
    return db.get_groups(str(folder))


@app.get("/api/events")
def get_events(folder_path: str) -> dict:
    """Return event albums for a previously scanned folder."""
    folder = Path(folder_path).expanduser().resolve()
    albums = db.get_event_albums(str(folder))
    groups = db.get_groups(str(folder))
    return {
        "folder": str(folder),
        "events": albums,
        "all_photos": groups["all_photos"],
    }


@app.get("/api/trash")
def get_trash(folder_path: str) -> dict:
    """Return trashed photos for a scanned folder."""
    folder = Path(folder_path).expanduser().resolve()
    photos = db.get_trashed_photos(str(folder))
    return {
        "folder": str(folder),
        "photos": [
            {
                "id": p["id"],
                "path": p["path"],
                "original_path": p["original_path"],
                "size_bytes": p["size_bytes"],
                "width": p["width"],
                "height": p["height"],
            }
            for p in photos
        ],
        "count": len(photos),
        "total_bytes": sum(p["size_bytes"] or 0 for p in photos),
    }


@app.get("/api/thumbnail")
def thumbnail(photo_id: int) -> FileResponse:
    """Serve a photo's thumbnail (or the original if no thumb yet)."""
    photo = db.get_photo(photo_id)
    if photo is None:
        raise HTTPException(404, "Photo not found")
    path = Path(photo["path"])
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(path)


@app.post("/api/trash")
def move_to_trash(req: TrashRequest) -> dict:
    """Move photos to a local .trash folder inside the scanned directory."""
    moved = []
    for photo_id in req.photo_ids:
        photo = db.get_photo(photo_id)
        if photo is None:
            continue
        src = Path(photo["path"])
        if not src.exists():
            continue
        trash_dir = src.parent / ".photo_organizer_trash"
        trash_dir.mkdir(exist_ok=True)
        dest = trash_dir / src.name
        counter = 1
        while dest.exists():
            dest = trash_dir / f"{src.stem}_{counter}{src.suffix}"
            counter += 1
        shutil.move(str(src), str(dest))
        db.mark_trashed(photo_id, str(dest))
        moved.append(photo_id)
    return {"moved": moved, "count": len(moved)}


@app.post("/api/restore")
def restore(req: TrashRequest) -> dict:
    """Restore trashed photos back to their original location."""
    restored = []
    errors = []
    for photo_id in req.photo_ids:
        photo = db.get_photo(photo_id)
        if photo is None or not photo.get("trashed"):
            continue
        current = Path(photo["path"])
        original = Path(photo["original_path"])
        if not current.exists():
            errors.append({"id": photo_id, "error": "file missing from trash"})
            continue
        # recreate parent directory if it was deleted
        original.parent.mkdir(parents=True, exist_ok=True)
        # avoid overwriting existing file at destination
        dest = original
        if dest.exists():
            counter = 1
            while dest.exists():
                dest = original.parent / f"{original.stem}_{counter}{original.suffix}"
                counter += 1
        shutil.move(str(current), str(dest))
        db.mark_restored(photo_id)
        restored.append(photo_id)
    return {"restored": restored, "count": len(restored), "errors": errors}


@app.post("/api/export")
async def export(req: ExportRequest) -> StreamingResponse:
    """Export a static gallery to output_path. Streams SSE progress."""
    folder = Path(req.folder_path).expanduser().resolve()
    output = Path(req.output_path).expanduser().resolve()

    if not folder.exists() or not folder.is_dir():
        raise HTTPException(400, f"Folder not found: {folder}")
    if str(output).startswith(str(folder)):
        raise HTTPException(400, "Output path must not be inside the source folder")

    async def event_stream() -> AsyncIterator[str]:
        async for event in export_gallery(db, folder, output, req.categories, req.event_ids):
            yield f"data: {event}\n\n"
            await asyncio.sleep(0)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
