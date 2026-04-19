import { useEffect, useState } from 'react';
import { getTrash, restorePhotos, formatBytes } from '../utils/api.js';

export default function TrashView({ folder }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [working, setWorking] = useState(false);

  async function load() {
    setLoading(true);
    try { const d = await getTrash(folder); setData(d); setSelected(new Set()); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [folder]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!data) return;
    setSelected(selected.size === data.photos.length
      ? new Set()
      : new Set(data.photos.map((p) => p.id)));
  }

  async function handleRestore(ids) {
    if (!ids.length) return;
    if (!confirm(`Restore ${ids.length} photo${ids.length !== 1 ? 's' : ''} to original location?`)) return;
    setWorking(true);
    try { await restorePhotos(ids); await load(); }
    finally { setWorking(false); }
  }

  if (loading) return <p className="muted" style={{ paddingTop: 20 }}>Loading trash…</p>;

  if (!data?.photos?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🗑</div>
        <h3>Trash is empty</h3>
        <p>Photos you move to trash will appear here and can be restored at any time.</p>
      </div>
    );
  }

  const allSelected = selected.size === data.photos.length;

  return (
    <>
      <div className="trash-toolbar">
        <span style={{ fontSize: 13, fontWeight: 500 }}>
          {data.count} photo{data.count !== 1 ? 's' : ''} · {formatBytes(data.total_bytes)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={toggleAll}>
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
          <button
            disabled={!selected.size || working}
            onClick={() => handleRestore([...selected])}
          >
            Restore selected ({selected.size})
          </button>
          <button
            className="primary"
            disabled={working}
            onClick={() => handleRestore(data.photos.map((p) => p.id))}
          >
            Restore all
          </button>
        </div>
      </div>

      <div className="trash-grid">
        {data.photos.map((photo) => {
          const isSelected = selected.has(photo.id);
          const name = photo.original_path.split(/[\\/]/).pop();
          return (
            <div
              key={photo.id}
              className={`trash-card ${isSelected ? 'selected' : ''}`}
              onClick={() => toggle(photo.id)}
              title={photo.original_path}
            >
              <img className="trash-thumb" src={`/api/thumbnail?photo_id=${photo.id}`} alt="" loading="lazy" />
              <div className="trash-check">✓</div>
              <div className="trash-info">
                <div className="trash-filename">{name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
                  {formatBytes(photo.size_bytes)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
