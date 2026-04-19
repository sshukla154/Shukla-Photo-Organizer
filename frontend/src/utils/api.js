export async function getGroups(folder) {
  const r = await fetch(`/api/groups?folder_path=${encodeURIComponent(folder)}`);
  return r.json();
}

export async function getEvents(folder) {
  const r = await fetch(`/api/events?folder_path=${encodeURIComponent(folder)}`);
  return r.json();
}

export async function getTrash(folder) {
  const r = await fetch(`/api/trash?folder_path=${encodeURIComponent(folder)}`);
  return r.json();
}

export async function trashPhotos(ids) {
  const r = await fetch('/api/trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_ids: ids }),
  });
  return r.json();
}

export async function restorePhotos(ids) {
  const r = await fetch('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ photo_ids: ids }),
  });
  return r.json();
}

/** Stream export progress via SSE. onEvent(parsed) called per event. Returns abort fn. */
export function startExport(folderPath, outputPath, categories, eventIds, onEvent) {
  const ctrl = new AbortController();
  fetch('/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      folder_path: folderPath,
      output_path: outputPath,
      categories,
      event_ids: eventIds,
    }),
    signal: ctrl.signal,
  }).then(async (res) => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try { onEvent(JSON.parse(line.slice(6))); } catch {}
        }
      }
    }
  }).catch(() => {});
  return () => ctrl.abort();
}

export function formatBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

export function formatDate(ts) {
  if (!ts) return null;
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
