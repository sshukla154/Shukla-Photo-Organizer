import { useState } from 'react';

export default function FolderPicker({ onStart }) {
  const [path, setPath] = useState('');

  return (
    <div className="hero">
      <h1>Organize your photos</h1>
      <p>All processing happens on your machine. Nothing leaves your computer.</p>
      <div className="folder-row">
        <input
          type="text"
          placeholder="/Users/you/Pictures/Party-Nov-2025"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && path.trim() && onStart(path.trim())}
        />
        <button
          className="primary"
          disabled={!path.trim()}
          onClick={() => onStart(path.trim())}
        >
          Scan
        </button>
      </div>
      <p style={{ marginTop: 24, fontSize: 12 }} className="muted">
        Paste the full folder path. Works with JPG, PNG, WebP, HEIC, BMP, TIFF.
      </p>
    </div>
  );
}
