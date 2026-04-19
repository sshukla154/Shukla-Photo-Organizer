import { useEffect, useRef, useState } from 'react';

export default function ScanProgress({ folder, onDone, onCancel }) {
  const [status, setStatus] = useState('Starting…');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [phase, setPhase] = useState('init');
  const [recent, setRecent] = useState([]);
  const abortRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    async function run() {
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder_path: folder, include_faces: true }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text();
          setStatus(`Error: ${text}`);
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const parts = buffer.split('\n\n');
          buffer = parts.pop();  // keep incomplete tail

          for (const part of parts) {
            const line = part.replace(/^data:\s*/, '').trim();
            if (!line) continue;
            try {
              const evt = JSON.parse(line);
              handleEvent(evt);
            } catch (e) {
              console.warn('Bad event:', line);
            }
          }
        }
        onDone();
      } catch (e) {
        if (e.name !== 'AbortError') setStatus(`Error: ${e.message}`);
      }
    }

    function handleEvent(evt) {
      setPhase(evt.phase);
      if (evt.phase === 'discovered') {
        setProgress({ current: 0, total: evt.total });
        setStatus(`Found ${evt.total} photos`);
      } else if (evt.phase === 'analyzed') {
        setProgress({ current: evt.index, total: evt.total });
        setStatus(`Analyzing ${evt.filename}`);
        setRecent((r) => {
          const flags = [];
          if (evt.flags.blurry) flags.push('blurry');
          if (evt.flags.document) flags.push('document');
          if (evt.flags.screenshot) flags.push('screenshot');
          const label = flags.length ? `${evt.filename} — ${flags.join(', ')}` : evt.filename;
          return [label, ...r].slice(0, 8);
        });
      } else if (evt.phase === 'grouping') {
        setStatus(`Grouping ${evt.step}…`);
      } else if (evt.phase === 'grouped') {
        setStatus(`Found ${evt.count} ${evt.step} groups`);
      } else if (evt.phase === 'done') {
        setStatus('Done');
      }
    }

    run();
    return () => controller.abort();
  }, [folder, onDone]);

  const pct = progress.total ? (progress.current / progress.total) * 100 : 0;

  return (
    <div style={{ paddingTop: 40 }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 4 }}>Scanning</h1>
      <p className="muted" style={{ marginTop: 0, marginBottom: 20 }}>{folder}</p>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <span className="status-line">{status}</span>
        <span className="muted" style={{ fontSize: 13 }}>
          {progress.current} / {progress.total || '?'}
        </span>
      </div>

      <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '12px 16px' }}>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>Recent</p>
        {recent.length === 0 && <p className="muted" style={{ margin: 0, fontSize: 13 }}>Waiting for first result…</p>}
        {recent.map((line, i) => (
          <div key={i} className="status-line" style={{ padding: '2px 0' }}>{line}</div>
        ))}
      </div>

      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
