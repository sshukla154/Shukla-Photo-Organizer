import { useEffect, useState, useMemo } from 'react';
import { getGroups, trashPhotos, formatBytes } from '../utils/api.js';
import PhotoModal from './PhotoModal.jsx';

function Thumb({ photoId }) {
  return (
    <img
      className="thumb"
      src={`/api/thumbnail?photo_id=${photoId}`}
      alt=""
      loading="lazy"
    />
  );
}

function ThumbStrip({ photoIds, bestId, onExpand }) {
  const max = 6;
  const ordered = bestId
    ? [bestId, ...photoIds.filter((id) => id !== bestId)]
    : photoIds;
  const shown = ordered.slice(0, max);
  const extra = photoIds.length - max;
  return (
    <div className="thumb-grid" onClick={onExpand} title="Click to review">
      {shown.map((id) => (
        <div key={id} style={{ position: 'relative' }}>
          <Thumb photoId={id} />
          {id === bestId && <div className="best-badge">Best</div>}
        </div>
      ))}
      {extra > 0 && <div className="thumb-more">+{extra}</div>}
    </div>
  );
}

export default function ResultsView({ folder }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');
  const [modal, setModal] = useState(null);

  async function load() {
    setLoading(true);
    try { setData(await getGroups(folder)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [folder]);

  const stats = useMemo(() => {
    if (!data) return null;
    const cleanupCount =
      data.blurry.length +
      data.duplicate_sets.reduce((n, s) => n + Math.max(0, s.photo_ids.length - 1), 0);
    const cleanupBytes =
      data.blurry.reduce((n, p) => n + (p.size_bytes || 0), 0) +
      data.duplicate_sets.reduce((total, set) => {
        const trashable = set.photo_ids
          .filter((id) => id !== set.best_photo_id)
          .map((id) => data.all_photos[id]).filter(Boolean);
        return total + trashable.reduce((s, p) => s + (p.size_bytes || 0), 0);
      }, 0);
    const groupsFound =
      (data.blurry.length ? 1 : 0) +
      data.duplicate_sets.length +
      (data.documents.length ? 1 : 0) +
      (data.screenshots.length ? 1 : 0) +
      data.faces.length;
    return { cleanupCount, cleanupBytes, groupsFound };
  }, [data]);

  async function handleTrash(ids) {
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} photo${ids.length !== 1 ? 's' : ''} to trash?`)) return;
    await trashPhotos(ids);
    await load();
  }

  async function handleModalConfirm({ trash }) {
    if (!trash.length) return;
    await trashPhotos(trash);
    setModal(null);
    await load();
  }

  if (loading || !data) return <p className="muted" style={{ paddingTop: 20 }}>Loading results…</p>;

  const show = (cat) => category === 'all' || category === cat;

  return (
    <>
      <div className="stat-grid">
        {[
          { label: 'Total photos',     value: data.total_photos.toLocaleString() },
          { label: 'Groups found',     value: stats.groupsFound },
          { label: 'Can clean up',     value: stats.cleanupCount.toLocaleString() },
          { label: 'Space to reclaim', value: formatBytes(stats.cleanupBytes) },
        ].map(({ label, value }) => (
          <div key={label} className="stat-card">
            <p className="stat-label">{label}</p>
            <p className="stat-value">{value}</p>
          </div>
        ))}
      </div>

      <div className="pill-row">
        {[
          ['all',    `All`,                            stats.groupsFound],
          ['blur',   `Blurry`,                         data.blurry.length],
          ['dup',    `Duplicates`,                     data.duplicate_sets.length],
          ['doc',    `Documents`,                      data.documents.length],
          ['people', `People`,                         data.faces.length],
          ['screen', `Screenshots`,                    data.screenshots.length],
        ].map(([key, label, count]) => (
          <button
            key={key}
            className={`pill ${category === key ? 'active' : ''}`}
            onClick={() => setCategory(key)}
          >
            {label} <span style={{ opacity: 0.65, marginLeft: 3 }}>{count}</span>
          </button>
        ))}
      </div>

      {show('blur') && data.blurry.length > 0 && (
        <GroupCard
          badge={<span className="badge danger">Blurry</span>}
          title={`${data.blurry.length} out-of-focus photos`}
          size={formatBytes(data.blurry.reduce((n, p) => n + (p.size_bytes || 0), 0))}
        >
          <ThumbStrip photoIds={data.blurry.map((p) => p.id)}
            onExpand={() => setModal({ photos: data.blurry.map((p) => p.id), bestId: null, title: `Blurry · ${data.blurry.length} photos` })} />
          <div className="actions">
            <button onClick={() => handleTrash(data.blurry.map((p) => p.id))}>Move all to trash</button>
            <button onClick={() => setModal({ photos: data.blurry.map((p) => p.id), bestId: null, title: `Blurry · ${data.blurry.length} photos` })}>Review individually</button>
          </div>
        </GroupCard>
      )}

      {show('dup') && data.duplicate_sets.map((set) => {
        const trashable = set.photo_ids.filter((id) => id !== set.best_photo_id);
        const totalBytes = set.photo_ids.reduce((a, id) => a + (data.all_photos[id]?.size_bytes || 0), 0);
        return (
          <GroupCard
            key={set.group_id}
            badge={<span className="badge amber">Duplicates</span>}
            title={`${set.photo_ids.length} near-identical shots`}
            size={formatBytes(totalBytes)}
          >
            <ThumbStrip photoIds={set.photo_ids} bestId={set.best_photo_id}
              onExpand={() => setModal({ photos: set.photo_ids, bestId: set.best_photo_id, title: `Duplicates · ${set.photo_ids.length} photos` })} />
            <div className="actions">
              <button onClick={() => handleTrash(trashable)}>Keep best only</button>
              <button onClick={() => setModal({ photos: set.photo_ids, bestId: set.best_photo_id, title: `Duplicates · ${set.photo_ids.length} photos` })}>Review</button>
            </div>
          </GroupCard>
        );
      })}

      {show('doc') && data.documents.length > 0 && (
        <GroupCard
          badge={<span className="badge info">Documents</span>}
          title={`${data.documents.length} photos of documents`}
          size={formatBytes(data.documents.reduce((n, p) => n + (p.size_bytes || 0), 0))}
        >
          <ThumbStrip photoIds={data.documents.map((p) => p.id)}
            onExpand={() => setModal({ photos: data.documents.map((p) => p.id), bestId: null, title: `Documents · ${data.documents.length} photos` })} />
          <div className="actions">
            <button onClick={() => setModal({ photos: data.documents.map((p) => p.id), bestId: null, title: `Documents · ${data.documents.length} photos` })}>Review</button>
          </div>
        </GroupCard>
      )}

      {show('screen') && data.screenshots.length > 0 && (
        <GroupCard
          badge={<span className="badge info">Screenshots</span>}
          title={`${data.screenshots.length} screenshots`}
          size={formatBytes(data.screenshots.reduce((n, p) => n + (p.size_bytes || 0), 0))}
        >
          <ThumbStrip photoIds={data.screenshots.map((p) => p.id)}
            onExpand={() => setModal({ photos: data.screenshots.map((p) => p.id), bestId: null, title: `Screenshots · ${data.screenshots.length} photos` })} />
          <div className="actions">
            <button onClick={() => setModal({ photos: data.screenshots.map((p) => p.id), bestId: null, title: `Screenshots · ${data.screenshots.length} photos` })}>Review</button>
          </div>
        </GroupCard>
      )}

      {show('people') && data.faces.length > 0 && (
        <GroupCard
          badge={<span className="badge purple">People</span>}
          title={`${data.faces.length} people detected`}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 2 }}>
            {data.faces.map((face, i) => (
              <div
                key={face.cluster_id}
                className="people-chip"
                onClick={() => setModal({ photos: face.photo_ids, bestId: null, title: `${face.label || `Person ${String.fromCharCode(65 + i)}`} · ${face.photo_ids.length} photos` })}
              >
                <div className="people-avatar">{String.fromCharCode(65 + i)}</div>
                <span style={{ fontSize: 13, fontWeight: 500 }}>
                  {face.label || `Person ${String.fromCharCode(65 + i)}`}
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 4 }}>
                    · {face.photo_ids.length}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </GroupCard>
      )}

      {!stats.groupsFound && (
        <div className="empty-state">
          <div className="empty-state-icon">✨</div>
          <h3>All clear!</h3>
          <p>No blurry photos, duplicates, documents, or screenshots found.</p>
        </div>
      )}

      <div className="footer-note">
        <span>🔒</span>
        <span>Nothing is permanently deleted — photos move to a local <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>.photo_organizer_trash</code> folder. Restore anytime from the Trash tab.</span>
      </div>

      {modal && (
        <PhotoModal
          photos={modal.photos}
          allPhotos={data.all_photos}
          bestId={modal.bestId}
          title={modal.title}
          onClose={() => setModal(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </>
  );
}

function GroupCard({ badge, title, size, children }) {
  return (
    <div className="group-card">
      <div className="group-header">
        <div className="group-header-left">
          {badge}
          <p className="group-title">{title}</p>
        </div>
        {size && <span className="muted" style={{ fontSize: 13 }}>{size}</span>}
      </div>
      {children}
    </div>
  );
}
