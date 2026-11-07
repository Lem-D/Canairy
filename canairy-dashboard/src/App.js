import './App.css';
import { useWorkers } from './hooks/useWorkers';

// Why a worker is Not OK, in words.
const REASON_TEXT = { sos: 'SOS', gas: 'high gas', offline: 'no signal' };

function secondsAgo(time) {
  return Math.max(0, Math.round((Date.now() - time) / 1000));
}

function WorkerCard({ worker: w, onAcknowledge }) {
  return (
    <div className={`card ${w.ok ? 'ok' : 'not-ok'}`}>
      <h2>{w.name}</h2>
      <p className="status">{w.ok ? 'OK' : `NOT OK: ${w.reasons.map((r) => REASON_TEXT[r]).join(', ')}`}</p>
      <p>Gas: {w.gas} ({w.level})</p>
      <p>SOS: {w.sos ? (w.acknowledged ? 'yes (acknowledged)' : 'YES') : 'no'}</p>
      <p className="small">
        #{w.id} · {w.source === 'live' ? 'wearable' : 'simulated'} · seen {secondsAgo(w.lastSeen)}s ago
      </p>
      {w.sos && !w.acknowledged && (
        <button type="button" onClick={() => onAcknowledge(w.id)}>
          Acknowledge SOS
        </button>
      )}
    </div>
  );
}

export default function App() {
  const { workers, connected, acknowledge } = useWorkers();
  // Not OK workers first.
  const sorted = [...workers].sort((a, b) => a.ok - b.ok || a.id - b.id);

  return (
    <div className="app">
      <h1>Canairy</h1>
      <p className="small">{connected ? 'Connected to bridge' : 'Not connected. Start the bridge: python bridge.py'}</p>
      <div className="cards">
        {sorted.map((w) => (
          <WorkerCard key={w.id} worker={w} onAcknowledge={acknowledge} />
        ))}
      </div>
    </div>
  );
}
