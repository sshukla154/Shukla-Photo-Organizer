# Flow Diagrams — Shukla Photo Organizer

## 1. User Journey

```
Open http://localhost:5173
          |
          v
   [ FolderPicker ]
     Click "Browse for folder"
     or paste an absolute path
          |
          v
   Click "Scan"
          |
          v
   [ ScanProgress ]
     SSE stream renders live
     progress bar + file log
          |
     scan complete
          |
          v
   [ Main — 4 tabs ]
     ┌──────────┬────────────┬───────┬────────┐
     │ Results  │   Events   │ Trash │ Export │
     └──────────┴────────────┴───────┴────────┘
          |             |        |        |
          v             v        v        v
       Review        Browse    Restore  Generate
       groups        albums    trashed  HTML gallery
       in modal               photos
```

---

## 2. Scan Data Flow

```
POST /api/scan
      |
      v
scanner.scan(folder, include_faces)
      |
      |── Phase 1: discover ──────────────────────────────────────
      |   glob("**/*.{jpg,jpeg,png,webp,heic,bmp,tiff}")
      |   yield { phase: "discovered", total: N }
      |
      |── Phase 2: analyze ──────────────────────────────────────
      |   for each file:
      |     open PIL Image
      |     md5(file bytes)
      |     compute_phash(img)                  ← duplicate.py
      |     compute_blur_score(img)             ← blur.py
      |     is_blurry(score)
      |     detect_document_or_screenshot(img)  ← document.py
      |     extract_exif(img)                   ← exif.py
      |     compute_exposure_score(img)         ← exposure.py
      |     db.upsert_photo(data)
      |     yield { phase: "analyzed", done, total, path }
      |
      |── Phase 3: duplicate clustering ─────────────────────────
      |   find_duplicate_clusters(all_photos)   ← duplicate.py
      |     union-find on md5 + pHash Hamming distance ≤ 5
      |   pick_best(group)                      ← ranking.py
      |     composite_score = 0.5*sharpness + 0.3*exposure + 0.2*face_quality
      |   db.save_duplicate_group(folder, ids, best_id)
      |   yield { phase: "grouping/duplicates" }
      |
      |── Phase 4: face clustering (optional) ───────────────────
      |   if include_faces and face_recognition installed:
      |     for each photo: detect faces, compute encodings
      |     greedy online clustering (threshold 0.55)
      |     db.save_face_cluster(folder, members)
      |   yield { phase: "grouping/faces" }
      |
      |── Phase 5: event clustering ─────────────────────────────
      |   cluster_events(all_photos)            ← events.py
      |     sort by exif_datetime (fallback: mtime)
      |     new event when:
      |       time gap > 4 h  OR
      |       GPS jump > 0.5 km (haversine)
      |   db.save_event_album(folder, ids, start, end)
      |   yield { phase: "grouping/events" }
      |
      └── Phase 6: done ─────────────────────────────────────────
          yield { phase: "done", total: N }
```

---

## 3. Frontend State Machine

```
         ┌──────────────────────────────────────────────────────┐
         │                    App State                         │
         │                                                      │
         │  "picker"  ──[scan]──>  "scanning"  ──[done]──>  "main"
         │      ^                      |                        |
         │      |_____[cancel]_________|                        |
         │                                              ┌───────┴───────┐
         │                                              │  Active tab   │
         │                                              │  results      │
         │                                              │  events       │
         │                                              │  trash        │
         │                                              │  export       │
         │                                              └───────────────┘
         └──────────────────────────────────────────────────────┘
```

---

## 4. Trash / Restore Flow

```
User selects photos in ResultsView / PhotoModal
            |
            v
       trashPhotos(ids)
       POST /api/trash  { photo_ids: [17, 42] }
            |
            v  (backend)
       for each id:
         move file → <folder>/.photo_organizer_trash/<name>
         db.mark_trashed(id, new_path)
            |
            v
       { moved: [17, 42], count: 2 }
            |
            v  (frontend refreshes TrashView)

─────────────────────────────────────────────────────────

User opens Trash tab → TrashView
            |
            v
       GET /api/trash?folder_path=...
            |
            v
       Grid of trashed photos
            |
       [Restore selected] or [Restore all]
            |
            v
       restorePhotos(ids)
       POST /api/restore  { photo_ids: [17, 42] }
            |
            v  (backend)
       for each id:
         recreate parent dir if needed
         move file → original_path (collision-safe)
         db.mark_restored(id)
            |
            v
       { restored: [17, 42], count: 2, errors: [] }
```

---

## 5. Export Flow

```
User fills ExportView form
  - output folder path
  - category checkboxes
  - event album checkboxes
            |
            v
       startExport(...)
       POST /api/export  { folder_path, output_path, categories, event_ids }
            |
            v  (backend: exporter.py)
       1. query DB for photos matching filters
       2. mkdir output/images, output/thumbs
       3. for each photo:
            copy original → output/images/<name>
            generate 400×400 JPEG → output/thumbs/<name>
            emit SSE: { phase: "copy"/"thumb", done, total, path }
       4. build data.json (photo metadata)
       5. write output/index.html
            embedded: <script>const GALLERY_DATA = {...}</script>
            inline JS: lightbox, category filter pills, keyboard nav
       6. emit SSE: { phase: "done", output: "...index.html" }
            |
            v
       ExportView shows "Open gallery" link
```

---

## 6. Component Tree

```
App
├── FolderPicker           (state: "picker")
├── ScanProgress           (state: "scanning")
└── Main                   (state: "main")
    ├── TopBar             (folder path, Change folder, Rescan)
    ├── TabNav             (Results | Events | Trash | Export)
    ├── ResultsView        (tab: "results")
    │   ├── StatCards
    │   ├── CategoryPills  (filter)
    │   └── GroupCards
    │       └── ThumbStrip
    │           └── PhotoModal (overlay)
    ├── EventsView         (tab: "events")
    │   └── AlbumCards
    ├── TrashView          (tab: "trash")
    │   └── PhotoGrid
    └── ExportView         (tab: "export")
        └── SSEProgressBar
```
