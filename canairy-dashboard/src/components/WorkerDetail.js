import { useEffect, useState } from 'react';
import Bars from './Bars';
import Gauge from './Gauge';
import SosTriangle from './SosTriangle';
import { GAS_THRESHOLDS, ZONES } from '../config';
import { clockTime, duration, initials } from '../lib';

const RANGES = [
  { label: '2 min', ms: 2 * 60 * 1000 },
  { label: '10 min', ms: 10 * 60 * 1000 },
];

function Row({ label, children }) {
  return (
    <div className="kv">
      <span className="muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}

// Seconds spent at or above a cutoff, from the reading timestamps.
function timeAbove(history, cutoff) {
  let ms = 0;
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1].gas >= cutoff) ms += Math.min(5000, history[i].t - history[i - 1].t);
  }
  return ms;
}

export default function WorkerDetail({ worker: w, view, events, alerts, now, onAcknowledge, onBack }) {
  const [range, setRange] = useState(RANGES[1]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [w.id]);

  const history = (w.history || []).filter((h) => now - h.t <= range.ms);
  const values = history.map((h) => h.gas);
  const peak = values.length ? Math.max(...values) : w.gas;
  const avg = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : w.gas;
  const total = (w.received || 0) + (w.lost || 0);
  const lossRate = total ? (w.lost || 0) / total : 0;
  const signal = w.offline ? ['None', 'grey'] : lossRate > 0.2 ? ['Weak', 'yellow'] : ['Good', 'green'];
  const mine = events.filter((e) => e.id === w.id).slice(-8).reverse();
  const open = alerts.filter((a) => a.worker.id === w.id && !a.acked && a.kind !== 'warning');
  const first = history.length ? history[0].t : now;

  return (
    <div className="column">
      <button type="button" className="back-link" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All workers
      </button>

      <section aria-label="Worker summary" className={`panel summary rank-${view.rank}`}>
        <div className="summary-who">
          <div className="avatar big">{initials(w.name)}</div>
          <div>
            <div className="row-gap">
              <h1 className="detail-name">{w.name}</h1>
              <span className={`pill ${view.status === 'OK' ? 'ok' : view.status === 'NOT OK' ? 'bad' : 'off'}`}>{view.status}</span>
            </div>
            <p className="soft">
              {view.role} · Wearable #{w.id} · {w.source === 'live' ? 'live wearable' : 'simulated'} · {view.zoneText}
              {w.firstSeen ? ` · seen since ${clockTime(w.firstSeen)}` : ''}
            </p>
          </div>
        </div>
        {open.length > 0 && (
          <button type="button" className="btn solid danger" onClick={() => open.forEach(onAcknowledge)}>
            Acknowledge alert{open.length > 1 ? 's' : ''}
          </button>
        )}
      </section>

      <div className="tiles">
        <div className="panel box">
          <div className="muted small">Gas now · MQ-2</div>
          <div className="gauge-row">
            <Gauge value={w.gas} offline={w.offline} width={210} label={`Gas gauge: ${w.offline ? 'no data' : w.gas}, ${view.levelText}`} />
            <div>
              <div className={`big-level level-${view.level}`}>{view.levelText}</div>
              <div className="muted small">
                {w.dangerSince && !w.offline
                  ? `Above ${GAS_THRESHOLDS.danger} for ${duration(now - w.dangerSince)}`
                  : w.offline
                    ? `Last reading ${w.gas}`
                    : `Warning at ${GAS_THRESHOLDS.warning}, danger at ${GAS_THRESHOLDS.danger}`}
              </div>
            </div>
          </div>
        </div>

        <div className="panel box">
          <div className="muted small">SOS button</div>
          <div className="row-gap">
            <SosTriangle active={w.sos} acknowledged={w.acknowledged} size={40} decorative />
            <div>
              <div className="tile-big">{w.sos ? (w.acknowledged ? 'Pressed, acknowledged' : 'Pressed') : 'Not pressed'}</div>
              <div className="muted small">{w.sos ? `Since ${clockTime(w.sosSince || now)}` : 'Triangle turns red and pulses if pressed'}</div>
            </div>
          </div>
        </div>

        <div className="panel box">
          <div className="muted small">Location</div>
          <div className="tile-big">{view.zone ? `Zone ${view.zone} · ${ZONES[view.zone]}` : 'Zone not set'}</div>
          <div className="mini-zones">
            {Object.keys(ZONES).map((z) => (
              <div key={z} className={`mini-zone ${z === view.zone ? 'here' : ''}`}>
                {z}
                {z === view.zone ? ' · here' : ''}
              </div>
            ))}
          </div>
          <div className="muted small">Assigned zone from src/config.js. Live position needs GPS (later).</div>
        </div>

        <div className="panel box">
          <div className="muted small">Connection</div>
          <Row label="Last seen">{duration(now - w.lastSeen)} ago</Row>
          <Row label="Signal">
            <span className={`tone-${signal[1]}`}>{signal[0]}</span>
          </Row>
          <Row label="Packets received">{(w.received || 0).toLocaleString()}</Row>
          <Row label="Packets missed">{(w.lost || 0).toLocaleString()}</Row>
        </div>
      </div>

      <div className="detail-bottom">
        <section aria-label="Gas history" className="panel box grow-2">
          <div className="box-head">
            <h2>Gas readings</h2>
            <div role="group" aria-label="Time range" className="row-gap">
              {RANGES.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  aria-pressed={r === range}
                  className={`chip ${r === range ? 'on' : ''}`}
                  onClick={() => setRange(r)}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <Bars values={values} slots={Math.max(40, Math.min(values.length, 150))} height={220} />
          <div className="axis muted small">
            <span>{clockTime(first)}</span>
            <span>Now</span>
          </div>
          <div className="row-gap small-text">
            <span>
              <span className="muted">Peak</span> {peak}
            </span>
            <span>
              <span className="muted">Average</span> {avg}
            </span>
            <span>
              <span className="muted">Time above {GAS_THRESHOLDS.warning}</span> {duration(timeAbove(history, GAS_THRESHOLDS.warning))}
            </span>
          </div>
        </section>

        <section aria-label="Recent events" className="panel box grow-1">
          <h2>Recent events</h2>
          {mine.length === 0 && <p className="muted small">Nothing yet.</p>}
          <ol className="events">
            {mine.map((e, i) => (
              <li key={`${e.at}-${i}`}>
                <span className={`event-dot ev-${e.kind}`} />
                <div>
                  <div>{e.text}</div>
                  <div className="muted small">{clockTime(e.at)}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
