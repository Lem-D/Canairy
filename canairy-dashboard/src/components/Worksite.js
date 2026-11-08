import Bars from './Bars';
import WorkerLogs from './WorkerLogs';
import { SITE, ZONES } from '../config';
import { duration, initials } from '../lib';

function Stat({ label, value, tone }) {
  return (
    <div className="panel stat">
      <div className="muted small">{label}</div>
      <div className={`stat-value ${value ? tone : ''}`}>{value}</div>
    </div>
  );
}

const RING = { 0: 'red', 1: 'red', 2: 'grey', 3: 'yellow', 4: 'green' };

export default function Worksite({ items, alerts, events, siteHistory, serial, now, onAcknowledge, onOpen }) {
  const notOk = items.filter((i) => i.view.status === 'NOT OK').length;
  const offline = items.filter((i) => i.view.status === 'NO SIGNAL').length;
  const zoneNames = [...Object.keys(ZONES), null];
  const lastPacket = items.length ? Math.max(...items.map((i) => i.worker.lastSeen)) : null;

  return (
    <aside aria-label="Worksite" className="column">
      <h2 className="section-title">Worksite</h2>

      <div className="stats">
        <Stat label="On shift" value={items.length} />
        <Stat label="OK" value={items.length - notOk - offline} tone="green" />
        <Stat label="Not OK" value={notOk} tone="red" />
        <Stat label="No signal" value={offline} tone="grey" />
      </div>

      <section id="alerts" className="panel box">
        <div className="box-head">
          <h3>Active alerts</h3>
          <span className="muted small">Most urgent first</span>
        </div>
        {alerts.length === 0 && (
          <div className="all-clear">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--green)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
            No active alerts. Everyone is OK.
          </div>
        )}
        {alerts.map((a) => (
          <div key={a.key} className={`alert-row ${a.kind} ${a.acked ? 'acked' : ''}`}>
            <button type="button" className="alert-text" onClick={() => onOpen(a.worker.id)}>
              <div className="alert-title">{a.title}</div>
              <div className="small soft">{a.detail}</div>
            </button>
            {a.acked ? (
              <span className="muted small nowrap">{a.kind === 'warning' ? 'Watching' : 'Acknowledged'}</span>
            ) : (
              <button type="button" className="btn small-btn outline" onClick={() => onAcknowledge(a)}>
                {a.kind === 'warning' ? 'Watch' : 'Acknowledge'}
              </button>
            )}
          </div>
        ))}
      </section>

      <WorkerLogs items={items} events={events} now={now} onOpen={onOpen} />

      <section className="panel box">
        <div className="box-head">
          <h3>Site map</h3>
          <span className="muted small">By assigned zone (set in src/config.js) · GPS later</span>
        </div>
        <div className="zones">
          {zoneNames.map((z) => {
            const people = items.filter((i) => i.view.zone === z);
            if (z === null && people.length === 0) return null;
            const bad = people.some((i) => i.view.rank <= 1);
            const off = people.some((i) => i.view.rank === 2);
            return (
              <div key={z ?? 'none'} className={`zone ${bad ? 'bad' : off ? 'off' : ''}`}>
                <div>
                  <div className="zone-name">{z ? `Zone ${z}` : 'Zone not set'}</div>
                  <div className="muted small">{z ? ZONES[z] : 'Add them to WORKER_INFO'}</div>
                </div>
                <div className="zone-people">
                  {people.map((i) => (
                    <button
                      type="button"
                      key={i.worker.id}
                      title={i.worker.name}
                      aria-label={`Open details for ${i.worker.name}`}
                      className={`mini-avatar ring-${RING[i.view.rank]}`}
                      onClick={() => onOpen(i.worker.id)}
                    >
                      {initials(i.worker.name)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel box">
        <div className="box-head">
          <h3>Site gas trend</h3>
          <span className="muted small">Highest reading on site, last minute</span>
        </div>
        <Bars values={siteHistory} slots={60} height={110} />
      </section>

      <section className="panel box two-col small-text">
        <div className="col">
          <h3>Emergency info</h3>
          <div>
            <span className="muted">Muster point:</span> {SITE.musterPoint}
          </div>
          <div>
            <span className="muted">Safety lead:</span> {SITE.safetyLead}
          </div>
        </div>
        <div className="col">
          <h3>Receiver</h3>
          <div>
            <span className="muted">Link:</span>{' '}
            {serial?.state === 'connected' ? `USB serial · ${serial.path || 'connected'}` : serial?.state === 'searching' ? 'Looking for the Arduino' : 'Off (simulation only)'}
          </div>
          <div>
            <span className="muted">Last packet:</span> {lastPacket ? `${duration(now - lastPacket)} ago` : 'none yet'}
          </div>
        </div>
      </section>
    </aside>
  );
}
