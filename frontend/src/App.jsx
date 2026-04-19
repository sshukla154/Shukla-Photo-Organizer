import { useState } from 'react';
import FolderPicker from './components/FolderPicker.jsx';
import ScanProgress from './components/ScanProgress.jsx';
import ResultsView from './components/ResultsView.jsx';
import EventsView from './components/EventsView.jsx';
import TrashView from './components/TrashView.jsx';
import ExportView from './components/ExportView.jsx';

const TABS = [
  { key: 'results', label: 'Results' },
  { key: 'events', label: 'Events' },
  { key: 'trash', label: 'Trash' },
  { key: 'export', label: 'Export' },
];

export default function App() {
  const [view, setView] = useState('picker'); // 'picker' | 'scanning' | 'results' | 'events' | 'trash' | 'export'
  const [folder, setFolder] = useState('');
  const [tab, setTab] = useState('results');

  const isMain = view !== 'picker' && view !== 'scanning';

  return (
    <div className="app">
      {view === 'picker' && (
        <FolderPicker
          onStart={(path) => {
            setFolder(path);
            setView('scanning');
          }}
        />
      )}
      {view === 'scanning' && (
        <ScanProgress
          folder={folder}
          onDone={() => { setTab('results'); setView('main'); }}
          onCancel={() => setView('picker')}
        />
      )}
      {isMain && (
        <>
          <div className="top-bar">
            <div className="folder-label">
              <span className="muted" style={{ fontSize: 12 }}>Folder</span>
              <span className="folder-path">{folder}</span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setView('picker')}>Change folder</button>
              <button onClick={() => setView('scanning')}>Rescan</button>
            </div>
          </div>
          <div className="tab-row">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                className={`tab-btn ${tab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === 'results' && (
            <ResultsView folder={folder} />
          )}
          {tab === 'events' && (
            <EventsView folder={folder} />
          )}
          {tab === 'trash' && (
            <TrashView folder={folder} />
          )}
          {tab === 'export' && (
            <ExportView folder={folder} />
          )}
        </>
      )}
    </div>
  );
}
