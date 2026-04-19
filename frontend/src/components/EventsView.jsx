import { useEffect, useState } from 'react';
import { getEvents, trashPhotos, formatBytes, formatDate } from '../utils/api.js';
import PhotoModal from './PhotoModal.jsx';

function ThumbStrip({ ids, max = 6 }) {
  const shown = ids.slice(0, max);
  const extra = ids.length - max;
  return (
    <div className="thumb-grid" style={{ cursor: 'default' }}>
      {shown.map((id) => (
        <img key={id} className="thumb" src={`/api/thumbnail?photo_id=${id}`} alt="" loading="lazy" />
      ))}
      {extra > 0 && <div className="thumb-more">+{extra}</div>}
    </div>
  );
}

export default function EventsView({ folder }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]   = useState(null);

  async function load() {
    setLoading(true);
    try { setData(await getEvents(folder)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [folder]);

  async function handleModalConfirm({ trash }) {
    if (!trash.length) return;
    if (!confirm(`Move ${trash.length} photos to trash?`)) return;
    await trashPhotos(trash);
    setModal(null);
    await load();
  }

  if (loading) return <p className="muted" style={{ paddingTop: 20 }}>Loading events…</p>;

  if (!data?.events?.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📅</div>
        <h3>No events found</h3>
        <p>Events are detected automatically when photos are separated by more than 4 hours. Rescan your folder to generate them.</p>
      </div>
    );
  }

  return (
    <>
      <p className="muted" style={{ marginBottom: 18, fontSize: 13 }}>
        {data.events.length} event{data.events.length !== 1 ? 's' : ''} detected from your photos
      </p>

      {data.events.map((ev, i) => {
        const start = formatDate(ev.start_time);
        const end   = formatDate(ev.end_time);
        const dateLabel = start && end && start !== end ? `${start} – ${end}` : start || `Event ${i + 1}`;
        const totalBytes = ev.photo_ids.reduce((s, id) => s + (data.all_photos[id]?.size_bytes || 0), 0);

        return (
          <div key={ev.album_id} className="group-card">
            <div className="group-header">
              <div className="group-header-left">
                <span className="badge green">Event</span>
                <p className="group-title">{dateLabel}</p>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                {ev.photo_ids.length} photos · {formatBytes(totalBytes)}
              </span>
            </div>
            <ThumbStrip ids={ev.photo_ids} />
            <div className="actions">
              <button
                className="primary"
                onClick={() => setModal(ev)}
              >
                Review photos
              </button>
            </div>
          </div>
        );
      })}

      {modal && (
        <PhotoModal
          photos={modal.photo_ids}
          allPhotos={data.all_photos}
          bestId={null}
          title={`Event · ${modal.photo_ids.length} photos`}
          onClose={() => setModal(null)}
          onConfirm={handleModalConfirm}
        />
      )}
    </>
  );
}
