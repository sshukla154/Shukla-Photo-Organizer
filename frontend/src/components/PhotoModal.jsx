import { useState, useEffect } from 'react';
import { formatBytes } from '../utils/api.js';

function Thumb({ photoId, selected, onToggle, isBest }) {
  return (
    <div
      className={`modal-thumb-wrap ${selected ? 'selected' : ''}`}
      onClick={() => onToggle(photoId)}
    >
      <img className="modal-thumb" src={`/api/thumbnail?photo_id=${photoId}`} alt="" loading="lazy" />
      {isBest && <div className="modal-best-badge">Best</div>}
      <div className="modal-check">✓</div>
    </div>
  );
}

export default function PhotoModal({ photos, allPhotos, bestId, title, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set(bestId ? [bestId] : []));

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const toTrash = photos.filter((id) => !selected.has(id));
  const keptBytes  = [...selected].reduce((s, id) => s + (allPhotos[id]?.size_bytes || 0), 0);
  const trashBytes = toTrash.reduce((s, id) => s + (allPhotos[id]?.size_bytes || 0), 0);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-header-title">{title}</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-toolbar">
          <button onClick={() => setSelected(new Set(photos))}>Select all</button>
          {bestId && <button onClick={() => setSelected(new Set([bestId]))}>Keep best only</button>}
          <button onClick={() => setSelected(new Set())}>Deselect all</button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>✓ Keep {selected.size} ({formatBytes(keptBytes)})</span>
            {toTrash.length > 0 && <span style={{ color: 'var(--danger-text)' }}>🗑 Trash {toTrash.length} ({formatBytes(trashBytes)})</span>}
          </div>
        </div>

        <div className="modal-grid">
          {photos.map((id) => (
            <div key={id}>
              <Thumb photoId={id} selected={selected.has(id)} onToggle={toggle} isBest={id === bestId} />
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, textAlign: 'center' }}>
                {formatBytes(allPhotos[id]?.size_bytes)}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={toTrash.length === 0}
            onClick={() => onConfirm({ keep: [...selected], trash: toTrash })}
          >
            Trash {toTrash.length} photo{toTrash.length !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
