# Technical Document — Shukla Photo Organizer

## 1. Overview

Shukla Photo Organizer is a two-process local web application:

- A **Python FastAPI backend** that performs all image analysis and serves a REST/SSE API
- A **React + Vite frontend** that provides the browser UI

All computation runs on the user's machine. No images, metadata, or analysis results are transmitted over the network.

---

## 2. Architecture

```
Browser (localhost:5173)
        |
        | HTTP / SSE
        v
  Vite Dev Server  ──proxy /api/*──>  FastAPI  (127.0.0.1:8000)
                                          |
                                    ┌─────┴──────┐
                                    |            |
                                 Scanner       SQLite DB
                                    |        (photo_organizer.db)
                              ┌─────┴──────────────────────────────┐
                              | Analyzers                          |
                              |  blur.py   duplicate.py  exif.py  |
                              |  document.py  exposure.py         |
                              |  faces.py  events.py  ranking.py  |
                              └────────────────────────────────────┘
```

### Ports

| Service | Host | Port |
|---|---|---|
| FastAPI backend | 127.0.0.1 | 8000 |
| Vite dev server | localhost | 5173 |

---

## 3. Backend

### 3.1 Entry Point — `main.py`

FastAPI application. Registers all HTTP endpoints and wires the `Database` and `Scanner` singletons. Enables CORS for the Vite origin (`localhost:5173`).

Key responsibilities:
- Validate incoming requests
- Stream scan progress via Server-Sent Events (SSE)
- Delegate file I/O (trash / restore / export) to the appropriate module

### 3.2 Scanner — `scanner.py`

Orchestrates a full folder scan in six phases:

| Phase | Description |
|---|---|
| `discovered` | Recursive glob for supported image extensions |
| `analyzed` | Per-file: MD5, pHash, blur, exposure, EXIF, document/screenshot flags |
| `grouping/duplicates` | Union-find clustering on MD5 + pHash Hamming distance |
| `grouping/faces` | Optional greedy face encoding clustering |
| `grouping/events` | Time-gap + GPS event clustering |
| `done` | Emits final count |

Each phase yields JSON lines in SSE format (`data: {...}\n\n`) so the frontend can render live progress.

Supported extensions: `.jpg .jpeg .png .webp .heic .bmp .tiff`

### 3.3 Database — `db.py`

SQLite via the Python standard library. Schema:

```
photos
  id, folder, path, original_path
  size_bytes, width, height, mtime
  md5, phash, blur_score, is_blurry, is_document, is_screenshot, trashed
  exif_datetime, gps_lat, gps_lon
  exposure_score, face_count, best_face_score

duplicate_groups   (id, folder, best_photo_id)
duplicate_members  (group_id, photo_id)

face_clusters      (id, folder, label)
face_members       (cluster_id, photo_id, encoding BLOB)

event_albums       (id, folder, start_time, end_time, photo_count)
event_members      (album_id, photo_id)
```

Schema migrations are idempotent — new columns are added with `PRAGMA table_info` guards so existing databases upgrade automatically on first run.

Indexes on `folder`, `md5`, and `phash` keep queries fast for large libraries.

### 3.4 Analyzers

#### `blur.py`
- Converts image to grayscale, downsamples to 512×512
- Applies a 3×3 Laplacian kernel (manual convolution, no OpenCV dependency)
- Returns variance of the result — higher = sharper
- Threshold: `BLUR_THRESHOLD = 100`

#### `duplicate.py`
- Computes pHash (perceptual hash, 8×8 DCT) via `imagehash`
- Clustering: union-find over all photo pairs
  - Exact duplicates: same MD5
  - Near-duplicates: pHash Hamming distance ≤ `hamming_threshold` (default 5)
- Singletons dropped; only groups of 2+ returned

#### `document.py`
- Aspect ratio check against A4 (1.414), letter (1.294), square (1.0) with ±0.15 tolerance
- Edge density: Sobel gradient magnitude, fraction of pixels above `mean + std`
- Threshold: `DOC_EDGE_DENSITY_MIN = 0.12`
- Screenshots: filename keywords (`screenshot`, `scr_`) or exact match against known screen resolutions

#### `exif.py`
- Reads `DateTimeOriginal` / `DateTime` EXIF tags via `PIL.ExifTags`
- Converts DMS GPS coordinates to decimal degrees
- Returns `exif_datetime` (Unix timestamp), `gps_lat`, `gps_lon`

#### `exposure.py`
- Converts to grayscale, downsamples to 256×256
- Measures blown highlights (≥253) and crushed shadows (≤2) as fractions of total pixels
- Penalises deviation of mean pixel value from mid-gray (128)
- Returns 0–1 score (1 = well exposed)

#### `ranking.py`
- Composite score: `0.5 × sharpness + 0.3 × exposure + 0.2 × face_quality`
- `sharpness` = `blur_score / 2000` capped at 1.0
- `face_quality` = `best_face_score` (largest face area ratio, stored during scan)
- `pick_best(photos)` returns the highest-scoring photo from a group
- Used by the scanner to select `best_photo_id` in duplicate groups

#### `events.py`
- Sorts photos by `exif_datetime` (falls back to `mtime`)
- Starts a new cluster when consecutive gap > `TIME_GAP_HOURS` (4 h)
- Also splits on GPS jump > `GPS_GAP_KM` (0.5 km) when both photos have coordinates
- Uses haversine formula for great-circle distance
- Clusters with < 2 photos are dropped

#### `faces.py`
- Optional dependency: `face_recognition` (dlib)
- HOG model for face location (fast; CNN is optional)
- Greedy online clustering with rolling centroid update
- Distance threshold: `FACE_DISTANCE_THRESHOLD = 0.55`
- Singletons dropped

### 3.5 Exporter — `exporter.py`

Generates a self-contained offline gallery:

1. Copies originals to `output/images/`
2. Generates 400×400 JPEG thumbnails to `output/thumbs/`
3. Writes `output/index.html` with embedded `data.json` as an inline `<script>` (works on `file://` without a server)
4. The gallery JS supports category filtering, lightbox with keyboard navigation

---

## 4. Frontend

### 4.1 State Machine (`App.jsx`)

```
picker  -->  scanning  -->  main
  ^               |           |
  |_______________| (cancel)  | (tabs: results / events / trash / export)
```

After scanning completes the app transitions to `main` state which renders the four tabs.

### 4.2 Components

| Component | Responsibility |
|---|---|
| `FolderPicker` | Path input + "Browse" button (calls `/api/browse`) |
| `ScanProgress` | SSE consumer; live progress bar + recent file log |
| `ResultsView` | Stat cards, category pills, group cards, modal trigger |
| `PhotoModal` | Full-screen group review with per-photo selection |
| `EventsView` | Event album cards with date ranges |
| `TrashView` | Grid of trashed photos with bulk/single restore |
| `ExportView` | Export form with category checkboxes and SSE progress |

### 4.3 API Client (`utils/api.js`)

Centralised fetch helpers:
- `getGroups(folder)` — fetch all category groups
- `getEvents(folder)` — fetch event albums
- `getTrash(folder)` — fetch trashed photos
- `trashPhotos(ids)` — POST to `/api/trash`
- `restorePhotos(ids)` — POST to `/api/restore`
- `startExport(...)` — POST to `/api/export`, streams SSE via `ReadableStream`

### 4.4 Vite Proxy

`vite.config.js` proxies all `/api/*` requests to `http://127.0.0.1:8000`, so the frontend treats the backend as same-origin.

---

## 5. Data Flow

See [FLOW.md](FLOW.md) for detailed sequence and state diagrams.

---

## 6. Non-Goals

- No cloud storage, telemetry, or external API calls
- No user authentication (single-user local tool)
- No mobile app
- No video files
