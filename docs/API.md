# API Reference — Shukla Photo Organizer

Base URL (dev): `http://127.0.0.1:8000`

All endpoints are prefixed with `/api`. The Vite dev server proxies `/api/*` to the backend, so from the browser the effective base is `http://localhost:5173/api`.

---

## GET /api/health

Health check.

**Response**
```json
{ "status": "ok" }
```

---

## GET /api/browse

Opens a native OS folder-picker dialog and returns the selected path.

- Windows: uses PowerShell `System.Windows.Forms.FolderBrowserDialog`
- macOS/Linux: uses tkinter `filedialog.askdirectory`

**Response**
```json
{ "path": "C:\\Users\\alice\\Pictures" }
```

Returns `{ "path": "" }` if the user cancels without selecting a folder.

**Errors**

| Code | Meaning |
|------|---------|
| 500 | Folder picker could not be launched |

---

## POST /api/scan

Scan a folder and stream progress as Server-Sent Events (SSE).

**Request body**
```json
{
  "folder_path": "C:\\Users\\alice\\Pictures",
  "include_faces": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `folder_path` | string | required | Absolute path to the folder to scan |
| `include_faces` | boolean | `true` | Whether to run face clustering (requires `face_recognition`) |

**Response** — `text/event-stream`

Each line is a JSON object:

```
data: {"phase": "discovered", "total": 842}

data: {"phase": "analyzed", "done": 1, "total": 842, "path": "IMG_0001.jpg"}

data: {"phase": "grouping/duplicates"}

data: {"phase": "grouping/faces"}

data: {"phase": "grouping/events"}

data: {"phase": "done", "total": 842}
```

**Phases in order**

| Phase | Payload fields | Description |
|-------|---------------|-------------|
| `discovered` | `total` | File discovery complete |
| `analyzed` | `done`, `total`, `path` | Per-file analysis progress |
| `grouping/duplicates` | — | Clustering pass started |
| `grouping/faces` | — | Face clustering started |
| `grouping/events` | — | Event clustering started |
| `done` | `total` | All phases complete |

**Errors**

| Code | Meaning |
|------|---------|
| 400 | Folder does not exist or is not a directory |

---

## GET /api/groups

Return all analysis groups for a previously scanned folder.

**Query parameters**

| Name | Type | Description |
|------|------|-------------|
| `folder_path` | string | Absolute path used in the scan |

**Response**
```json
{
  "folder": "C:\\Users\\alice\\Pictures",
  "total_photos": 842,
  "total_size_bytes": 3145728000,
  "blurry": [ <photo>, ... ],
  "documents": [ <photo>, ... ],
  "screenshots": [ <photo>, ... ],
  "duplicate_sets": [
    {
      "group_id": 1,
      "best_photo_id": 17,
      "photo_ids": [17, 42, 98]
    }
  ],
  "faces": [
    {
      "cluster_id": 1,
      "label": null,
      "photo_ids": [3, 19, 55]
    }
  ],
  "events": [
    {
      "album_id": 1,
      "start_time": 1710000000.0,
      "end_time": 1710012000.0,
      "photo_count": 23,
      "photo_ids": [1, 2, 3, ...]
    }
  ],
  "all_photos": {
    "1": <photo>,
    "2": <photo>
  }
}
```

**Photo object** (slim representation used throughout)

```json
{
  "id": 17,
  "path": "C:\\Users\\alice\\Pictures\\IMG_0017.jpg",
  "size_bytes": 3145728,
  "width": 4032,
  "height": 3024,
  "blur_score": 312.5,
  "exposure_score": 0.87,
  "exif_datetime": 1710000000.0
}
```

---

## GET /api/events

Return event albums for a previously scanned folder.

**Query parameters**

| Name | Type | Description |
|------|------|-------------|
| `folder_path` | string | Absolute path used in the scan |

**Response**
```json
{
  "folder": "C:\\Users\\alice\\Pictures",
  "events": [
    {
      "album_id": 1,
      "start_time": 1710000000.0,
      "end_time": 1710012000.0,
      "photo_count": 23,
      "photo_ids": [1, 2, 3]
    }
  ],
  "all_photos": { "1": <photo>, ... }
}
```

`start_time` and `end_time` are Unix timestamps (seconds). `null` when no EXIF date is available.

---

## GET /api/trash

Return trashed photos for a scanned folder.

**Query parameters**

| Name | Type | Description |
|------|------|-------------|
| `folder_path` | string | Absolute path used in the scan |

**Response**
```json
{
  "folder": "C:\\Users\\alice\\Pictures",
  "photos": [
    {
      "id": 42,
      "path": "C:\\Users\\alice\\Pictures\\.photo_organizer_trash\\IMG_0042.jpg",
      "original_path": "C:\\Users\\alice\\Pictures\\IMG_0042.jpg",
      "size_bytes": 2097152,
      "width": 3024,
      "height": 4032
    }
  ],
  "count": 1,
  "total_bytes": 2097152
}
```

---

## GET /api/thumbnail

Serve a photo file directly (used as an `<img src>` URL).

**Query parameters**

| Name | Type | Description |
|------|------|-------------|
| `photo_id` | integer | ID from `all_photos` |

**Response** — the image file (`image/jpeg`, `image/png`, etc.)

**Errors**

| Code | Meaning |
|------|---------|
| 404 | Photo ID not found in DB |
| 404 | File missing on disk |

---

## POST /api/trash

Move one or more photos to the `.photo_organizer_trash` subfolder.

**Request body**
```json
{ "photo_ids": [17, 42, 98] }
```

The trash folder is created at `<source_folder>/.photo_organizer_trash/`. Files are renamed on collision (`IMG_0042_1.jpg`, `IMG_0042_2.jpg`, …).

**Response**
```json
{ "moved": [17, 42, 98], "count": 3 }
```

IDs that are not found or whose files are already missing are silently skipped.

---

## POST /api/restore

Restore one or more trashed photos back to their original location.

**Request body**
```json
{ "photo_ids": [17, 42] }
```

- Recreates the parent directory if it was deleted.
- If the original path is occupied, a suffix counter is appended (`_1`, `_2`, …).

**Response**
```json
{
  "restored": [17, 42],
  "count": 2,
  "errors": []
}
```

Error entry shape: `{ "id": 98, "error": "file missing from trash" }`

---

## POST /api/export

Export a static offline gallery. Streams SSE progress.

**Request body**
```json
{
  "folder_path": "C:\\Users\\alice\\Pictures",
  "output_path": "C:\\Users\\alice\\Desktop\\gallery",
  "categories": ["blurry", "duplicates"],
  "event_ids": [1, 2]
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `folder_path` | string | required | Source folder |
| `output_path` | string | required | Destination directory (must not be inside source) |
| `categories` | array of string | `[]` (all) | Filter: `"blurry"`, `"duplicates"`, `"documents"`, `"screenshots"`, `"faces"` |
| `event_ids` | array of int | `[]` (all) | Restrict to specific event album IDs |

**Response** — `text/event-stream`

```
data: {"phase": "start", "total": 156}

data: {"phase": "copy", "done": 1, "total": 156, "path": "IMG_0001.jpg"}

data: {"phase": "thumb", "done": 1, "total": 156}

data: {"phase": "html"}

data: {"phase": "done", "output": "C:\\Users\\alice\\Desktop\\gallery\\index.html"}
```

**Output structure**
```
gallery/
  index.html      # self-contained gallery (works on file://)
  images/         # full-size originals
  thumbs/         # 400x400 JPEG thumbnails
```

**Errors**

| Code | Meaning |
|------|---------|
| 400 | Source folder not found |
| 400 | Output path is inside source folder |
