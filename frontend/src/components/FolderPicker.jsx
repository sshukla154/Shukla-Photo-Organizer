import { useState } from 'react';

const FORMATS = ['JPG', 'PNG', 'WebP', 'HEIC', 'BMP', 'TIFF'];

export default function FolderPicker({ onStart }) {
  const [path, setBrowsedPath] = useState('');
  const [browsing, setBrowsing] = useState(false);

  async function browse() {
    setBrowsing(true);
    try {
      const res = await fetch('/api/browse');
      const { path: picked } = await res.json();
      if (picked) setBrowsedPath(picked);
    } catch {
      // backend unavailable — user can still type manually
    } finally {
      setBrowsing(false);
    }
  }

  function submit() {
    if (path.trim()) onStart(path.trim());
  }

  return (
    <div className="hero">
      <div className="hero-icon">🗂️</div>
      <h1>Shukla Photo Organizer</h1>
      <p className="hero-subtitle">
        Find blurry shots, duplicates, and clutter — all locally, nothing leaves your machine.
      </p>

      <div className="folder-card">
        <label>Select your photos folder</label>

        <button
          className="browse-btn"
          onClick={browse}
          disabled={browsing}
          style={{
            width: '100%', padding: '14px 20px',
            marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 14, fontWeight: 500,
            background: 'var(--accent-light)',
            color: 'var(--accent)',
            border: '1.5px dashed var(--accent)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'none',
            transition: 'background 150ms, border-color 150ms',
            cursor: browsing ? 'wait' : 'pointer',
          }}
        >
          <span style={{ fontSize: 20 }}>📁</span>
          {browsing ? 'Opening…' : 'Browse for folder'}
        </button>

        {path && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', padding: '10px 14px',
            marginBottom: 14,
          }}>
            <span style={{ fontSize: 16 }}>📂</span>
            <span style={{
              fontSize: 13, fontWeight: 500, flex: 1,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }} title={path}>{path}</span>
            <button
              style={{ padding: '3px 8px', fontSize: 12, boxShadow: 'none' }}
              onClick={() => setBrowsedPath('')}
            >✕</button>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>or paste path manually</span>
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <div className="folder-input-row">
          <input
            type="text"
            placeholder="C:\Users\you\Pictures\Vacation 2025"
            value={path}
            onChange={(e) => setBrowsedPath(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          <button className="primary" disabled={!path.trim()} onClick={submit}>
            Scan →
          </button>
        </div>

        <div className="format-chips" style={{ marginTop: 14 }}>
          {FORMATS.map((f) => (
            <span key={f} className="format-chip">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
