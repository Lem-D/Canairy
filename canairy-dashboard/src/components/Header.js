import { SITE } from '../config';
import { clockTime } from '../lib';

export function Logo() {
  return (
    <div className="logo">
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#1a0f05" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 7h.01" />
        <path d="M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20" />
        <path d="m20 7 2 .5-2 .5" />
        <path d="M10 18v3" />
        <path d="M14 17.75V21" />
      </svg>
    </div>
  );
}

function receiver(serial) {
  if (!serial || serial.state === 'disabled') return { text: 'Simulation only', dot: 'grey' };
  if (serial.state === 'connected') return { text: 'Receiver connected', dot: 'green' };
  return { text: 'Looking for receiver…', dot: 'yellow' };
}

export default function Header({ connected, serial, simCount, now, onHome }) {
  const r = receiver(serial);
  return (
    <header className="panel header">
      <button type="button" className="brand" onClick={onHome} aria-label="Canairy overview">
        <Logo />
        <div>
          <div className="brand-name">Canairy</div>
          <p className="muted small">
            {SITE.name} · {SITE.shift}
          </p>
        </div>
      </button>
      <div className="header-status" aria-live="polite">
        <span className="with-dot">
          <span className={`dot ${connected ? 'green' : 'red'}`} />
          {connected ? 'Bridge connected' : 'Bridge not connected'}
        </span>
        {connected && (
          <span className="with-dot">
            <span className={`dot ${r.dot}`} />
            {r.text}
          </span>
        )}
        {simCount > 0 && <span>{simCount} simulated</span>}
        <span className="tabular">{clockTime(now)}</span>
      </div>
    </header>
  );
}
