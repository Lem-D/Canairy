import Gauge from './Gauge';
import SosTriangle from './SosTriangle';
import { GAS_THRESHOLDS } from '../config';
import { duration, initials } from '../lib';

export default function WorkerCard({ worker: w, view, now, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(w.id)}
      aria-label={`Open details for ${w.name}`}
      className={`card worker-card rank-${view.rank} ${w.sos ? 'is-sos' : ''}`}
    >
      <div className="card-top">
        <div className="avatar">{initials(w.name)}</div>
        <div className="grow">
          <div className="card-name">
            {w.name}
            {w.source === 'live' && <span className="tag">LIVE</span>}
          </div>
          <div className="muted small">
            {view.role} · #{w.id}
          </div>
        </div>
        <SosTriangle active={w.sos} acknowledged={w.acknowledged} />
      </div>

      <div className="row-gap">
        <span className={`pill ${view.status === 'OK' ? 'ok' : view.status === 'NOT OK' ? 'bad' : 'off'}`}>{view.status}</span>
        <span className={`small reason level-${view.rank === 4 ? 'none' : view.rank === 0 ? 'sos' : view.level}`}>{view.reason}</span>
      </div>

      <div className="card-gauge">
        <Gauge value={w.gas} offline={w.offline} label={`Gas gauge: ${w.offline ? 'no data' : w.gas}, ${view.levelText}`} />
        <div className="col">
          <span className="muted small">Gas (ppm) · MQ-2</span>
          <span className={`level-text level-${view.level}`}>{view.levelText}</span>
          <span className="muted small">
            Warn {GAS_THRESHOLDS.warning} · Danger {GAS_THRESHOLDS.danger}
          </span>
        </div>
      </div>

      <div className="card-foot">
        <span>{view.zoneText}</span>
        <span>{w.offline ? `Last seen ${duration(now - w.lastSeen)} ago` : `Updated ${now - w.lastSeen < 1500 ? "now" : `${duration(now - w.lastSeen)} ago`}`}</span>
      </div>
    </button>
  );
}
