import { useEffect, useRef, useState } from 'react';

const PHASE_LABELS = {
  init: 'Starting…',
  discovered: 'Discovered photos',
  analyzed: 'Analyzing',
  grouping: 'Grouping',
  grouped: 'Grouped',
  done: 'Complete',
};

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
          setStatus(`Error: ${await res.text()}`);
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
          buffer = parts.pop();
          for (const part of parts) {
            const line = part.replace(/^data:\s*/, '').trim();
            if (!line) continue;
            try { handleEvent(JSON.parse(line)); } catch {}
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
        setStatus(`Found ${evt.total.toLocaleString()} photos`);
      } else if (evt.phase === 'analyzed') {
        setProgress({ current: evt.index, total: evt.total });
        setStatus(`Analyzing ${evt.filename}`);
        setRecent((r) => {
          const flags = [];
          if (evt.flags.blurry) flags.push('blurry');
          if (evt.flags.document) flags.push('document');
          if (evt.flags.screenshot) flags.push('screenshot');
          return [{ name: evt.filename, flags }, ...r].slice(0, 6);
        });
      } else if (evt.phase === 'grouping') {
        setStatus(`Grouping ${evt.step}…`);
      } else if (evt.phase === 'grouped') {
        const note = evt.note ? ` (${evt.note})` : '';
        setStatus(`Found ${evt.count} ${evt.step} group${evt.count !== 1 ? 's' : ''}${note}`);
      } else if (evt.phase === 'done') {
        setStatus('Analysis complete');
      }
    }

    run();
    return () => controller.abort();
  }, [folder, onDone]);

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;
  const isDone = phase === 'done';

  return (
    <div className="scan-wrap">
      <div className="scan-header">
        <h1>{isDone ? '✓ Scan complete' : 'Scanning…'}</h1>
        <div className="scan-folder">{folder}</div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: isDone ? '100%' : `${pct}%` }} />
      </div>
      <div className="scan-meta">
        <span className="scan-status">{status}</span>
        {progress.total > 0 && (
          <span className="scan-count">{progress.current.toLocaleString()} / {progress.total.toLocaleString()}</span>
        )}
      </div>

      <div className="scan-log" style={{ marginTop: 20 }}>
        <p className="scan-log-title">Recent files</p>
        {recent.length === 0 && (
          <div className="scan-log-line">Waiting for first result…</div>
        )}
        {recent.map((item, i) => (
          <div key={i} className={`scan-log-line ${item.flags?.length ? 'flagged' : ''}`}>
            {item.flags?.length ? `⚑ ` : '  '}{item.name}
            {item.flags?.length > 0 && (
              <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>
                — {item.flags.join(', ')}
              </span>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
