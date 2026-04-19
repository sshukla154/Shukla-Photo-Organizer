"""Static gallery exporter.

Generates a self-contained HTML/CSS/JS gallery that works offline
(file:// protocol or simple HTTP server).
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import AsyncIterator

from PIL import Image

from db import Database

THUMB_SIZE = (400, 400)


async def export_gallery(
    db: Database,
    folder: Path,
    output: Path,
    categories: list[str],
    event_ids: list[int],
) -> AsyncIterator[str]:
    groups = db.get_groups(str(folder))
    all_photos: dict[int, dict] = groups["all_photos"]
    # also fetch full records for path access
    full_photos = {p["id"]: p for p in db.photos_in_folder(str(folder))}

    # determine which photo IDs to export
    export_ids: set[int] = set()
    if not categories or "blurry" in categories:
        export_ids.update(p["id"] for p in groups["blurry"])
    if not categories or "duplicates" in categories:
        for s in groups["duplicate_sets"]:
            export_ids.update(s["photo_ids"])
    if not categories or "documents" in categories:
        export_ids.update(p["id"] for p in groups["documents"])
    if not categories or "screenshots" in categories:
        export_ids.update(p["id"] for p in groups["screenshots"])
    if not categories or "events" in categories:
        for ev in groups.get("events", []):
            if not event_ids or ev["album_id"] in event_ids:
                export_ids.update(ev["photo_ids"])
    # if no category filter given, export everything
    if not categories:
        export_ids = set(full_photos.keys())

    total = len(export_ids)
    yield json.dumps({"phase": "export_start", "total": total})

    output.mkdir(parents=True, exist_ok=True)
    images_dir = output / "images"
    thumbs_dir = output / "thumbs"
    images_dir.mkdir(exist_ok=True)
    thumbs_dir.mkdir(exist_ok=True)

    exported_meta: list[dict] = []
    for idx, pid in enumerate(sorted(export_ids), start=1):
        photo = full_photos.get(pid)
        if not photo:
            continue
        src = Path(photo["path"])
        if not src.exists():
            continue
        dest_name = f"{pid}{src.suffix.lower()}"
        shutil.copy2(str(src), str(images_dir / dest_name))

        # generate thumbnail
        try:
            with Image.open(src) as img:
                img.thumbnail(THUMB_SIZE)
                thumb_name = f"{pid}.jpg"
                img.convert("RGB").save(str(thumbs_dir / thumb_name), "JPEG", quality=75)
        except Exception:
            thumb_name = dest_name

        slim = all_photos.get(pid, {})
        exported_meta.append({
            "id": pid,
            "file": f"images/{dest_name}",
            "thumb": f"thumbs/{thumb_name}",
            "size_bytes": photo.get("size_bytes"),
            "width": photo.get("width"),
            "height": photo.get("height"),
            "exif_datetime": photo.get("exif_datetime"),
            "blur_score": photo.get("blur_score"),
            "exposure_score": photo.get("exposure_score"),
            "is_blurry": bool(photo.get("is_blurry")),
            "is_document": bool(photo.get("is_document")),
            "is_screenshot": bool(photo.get("is_screenshot")),
        })
        yield json.dumps({"phase": "export_progress", "index": idx, "total": total, "filename": src.name})

    # build groups metadata for the gallery viewer
    gallery_data = {
        "exported_at": datetime.now().isoformat(),
        "source_folder": str(folder),
        "photos": exported_meta,
        "duplicate_sets": groups["duplicate_sets"],
        "faces": groups["faces"],
        "events": groups.get("events", []),
    }

    # write index.html with data.json embedded as inline script
    data_json = json.dumps(gallery_data, indent=2)
    html = _render_html(data_json)
    (output / "index.html").write_text(html, encoding="utf-8")

    yield json.dumps({"phase": "export_done", "output": str(output), "total": total})


def _render_html(data_json: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Photo Gallery</title>
<style>
{_GALLERY_CSS}
</style>
</head>
<body>
<div id="app"></div>
<script>
const GALLERY_DATA = {data_json};
{_GALLERY_JS}
</script>
</body>
</html>"""


_GALLERY_CSS = """
:root {
  --bg: #fafaf7; --surface: #fff; --surface-2: #f1efe8;
  --text: #1a1a18; --muted: #5f5e5a; --border: rgba(0,0,0,.1);
  --accent: #1a1a18; --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
       font-size: 14px; background: var(--bg); color: var(--text); }
#app { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
h1 { font-size: 22px; font-weight: 500; margin-bottom: 4px; }
.meta { color: var(--muted); font-size: 13px; margin-bottom: 24px; }
.filter-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
.pill { font-size: 13px; padding: 5px 14px; border-radius: 999px;
        border: 0.5px solid var(--border); background: transparent; cursor: pointer; }
.pill.active { background: var(--accent); color: #fff; border-color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.card { border-radius: var(--radius); overflow: hidden; background: var(--surface);
        border: 0.5px solid var(--border); cursor: pointer; transition: transform 120ms; }
.card:hover { transform: scale(1.02); }
.card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.card-info { padding: 8px 10px; font-size: 12px; color: var(--muted); }
.badge { display: inline-block; font-size: 11px; font-weight: 500; padding: 2px 7px;
         border-radius: 4px; margin-right: 4px; }
.badge.blur { background: #fcebeb; color: #791f1f; }
.badge.doc  { background: #e6f1fb; color: #0c447c; }
.badge.dup  { background: #faeeda; color: #633806; }
.badge.screen { background: #eeedfe; color: #3c3489; }
/* lightbox */
.lb-overlay { display:none; position:fixed; inset:0; background:rgba(0,0,0,.85);
              z-index:100; align-items:center; justify-content:center; }
.lb-overlay.open { display:flex; }
.lb-overlay img { max-width:90vw; max-height:90vh; border-radius:var(--radius); }
.lb-close { position:absolute; top:16px; right:20px; font-size:28px; color:#fff;
            cursor:pointer; background:none; border:none; line-height:1; }
.lb-prev, .lb-next { position:absolute; top:50%; transform:translateY(-50%);
                      font-size:36px; color:#fff; cursor:pointer;
                      background:none; border:none; padding:0 16px; }
.lb-prev { left:0; } .lb-next { right:0; }
"""

_GALLERY_JS = """
(function() {
  const photos = GALLERY_DATA.photos;
  let activeFilter = 'all';
  let lbIndex = 0;
  let visiblePhotos = [];

  function formatBytes(n) {
    if (!n) return '';
    const units = ['B','KB','MB','GB'];
    let i = 0; while (n >= 1024 && i < units.length-1) { n /= 1024; i++; }
    return n.toFixed(1) + ' ' + units[i];
  }

  function photoMatchesFilter(p) {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'blurry') return p.is_blurry;
    if (activeFilter === 'documents') return p.is_document;
    if (activeFilter === 'screenshots') return p.is_screenshot;
    if (activeFilter === 'duplicates') {
      const dupIds = new Set(GALLERY_DATA.duplicate_sets.flatMap(s => s.photo_ids));
      return dupIds.has(p.id);
    }
    return true;
  }

  function badges(p) {
    let b = '';
    if (p.is_blurry)    b += '<span class="badge blur">Blurry</span>';
    if (p.is_document)  b += '<span class="badge doc">Doc</span>';
    if (p.is_screenshot) b += '<span class="badge screen">Screenshot</span>';
    const dupIds = new Set(GALLERY_DATA.duplicate_sets.flatMap(s => s.photo_ids));
    if (dupIds.has(p.id)) b += '<span class="badge dup">Dup</span>';
    return b;
  }

  function render() {
    visiblePhotos = photos.filter(photoMatchesFilter);
    const app = document.getElementById('app');
    app.innerHTML = `
      <h1>Photo Gallery</h1>
      <p class="meta">Exported ${new Date(GALLERY_DATA.exported_at).toLocaleDateString()} &middot; ${photos.length} photos &middot; Source: ${GALLERY_DATA.source_folder}</p>
      <div class="filter-row" id="filters"></div>
      <div class="grid" id="grid"></div>
      <div class="lb-overlay" id="lb">
        <button class="lb-close" id="lb-close">&times;</button>
        <button class="lb-prev" id="lb-prev">&#8249;</button>
        <img id="lb-img" src="" alt="">
        <button class="lb-next" id="lb-next">&#8250;</button>
      </div>
    `;

    const filters = [
      ['all', 'All'],
      ['blurry', 'Blurry'],
      ['duplicates', 'Duplicates'],
      ['documents', 'Documents'],
      ['screenshots', 'Screenshots'],
    ];
    const filterRow = document.getElementById('filters');
    filters.forEach(([key, label]) => {
      const btn = document.createElement('button');
      btn.className = 'pill' + (activeFilter === key ? ' active' : '');
      btn.textContent = label;
      btn.onclick = () => { activeFilter = key; render(); };
      filterRow.appendChild(btn);
    });

    const grid = document.getElementById('grid');
    visiblePhotos.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<img src="${p.thumb}" loading="lazy" alt=""><div class="card-info">${badges(p)}<div style="margin-top:4px">${formatBytes(p.size_bytes)}</div></div>`;
      card.onclick = () => openLightbox(i);
      grid.appendChild(card);
    });

    document.getElementById('lb-close').onclick = closeLightbox;
    document.getElementById('lb-prev').onclick = () => moveLb(-1);
    document.getElementById('lb-next').onclick = () => moveLb(1);
    document.getElementById('lb').onclick = (e) => { if (e.target.id === 'lb') closeLightbox(); };
    document.addEventListener('keydown', handleKey);
  }

  function openLightbox(i) {
    lbIndex = i;
    document.getElementById('lb-img').src = visiblePhotos[i].file;
    document.getElementById('lb').classList.add('open');
  }
  function closeLightbox() {
    document.getElementById('lb').classList.remove('open');
    document.removeEventListener('keydown', handleKey);
  }
  function moveLb(dir) {
    lbIndex = (lbIndex + dir + visiblePhotos.length) % visiblePhotos.length;
    document.getElementById('lb-img').src = visiblePhotos[lbIndex].file;
  }
  function handleKey(e) {
    if (e.key === 'ArrowRight') moveLb(1);
    if (e.key === 'ArrowLeft') moveLb(-1);
    if (e.key === 'Escape') closeLightbox();
  }

  render();
})();
"""
