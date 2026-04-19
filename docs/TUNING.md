# Tuning Guide — Shukla Photo Organizer

This document explains every tuneable constant in the analyzer pipeline, the trade-offs involved, and practical advice for different library types.

---

## 1. Blur Detection (`analyzers/blur.py`)

### `BLUR_THRESHOLD = 100`

The Laplacian variance below which a photo is flagged as blurry.

| Value | Effect |
|-------|--------|
| Lower (e.g. 50) | Flags only very blurry photos; more false negatives |
| Higher (e.g. 200) | Flags more photos; some slightly soft shots get flagged |

**Typical ranges by camera type**

| Source | Expected range |
|--------|---------------|
| Modern smartphone (2019+) | 200–2000 |
| Older smartphone | 80–500 |
| DSLR at f/1.8 | 500–5000 |
| Scanned prints | 30–150 |

**Tip:** Run a scan and check the `blur_score` values in the DB for your own photos before adjusting the threshold. Use SQLite Browser or:
```sql
SELECT path, blur_score FROM photos ORDER BY blur_score LIMIT 50;
```

---

## 2. Duplicate Detection (`analyzers/duplicate.py`)

### `hamming_threshold = 5` (passed at call site)

Maximum pHash Hamming distance for two photos to be considered near-duplicates. The pHash is a 64-bit value; a distance of 0 means identical hashes.

| Value | Effect |
|-------|--------|
| 0 | Exact hash matches only (still catches JPEG re-saves and slight crops) |
| 3 | Tight — same subject, slightly different framing |
| 5 (default) | Good balance for burst shots and similar edits |
| 10+ | May merge photos of similar but distinct subjects |

**Note:** MD5-identical files always cluster regardless of this threshold. The Hamming check only applies to pHash pairs.

**Performance:** The pHash comparison is O(n²). With 10,000 photos it's ~100M comparisons; still fast (milliseconds) because each comparison is a 64-bit XOR + popcount. Above ~50,000 photos consider lowering the threshold to reduce false positive work.

---

## 3. Document Detection (`analyzers/document.py`)

### `DOC_EDGE_DENSITY_MIN = 0.12`

Minimum fraction of pixels above the Sobel gradient mean+std threshold for a photo to be flagged as a document.

| Value | Effect |
|-------|--------|
| Lower (e.g. 0.08) | Flags more as documents; may catch busy street scenes |
| Higher (e.g. 0.18) | Only flags high-contrast documents with clear printed text |

### Aspect ratio tolerance

The tolerance `±0.15` is hard-coded. It is checked against:
- A4 paper: 1.414
- US Letter: 1.294
- Square: 1.0

If you're scanning unusual paper sizes (B5, legal, etc.) you can add entries to `DOCUMENT_RATIOS` in `document.py`.

### Screenshot detection

Screenshots are identified by:
1. **Filename prefix:** `screenshot`, `scr_` (case-insensitive)
2. **Exact resolution match:** against a built-in list of common screen resolutions

To add your monitor's resolution, append it to `SCREEN_RESOLUTIONS` in `document.py`:
```python
SCREEN_RESOLUTIONS = {
    (1920, 1080), (2560, 1440), (3840, 2160),
    (2560, 1600),   # add your resolution here
    ...
}
```

---

## 4. EXIF / GPS Extraction (`analyzers/exif.py`)

No tuneable thresholds. The extractor reads:
- `DateTimeOriginal` (preferred) or `DateTime` EXIF tags
- `GPSLatitude`, `GPSLatitudeRef`, `GPSLongitude`, `GPSLongitudeRef`

**Tip:** HEIC files may need `pillow-heif` installed for full EXIF support. Add `pillow-heif` to `requirements.txt` and register it:
```python
from pillow_heif import register_heif_opener
register_heif_opener()
```

---

## 5. Exposure Scoring (`analyzers/exposure.py`)

No single threshold to tune. The score is a composite penalty:

```
score = 1
      - 0.6 × clip_penalty   (blown highlights + crushed shadows)
      - 0.4 × mean_deviation  (distance from mid-gray 128)
```

The weights `0.6` and `0.4` can be adjusted in `exposure.py` if you prefer to emphasise tonal balance over clipping prevention, or vice versa.

---

## 6. Face Clustering (`analyzers/faces.py`)

### `FACE_DISTANCE_THRESHOLD = 0.55`

Maximum Euclidean distance between face encodings to merge two faces into the same cluster. Values from `face_recognition` range from 0 (identical) to ~1 (completely different person).

| Value | Effect |
|-------|--------|
| 0.4 | Very strict — useful for distinguishing twins or look-alikes |
| 0.55 (default) | Good balance; tolerates lighting and angle variation |
| 0.65+ | More forgiving; may merge different people in large libraries |

**Note:** Face clustering requires the optional `face_recognition` package (dlib). If it is not installed, this phase is silently skipped and no face groups appear.

**Performance:** HOG face detection is fast (CPU). CNN detection is more accurate but significantly slower. To enable CNN:
```python
face_locations = face_recognition.face_locations(rgb, model="cnn")
```

---

## 7. Event Clustering (`analyzers/events.py`)

### `TIME_GAP_HOURS = 4.0`

Time gap between consecutive photos (sorted by EXIF datetime) that triggers a new event.

| Value | Effect |
|-------|--------|
| 1 h | Very fine-grained events; a short lunch break becomes its own album |
| 4 h (default) | Natural day-segment splits (morning/afternoon/evening) |
| 12 h | Splits only on overnight gaps |
| 24 h | One event per calendar day |

### `GPS_GAP_KM = 0.5`

GPS distance jump (haversine, great-circle) that also triggers a new event regardless of time.

| Value | Effect |
|-------|--------|
| 0.1 km | Very sensitive to location; walking across a park starts a new event |
| 0.5 km (default) | Distinguishes different venues in the same city |
| 2+ km | Only splits on clearly different areas of a city |

**Tip:** If your library has many outdoor walks, lower `GPS_GAP_KM` to get more granular location-based events. If you're a frequent traveller, keep it higher to avoid micro-splitting.

---

## 8. Best-Shot Ranking (`analyzers/ranking.py`)

### Weights: `W_SHARPNESS = 0.5`, `W_EXPOSURE = 0.3`, `W_FACE = 0.2`

Composite score = `W_SHARPNESS × sharpness + W_EXPOSURE × exposure_score + W_FACE × face_quality`

- `sharpness` = `min(blur_score / BLUR_CAP, 1.0)` where `BLUR_CAP = 2000`
- `face_quality` = `best_face_score` (largest detected face area ratio, 0–1)

**Common adjustments**

| Use case | Suggested weights |
|----------|-----------------|
| Portrait photography | `W_FACE = 0.5, W_SHARPNESS = 0.3, W_EXPOSURE = 0.2` |
| Landscape photography | `W_SHARPNESS = 0.5, W_EXPOSURE = 0.5, W_FACE = 0.0` |
| Event/party photos | `W_SHARPNESS = 0.4, W_EXPOSURE = 0.3, W_FACE = 0.3` |

### `BLUR_CAP = 2000`

Normalises blur scores above this value to 1.0 (fully sharp). A typical sharp photo scores 300–1500; raise this cap only if your camera consistently produces scores above 2000.

---

## 9. Performance Tips

- **Large libraries (10k+ photos):** The pHash O(n²) comparison is the main bottleneck. Consider lowering `hamming_threshold` to 3 or 0 to reduce the number of edge-traversals in union-find.
- **Slow HEIC decoding:** Convert HEIC files to JPEG before scanning if you have many, or install `pillow-heif` for faster native decoding.
- **Face clustering overhead:** Disable face clustering (`include_faces: false` in the scan request) for quick re-scans when you only care about duplicates and blur.
- **Re-scanning:** The database uses `UPSERT ON CONFLICT (path)`, so re-scanning a folder updates all metadata without duplicating rows. Only the group tables are cleared and rebuilt.
