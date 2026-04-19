# Shukla Photo Organizer

A local web app that scans a folder of photos and groups them by:
- **Blurry** — out-of-focus shots (Laplacian variance)
- **Duplicates** — exact + near-identical via perceptual hashing
- **Documents** — receipts, IDs, papers (aspect ratio + edge density)
- **Screenshots** — detected by filename + known screen resolutions
- **People** — face clustering via dlib

All processing runs locally. Photos never leave your machine.

## Install location

Extract this project to:

```
C:\sshukla\Projects\Shukla Photo Organizer
```

## Architecture

- **Backend**: FastAPI + SQLite, serves scan streaming via SSE
- **Frontend**: React + Vite, proxies `/api/*` to the backend
- **DB**: SQLite cache so re-scans are instant

## Setup (Windows)

### Prerequisites

- **Python 3.10+** — https://www.python.org/downloads/ (tick "Add Python to PATH" during install)
- **Node.js 18+** — https://nodejs.org/en/download

### Backend

Open PowerShell:

```powershell
cd "C:\sshukla\Projects\Shukla Photo Organizer\backend"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Backend runs on `http://127.0.0.1:8000`. Leave this terminal open.

> If PowerShell blocks script activation, run once:
> `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

**Optional — face clustering**: uncomment `face_recognition` in `requirements.txt`. On Windows, dlib compilation is painful; the easiest path:
```powershell
pip install cmake
pip install dlib-bin
pip install face_recognition
```
The scanner degrades gracefully if the library isn't installed — it just skips face grouping.

### Frontend

Open a **second** PowerShell window:

```powershell
cd "C:\sshukla\Projects\Shukla Photo Organizer\frontend"
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`. It proxies API calls to the backend automatically.

## Usage

1. Open `http://localhost:5173` in your browser
2. Paste the absolute path to a photo folder, e.g. `C:\Users\sshukla\Pictures\Party-Nov-2025`
3. Click **Scan** and watch the live progress
4. Review groups and move items to trash with one click

Trashed items go into a `.photo_organizer_trash` subfolder inside the scanned folder. Nothing is permanently deleted.

## Tuning

- `backend/analyzers/blur.py` — `BLUR_THRESHOLD` (default 100). Raise if too many shots flagged; lower if blurry ones slip through.
- `backend/analyzers/duplicate.py` — `hamming_threshold` (default 5). Lower is stricter.
- `backend/analyzers/document.py` — `DOC_EDGE_DENSITY_MIN` (default 0.12). Raise if regular photos get flagged as documents.
- `backend/analyzers/faces.py` — `FACE_DISTANCE_THRESHOLD` (default 0.55). Lower = fewer false matches, more clusters.

## What to build next

- Group detail view — full-screen grid with individual keep/trash toggles
- Trash view with one-click restore
- Smart albums by event (cluster by timestamp gaps + GPS)
- Best-shot picker using face landmarks
- Export cleaned albums as a static gallery site
