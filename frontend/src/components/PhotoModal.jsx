import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatBytes, thumbnailUrl } from '../utils/api.js';

/* ── Thumbnail tile used in grid mode ─────────────────────── */
function Thumb({ photoId, selected, onToggle, isBest }) {
  return (
    <div
      className={`modal-thumb-wrap ${selected ? 'selected' : ''}`}
      onClick={() => onToggle(photoId)}
    >
      <img className="modal-thumb" src={thumbnailUrl(photoId)} alt="" loading="lazy" />
      {isBest && <div className="modal-best-badge">Best</div>}
      <div className="modal-check">✓</div>
    </div>
  );
}

/* ── Before/after slider used in compare mode ─────────────── */
function CompareSlider({ leftId, rightId, bestId, selected, onToggle }) {
  const [pct, setPct] = useState(50);
  const wrapRef = useRef(null);
  const dragging = useRef(false);

  const updatePct = useCallback((clientX) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const raw = ((clientX - rect.left) / rect.width) * 100;
    setPct(Math.min(100, Math.max(0, raw)));
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    updatePct(e.clientX);
  }, [updatePct]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div ref={wrapRef} className="compare-wrap">
      {/* Left photo */}
      <div className="compare-before">
        <img src={thumbnailUrl(leftId)} alt="left" draggable={false} />
      </div>

      {/* Right photo — clipped from the left edge to reveal */}
      <div
        className="compare-after"
        style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
      >
        <img src={thumbnailUrl(rightId)} alt="right" draggable={false} />
      </div>

      {/* Drag handle */}
      <div
        className="compare-handle"
        style={{ left: `${pct}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />

      {/* Left side overlays */}
      <div className="compare-side-checkbox" style={{ left: 10 }}>
        <div
          className={`modal-thumb-wrap ${selected.has(leftId) ? 'selected' : ''}`}
          style={{ width: 32, height: 32, borderRadius: 6, boxShadow: 'var(--shadow-md)' }}
          onClick={() => onToggle(leftId)}
        >
          <div className="modal-check" style={{ opacity: selected.has(leftId) ? 1 : 0.6 }}>✓</div>
        </div>
      </div>
      {leftId === bestId && (
        <div className="compare-side-badge" style={{ left: 10 }}>★ Best</div>
      )}

      {/* Right side overlays */}
      <div className="compare-side-checkbox" style={{ right: 10 }}>
        <div
          className={`modal-thumb-wrap ${selected.has(rightId) ? 'selected' : ''}`}
          style={{ width: 32, height: 32, borderRadius: 6, boxShadow: 'var(--shadow-md)' }}
          onClick={() => onToggle(rightId)}
        >
          <div className="modal-check" style={{ opacity: selected.has(rightId) ? 1 : 0.6 }}>✓</div>
        </div>
      </div>
      {rightId === bestId && (
        <div className="compare-side-badge" style={{ right: 10 }}>★ Best</div>
      )}
    </div>
  );
}

/* ── Build list of pairs to cycle through ─────────────────── */
function buildPairs(photoIds, bestId) {
  if (photoIds.length < 2) return [];
  // If there's a best photo, compare it against every other one
  if (bestId && photoIds.includes(bestId)) {
    return photoIds
      .filter((id) => id !== bestId)
      .map((id) => [bestId, id]);
  }
  // Otherwise sequential pairs
  const pairs = [];
  for (let i = 0; i < photoIds.length - 1; i++) {
    pairs.push([photoIds[i], photoIds[i + 1]]);
  }
  return pairs;
}

/* ── Main modal ───────────────────────────────────────────── */
export default function PhotoModal({ photos, allPhotos, bestId, title, onClose, onConfirm }) {
  const [selected, setSelected] = useState(() => new Set(bestId ? [bestId] : []));
  const [mode, setMode] = useState('grid');   // 'grid' | 'compare'
  const [pairIndex, setPairIndex] = useState(0);

  const pairs = useMemo(() => buildPairs(photos, bestId), [photos, bestId]);

  // Clamp pairIndex when pairs change
  useEffect(() => {
    setPairIndex((i) => Math.min(i, Math.max(0, pairs.length - 1)));
  }, [pairs.length]);

  // Keyboard: Escape closes; arrow keys navigate pairs in compare mode
  useEffect(() => {
    function handler(e) {
      if (e.key === 'Escape') { onClose(); return; }
      if (mode === 'compare') {
        if (e.key === 'ArrowRight') setPairIndex((i) => Math.min(i + 1, pairs.length - 1));
        if (e.key === 'ArrowLeft')  setPairIndex((i) => Math.max(i - 1, 0));
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, mode, pairs.length]);

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

  const currentPair = pairs[pairIndex] ?? [photos[0], photos[1]];

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">

        {/* Header */}
        <div className="modal-header">
          <span className="modal-header-title">{title}</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Toolbar */}
        <div className="modal-toolbar">
          {mode === 'grid' ? (
            <>
              <button onClick={() => setSelected(new Set(photos))}>Select all</button>
              {bestId && <button onClick={() => setSelected(new Set([bestId]))}>Keep best only</button>}
              <button onClick={() => setSelected(new Set())}>Deselect all</button>
              {photos.length >= 2 && (
                <button
                  style={{ marginLeft: 8, background: 'var(--accent-light)', color: 'var(--accent)', borderColor: 'var(--accent)' }}
                  onClick={() => { setMode('compare'); setPairIndex(0); }}
                >
                  ⇔ Compare
                </button>
              )}
            </>
          ) : (
            <button onClick={() => setMode('grid')}>↩ Back to grid</button>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)' }}>
            <span>✓ Keep {selected.size} ({formatBytes(keptBytes)})</span>
            {toTrash.length > 0 && (
              <span style={{ color: 'var(--danger-text)' }}>🗑 Trash {toTrash.length} ({formatBytes(trashBytes)})</span>
            )}
          </div>
        </div>

        {/* Body */}
        {mode === 'grid' ? (
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
        ) : (
          <div style={{ padding: '16px 24px' }}>
            <CompareSlider
              key={`${currentPair[0]}-${currentPair[1]}`}
              leftId={currentPair[0]}
              rightId={currentPair[1]}
              bestId={bestId}
              selected={selected}
              onToggle={toggle}
            />

            {/* Pair navigation */}
            {pairs.length > 1 && (
              <div className="compare-nav">
                <button
                  disabled={pairIndex === 0}
                  onClick={() => setPairIndex((i) => i - 1)}
                  style={{ padding: '5px 12px' }}
                >
                  ← Prev
                </button>
                <span>Pair {pairIndex + 1} of {pairs.length}</span>
                <button
                  disabled={pairIndex === pairs.length - 1}
                  onClick={() => setPairIndex((i) => i + 1)}
                  style={{ padding: '5px 12px' }}
                >
                  Next →
                </button>
              </div>
            )}

            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Drag the handle to compare · ← → to cycle pairs · checkboxes to select
            </div>
          </div>
        )}

        {/* Footer */}
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
