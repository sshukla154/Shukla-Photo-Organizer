# Shukla Photo Organizer

A privacy-first, fully local web application that scans a photo folder and groups photos into actionable categories — blurry shots, duplicates, documents, screenshots, people, and time-based events. Review, clean up, and export your library without uploading anything to the cloud.

---

## Features

| Feature | Description |
|---|---|
| **Blur detection** | Flags out-of-focus shots using Laplacian variance |
| **Duplicate finder** | Groups exact + near-identical photos via perceptual hashing |
| **Document detection** | Identifies scanned receipts, IDs, and papers |
| **Screenshot detection** | Recognises screen captures by filename and resolution |
| **People clustering** | Groups photos by face (optional, requires `face_recognition`) |
| **Event albums** | Clusters photos into time-based events (4-hour gap rule + GPS) |
| **Best-shot picker** | Ranks photos by sharpness, exposure, and face quality |
| **Group detail view** | Full-screen modal to review and selectively trash any group |
| **Trash & restore** | Safe non-destructive trash with one-click restore |
| **Static gallery export** | Exports a self-contained offline HTML gallery |

---

## Quick Start

### Prerequisites

| Tool | Version | Link |
|---|---|---|
| Python | 3.10+ | https://python.org/downloads |
| Node.js | 18+ | https://nodejs.org |

> During Python install, tick **"Add Python to PATH"**.

### Option A — One-click manager (recommended)

Double-click **`manage.bat`** in the project root, then press **`3`** to start both servers.

### Option B — Manual

**Backend**
```powershell
cd "C:\sshukla\Projects\Shukla Photo Organizer\backend"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```
> If PowerShell blocks scripts: `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

**Frontend** (new terminal)
```powershell
cd "C:\sshukla\Projects\Shukla Photo Organizer\frontend"
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## Usage

1. Click **Browse for folder** (or paste an absolute path)
2. Click **Scan** — live progress streams in real time
3. Review groups under the **Results** tab
4. Click any thumbnail strip to open the full **review modal**
5. Use the **Trash** tab to browse and restore trashed photos
6. Use the **Events** tab to explore time-clustered albums
7. Use the **Export** tab to generate an offline HTML gallery

> Nothing is permanently deleted. Trashed photos move to a `.photo_organizer_trash` subfolder and can be restored at any time.

---

## Dev Server Manager (`manage.bat`)

| Key | Action |
|---|---|
| `1` | Start Frontend |
| `2` | Start Backend |
| `3` | Start Both |
| `4` | Restart Frontend |
| `5` | Restart Backend |
| `6` | Restart Both |
| `7–9` | Stop Frontend / Backend / Both |
| `R` | Refresh status |
| `Q` | Quit |

---

## Tuning Parameters

| File | Constant | Default | Effect |
|---|---|---|---|
| `analyzers/blur.py` | `BLUR_THRESHOLD` | `100` | Raise to flag fewer photos as blurry |
| `analyzers/duplicate.py` | `hamming_threshold` | `5` | Lower = stricter matching |
| `analyzers/document.py` | `DOC_EDGE_DENSITY_MIN` | `0.12` | Raise to reduce false document flags |
| `analyzers/faces.py` | `FACE_DISTANCE_THRESHOLD` | `0.55` | Lower = fewer cross-person matches |
| `analyzers/events.py` | `TIME_GAP_HOURS` | `4` | Gap between photos that starts a new event |
| `analyzers/ranking.py` | `W_SHARPNESS / W_EXPOSURE / W_FACE` | `0.5 / 0.3 / 0.2` | Best-shot scoring weights |

---

## Optional: Face Clustering

Uncomment `face_recognition` in `requirements.txt`, then:

```powershell
pip install cmake
pip install dlib-bin
pip install face_recognition
```

The app degrades gracefully if the library is not installed — face grouping is silently skipped.

---

## Docs

| Document | Description |
|---|---|
| [TECHNICAL.md](docs/TECHNICAL.md) | Architecture, module breakdown, data model |
| [API.md](docs/API.md) | Full REST API reference with request/response schemas |
| [FLOW.md](docs/FLOW.md) | End-to-end user and data flow diagrams |
| [TUNING.md](docs/TUNING.md) | Analyzer tuning guide and performance tips |

---

## Project Structure

```
Shukla Photo Organizer/
├── backend/
│   ├── main.py               # FastAPI app + all endpoints
│   ├── scanner.py            # Scan orchestration
│   ├── db.py                 # SQLite persistence layer
│   ├── exporter.py           # Static gallery exporter
│   └── analyzers/
│       ├── blur.py           # Laplacian blur detection
│       ├── duplicate.py      # Perceptual hash clustering
│       ├── document.py       # Document/screenshot detection
│       ├── faces.py          # Face detection + clustering
│       ├── exif.py           # EXIF datetime + GPS extraction
│       ├── exposure.py       # Exposure quality scoring
│       ├── events.py         # Time-based event clustering
│       └── ranking.py        # Best-shot composite scoring
├── frontend/
│   └── src/
│       ├── App.jsx           # Root + tab navigation
│       ├── utils/api.js      # API client helpers
│       └── components/
│           ├── FolderPicker.jsx
│           ├── ScanProgress.jsx
│           ├── ResultsView.jsx
│           ├── PhotoModal.jsx
│           ├── EventsView.jsx
│           ├── TrashView.jsx
│           └── ExportView.jsx
├── docs/
│   ├── TECHNICAL.md
│   ├── API.md
│   ├── FLOW.md
│   └── TUNING.md
├── manage.bat                # One-click dev server manager
├── manage.ps1                # PowerShell manager script
└── README.md
```
