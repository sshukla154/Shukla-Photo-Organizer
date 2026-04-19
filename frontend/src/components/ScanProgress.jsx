import { useEffect, useRef, useState } from 'react';

const PHASE_LABELS = {
  init: 'Starting…',
  discovered: 'Discovered photos',
  analyzed: 'Analyzing',
  grouping: 'Grouping',
  grouped: 'Grouped',
  done: 'Complete',
};

function useElapsedTimer(running) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    startRef.current = Date.now() - elapsed * 1000;

    function tick() {
      setElapsed((Date.now() - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  return elapsed;
}

function formatTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export default function ScanProgress({ folder, onDone, onCancel }) {
  const [status, setStatus] = useState('Starting…');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [phase, setPhase] = useState('init');
  const [recent, setRecent] = useState([]);
  const [finalElapsed, setFinalElapsed] = useState(null);
  const abortRef = useRef(null);

  const isDone = phase === 'done';
  const timerRunning = phase !== 'init' && !isDone && finalElapsed === null;
  const elapsed = useElapsedTimer(timerRunning);
  const displayTime = finalElapsed ?? elapsed;

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
        setFinalElapsed((Date.now() - (window.__scanStart || Date.now())) / 1000);
      }
    }

    window.__scanStart = Date.now();
    run();
    return () => controller.abort();
  }, [folder, onDone]);

  const pct = progress.total ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div className="scan-wrap">
      <div className="scan-header">
        <h1>{isDone ? '✓ Scan complete' : 'Scanning…'}</h1>
        <div className="scan-folder">{folder}</div>
      </div>

      {/* Timer */}
      <div className="scan-timer" style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '10px 0',
        fontSize: 13,
        color: isDone ? 'var(--green-text)' : 'var(--text-muted)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ fontSize: 15 }}>{isDone ? '✓' : '⏱'}</span>
        {isDone
          ? `Completed in ${formatTime(displayTime)}`
          : `Elapsed: ${formatTime(displayTime)}`}
        {!isDone && progress.total > 0 && elapsed > 5 && (() => {
          const rate = progress.current / elapsed; // photos/sec
          const remaining = rate > 0 ? (progress.total - progress.current) / rate : null;
          return remaining !== null
            ? <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                · ~{formatTime(remaining)} remaining
              </span>
            : null;
        })()}
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
        {!isDone && <button onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
