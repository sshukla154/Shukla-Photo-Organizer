import { useState } from 'react';
import { startExport } from '../utils/api.js';

const CATEGORY_OPTIONS = [
  { key: 'blurry',      label: 'Blurry photos',   desc: 'Out-of-focus shots' },
  { key: 'duplicates',  label: 'Duplicate groups', desc: 'Near-identical photos' },
  { key: 'documents',   label: 'Documents',        desc: 'Scanned docs & receipts' },
  { key: 'screenshots', label: 'Screenshots',      desc: 'Screen captures' },
  { key: 'events',      label: 'Event albums',     desc: 'Time-clustered groups' },
];

export default function ExportView({ folder }) {
  const [outputPath, setOutputPath] = useState('');
  const [categories, setCategories] = useState(new Set());
  const [status, setStatus]   = useState(null);
  const [progress, setProgress] = useState({ index: 0, total: 0 });
  const [outputDir, setOutputDir] = useState('');
  const [stopFn, setStopFn]   = useState(null);

  function toggleCat(key) {
    setCategories((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function handleStart() {
    if (!outputPath.trim()) return;
    setStatus('running');
    setProgress({ index: 0, total: 0 });
    setOutputDir('');

    const abort = startExport(
      folder, outputPath.trim(), [...categories], [],
      (event) => {
        if (event.phase === 'export_start')    setProgress({ index: 0, total: event.total });
        if (event.phase === 'export_progress') setProgress({ index: event.index, total: event.total });
        if (event.phase === 'export_done')     { setStatus('done'); setOutputDir(event.output); }
        if (event.phase === 'error')           setStatus('error');
      },
    );
    setStopFn(() => abort);
  }

  const pct = progress.total > 0 ? Math.round((progress.index / progress.total) * 100) : 0;

  return (
    <div className="export-wrap">
      <h2>Export Gallery</h2>
      <p className="muted" style={{ fontSize: 13, marginBottom: 28 }}>
        Generate a self-contained HTML gallery you can browse offline — no server needed.
      </p>

      <div className="export-form">
        <label className="export-label">Output folder</label>
        <input
          type="text"
          value={outputPath}
          onChange={(e) => setOutputPath(e.target.value)}
          placeholder="e.g. C:\Users\you\Desktop\MyGallery"
          disabled={status === 'running'}
        />
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6 }}>
          A new folder will be created at this path with <code style={{ fontFamily: 'ui-monospace,monospace' }}>index.html</code>, thumbnails, and full-res images.
        </p>
      </div>

      <div className="export-form" style={{ marginTop: 22 }}>
        <label className="export-label">
          Include categories
          <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
            (leave empty to export all photos)
          </span>
        </label>
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 4 }}>
          {CATEGORY_OPTIONS.map(({ key, label, desc }, i) => (
            <label
              key={key}
              className="export-checkbox-row"
              style={{ borderBottom: i < CATEGORY_OPTIONS.length - 1 ? '1px solid var(--border)' : 'none' }}
            >
              <input
                type="checkbox"
                checked={categories.has(key)}
                onChange={() => toggleCat(key)}
                disabled={status === 'running'}
              />
              <div>
                <div style={{ fontWeight: 500 }}>{label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
        {status !== 'running' ? (
          <button
            className="primary"
            onClick={handleStart}
            disabled={!outputPath.trim()}
          >
            Export gallery →
          </button>
        ) : (
          <button onClick={() => { stopFn?.(); setStatus(null); }}>Cancel</button>
        )}
      </div>

      {status === 'running' && (
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span className="muted">Exporting photos…</span>
            <span style={{ fontWeight: 500 }}>{pct}%</span>
          </div>
          <div className="progress-bar" style={{ margin: 0 }}>
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {progress.index} / {progress.total} photos
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="export-success" style={{ marginTop: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>✓ Gallery exported</div>
          <code style={{ display: 'block', fontFamily: 'ui-monospace,monospace', fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>
            {outputDir}
          </code>
          Open <strong>index.html</strong> in that folder to browse your gallery offline.
        </div>
      )}

      {status === 'error' && (
        <div className="export-error" style={{ marginTop: 20 }}>
          Export failed. Check the output path and try again.
        </div>
      )}
    </div>
  );
}
