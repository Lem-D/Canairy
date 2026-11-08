import { SITE } from '../config';
import { clockTime } from '../lib';

export function Logo() {
  return <img className="logo" src={`${process.env.PUBLIC_URL}/logo.svg`} alt="Canairy" />;
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
