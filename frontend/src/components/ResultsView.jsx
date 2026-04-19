import { useEffect, useState, useMemo } from 'react';

function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

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

function ThumbStrip({ photoIds, starFirst = false }) {
  const max = 5;
  const shown = photoIds.slice(0, max);
  const extra = photoIds.length - max;
  return (
    <div className="thumb-grid">
      {shown.map((id, i) => (
        <div key={id} style={{ position: 'relative' }}>
          <Thumb photoId={id} />
          {starFirst && i === 0 && (
            <div style={{
              position: 'absolute', top: 4, right: 4,
              background: 'white', color: 'black',
              fontSize: 10, fontWeight: 500,
              padding: '2px 6px', borderRadius: 4,
            }}>Best</div>
          )}
        </div>
      ))}
      {extra > 0 && <div className="thumb-more">+{extra}</div>}
    </div>
  );
}

export default function ResultsView({ folder, onChangeFolder, onRescan }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/groups?folder_path=${encodeURIComponent(folder)}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [folder]);

  const stats = useMemo(() => {
    if (!data) return null;
    const cleanupCount =
      data.blurry.length +
      data.duplicate_sets.reduce((n, s) => n + Math.max(0, s.photo_ids.length - 1), 0);
    const cleanupBytes =
      data.blurry.reduce((n, p) => n + (p.size_bytes || 0), 0) +
      data.duplicate_sets.reduce((total, set) => {
        const members = set.photo_ids
          .map((id) => data.all_photos[id])
          .filter(Boolean);
        const trashable = members.filter((p) => p.id !== set.best_photo_id);
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

  async function trashPhotos(ids) {
    if (!ids.length) return;
    if (!confirm(`Move ${ids.length} photos to local trash folder?`)) return;
    await fetch('/api/trash', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_ids: ids }),
    });
    // refresh
    const r = await fetch(`/api/groups?folder_path=${encodeURIComponent(folder)}`);
    setData(await r.json());
  }

  if (loading || !data) {
    return <p className="muted">Loading results…</p>;
  }

  const show = (cat) => category === 'all' || category === cat;

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, padding: '12px 16px',
        background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
        marginBottom: 16,
      }}>
        <div style={{ minWidth: 0 }}>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>Scanning folder</p>
          <p style={{
            fontSize: 14, fontWeight: 500, margin: 0,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{folder}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onChangeFolder}>Change folder</button>
          <button onClick={onRescan}>Rescan</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <p className="stat-label">Total photos</p>
          <p className="stat-value">{data.total_photos.toLocaleString()}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Groups found</p>
          <p className="stat-value">{stats.groupsFound}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Can cleanup</p>
          <p className="stat-value">{stats.cleanupCount}</p>
        </div>
        <div className="stat-card">
          <p className="stat-label">Space to reclaim</p>
          <p className="stat-value">{formatBytes(stats.cleanupBytes)}</p>
        </div>
      </div>

      <div className="pill-row">
        {[
          ['all', `All (${stats.groupsFound})`],
          ['blur', `Blurry (${data.blurry.length})`],
          ['dup', `Duplicates (${data.duplicate_sets.length})`],
          ['doc', `Documents (${data.documents.length})`],
          ['people', `People (${data.faces.length})`],
          ['screen', `Screenshots (${data.screenshots.length})`],
        ].map(([key, label]) => (
          <button
            key={key}
            className={`pill ${category === key ? 'active' : ''}`}
            onClick={() => setCategory(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {show('blur') && data.blurry.length > 0 && (
        <div className="group-card">
          <div className="group-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge danger">Blurry</span>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {data.blurry.length} photos flagged as out of focus
              </p>
            </div>
            <span className="muted">
              {formatBytes(data.blurry.reduce((n, p) => n + (p.size_bytes || 0), 0))}
            </span>
          </div>
          <ThumbStrip photoIds={data.blurry.map((p) => p.id)} />
          <div className="actions">
            <button onClick={() => trashPhotos(data.blurry.map((p) => p.id))}>
              Move to trash
            </button>
          </div>
        </div>
      )}

      {show('dup') && data.duplicate_sets.map((set) => {
        const ordered = [
          set.best_photo_id,
          ...set.photo_ids.filter((id) => id !== set.best_photo_id),
        ];
        const trashable = set.photo_ids.filter((id) => id !== set.best_photo_id);
        const totalBytes = set.photo_ids
          .map((id) => data.all_photos[id]?.size_bytes || 0)
          .reduce((a, b) => a + b, 0);
        return (
          <div key={set.group_id} className="group-card">
            <div className="group-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge amber">Duplicates</span>
                <p style={{ margin: 0, fontWeight: 500 }}>
                  {set.photo_ids.length} near-identical shots
                </p>
              </div>
              <span className="muted">{formatBytes(totalBytes)}</span>
            </div>
            <ThumbStrip photoIds={ordered} starFirst />
            <div className="actions">
              <button onClick={() => trashPhotos(trashable)}>Keep best only</button>
            </div>
          </div>
        );
      })}

      {show('doc') && data.documents.length > 0 && (
        <div className="group-card">
          <div className="group-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge info">Documents</span>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {data.documents.length} photos of documents
              </p>
            </div>
            <span className="muted">
              {formatBytes(data.documents.reduce((n, p) => n + (p.size_bytes || 0), 0))}
            </span>
          </div>
          <ThumbStrip photoIds={data.documents.map((p) => p.id)} />
        </div>
      )}

      {show('screen') && data.screenshots.length > 0 && (
        <div className="group-card">
          <div className="group-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge info">Screenshots</span>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {data.screenshots.length} screenshots
              </p>
            </div>
            <span className="muted">
              {formatBytes(data.screenshots.reduce((n, p) => n + (p.size_bytes || 0), 0))}
            </span>
          </div>
          <ThumbStrip photoIds={data.screenshots.map((p) => p.id)} />
        </div>
      )}

      {show('people') && data.faces.length > 0 && (
        <div className="group-card">
          <div className="group-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="badge purple">People</span>
              <p style={{ margin: 0, fontWeight: 500 }}>
                {data.faces.length} people detected
              </p>
            </div>
          </div>
          <div>
            {data.faces.map((face, i) => (
              <div key={face.cluster_id} className="people-chip">
                <div className="people-avatar" />
                <span style={{ fontSize: 13 }}>
                  {face.label || `Person ${String.fromCharCode(65 + i)}`} · {face.photo_ids.length} photos
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{
        marginTop: 20, padding: '14px 16px',
        background: 'var(--surface-2)', borderRadius: 'var(--radius-lg)',
        fontSize: 13, color: 'var(--text-muted)',
      }}>
        Nothing is deleted — items move to a local <code style={{ fontFamily: 'ui-monospace, monospace' }}>.photo_organizer_trash</code> folder you can restore.
      </div>
    </>
  );
}
