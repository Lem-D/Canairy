import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import AlertBanner from './components/AlertBanner';
import Header from './components/Header';
import WorkerCard from './components/WorkerCard';
import WorkerDetail from './components/WorkerDetail';
import Worksite from './components/Worksite';
import { GAS_THRESHOLDS } from './config';
import { useEventLog } from './hooks/useEventLog';
import { useWorkers } from './hooks/useWorkers';
import { duration, workerView } from './lib';

// One alert per problem per worker, most urgent first.
// SOS acknowledgements go to the bridge, so every open dashboard sees them.
// Gas and no-signal acknowledgements only live in this browser, and reset once
// the problem clears.
function buildAlerts(items, localAcks, now) {
  const alerts = [];
  for (const { worker: w, view } of items) {
    const where = view.zoneText;
    const add = (kind, title, detail, acked) => alerts.push({ key: `${w.id}:${kind}`, kind, worker: w, view, title, detail, acked });
    if (w.sos) add('sos', `SOS · ${w.name}`, `${where} · pressed ${duration(now - (w.sosSince || now))} ago`, w.acknowledged);
    if (w.offline) {
      add('offline', `No signal · ${w.name}`, `${where} · last packet ${duration(now - w.lastSeen)} ago`, localAcks.has(`${w.id}:offline`));
    } else if (w.level === 'danger') {
      add('gas', `Dangerous gas · ${w.name} (${w.gas})`, `${where} · above the ${GAS_THRESHOLDS.danger} line for ${duration(now - (w.dangerSince || now))}`, localAcks.has(`${w.id}:gas`));
    } else if (w.level === 'warning') {
      add('warning', `Gas rising · ${w.name} (${w.gas})`, `${where} · above the ${GAS_THRESHOLDS.warning} line`, localAcks.has(`${w.id}:warning`));
    }
  }
  const rank = { sos: 0, gas: 1, offline: 2, warning: 3 };
  return alerts.sort((a, b) => a.acked - b.acked || rank[a.kind] - rank[b.kind]);
}

// The worker page is at #worker/<id>, so the browser Back button works.
function idFromHash() {
  const m = window.location.hash.match(/^#worker\/(\d+)$/);
  return m ? Number(m[1]) : null;
}

const FILTERS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'notok', label: 'Not OK', test: (i) => i.view.status === 'NOT OK' },
  { key: 'offline', label: 'No signal', test: (i) => i.view.status === 'NO SIGNAL' },
];

function EmptyState({ connected }) {
  return (
    <div className="panel empty">
      {connected ? (
        <p>Bridge connected. Waiting for the first reading…</p>
      ) : (
        <>
          <p className="strong">The bridge isn't running.</p>
          <p>
            In a terminal, go to the <code>bridge</code> folder, turn on the virtual environment and run <code>python bridge.py</code>. This page
            connects by itself once it's up.
          </p>
        </>
      )}
    </div>
  );
}

export default function App() {
  const { workers, connected, serial, siteHistory, acknowledge, now } = useWorkers();
  const events = useEventLog(workers);
  const [selectedId, setSelectedId] = useState(idFromHash);
  const [filter, setFilter] = useState('all');
  const [localAcks, setLocalAcks] = useState(() => new Set());

  useEffect(() => {
    const onHash = () => setSelectedId(idFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const open = useCallback((id) => {
    window.location.hash = `worker/${id}`;
  }, []);
  const back = useCallback(() => {
    window.location.hash = '';
  }, []);

  const items = useMemo(
    () => workers.map((w) => ({ worker: w, view: workerView(w, now) })).sort((a, b) => a.view.rank - b.view.rank || a.worker.id - b.worker.id),
    [workers, now],
  );

  // Forget local acknowledgements once that problem has cleared.
  useEffect(() => {
    setLocalAcks((acks) => {
      const still = [...acks].filter((key) => {
        const [id, kind] = key.split(':');
        const w = workers.find((x) => String(x.id) === id);
        if (!w) return false;
        if (kind === 'offline') return w.offline;
        if (kind === 'gas') return w.level === 'danger';
        return w.level === 'warning';
      });
      return still.length === acks.size ? acks : new Set(still);
    });
  }, [workers]);

  const alerts = useMemo(() => buildAlerts(items, localAcks, now), [items, localAcks, now]);
  const banner = alerts.find((a) => !a.acked && a.kind !== 'warning');

  const onAcknowledge = useCallback(
    (alert) => {
      if (alert.kind === 'sos') acknowledge(alert.worker.id);
      else setLocalAcks((acks) => new Set(acks).add(alert.key));
    },
    [acknowledge],
  );

  const selected = items.find((i) => i.worker.id === selectedId);
  const shown = items.filter(FILTERS.find((f) => f.key === filter).test);

  return (
    <div className="app">
      <div className="page">
        <Header connected={connected} serial={serial} simCount={workers.filter((w) => w.source === 'sim').length} now={now} onHome={back} />
        <AlertBanner alert={banner} now={now} onView={open} onAcknowledge={onAcknowledge} />

        {selected ? (
          <WorkerDetail
            worker={selected.worker}
            view={selected.view}
            events={events}
            alerts={alerts}
            now={now}
            onAcknowledge={onAcknowledge}
            onBack={back}
          />
        ) : (
          <div className="split">
            <section aria-label="Workers" className="column">
              <div className="box-head wrap">
                <h2 className="section-title">Crew on site</h2>
                <div role="group" aria-label="Filter workers" className="row-gap">
                  {FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      aria-pressed={filter === f.key}
                      className={`chip ${filter === f.key ? 'on' : ''}`}
                      onClick={() => setFilter(f.key)}
                    >
                      {f.label} {items.filter(f.test).length}
                    </button>
                  ))}
                </div>
              </div>
              <div className="cards">
                {items.length === 0 && <EmptyState connected={connected} />}
                {items.length > 0 && shown.length === 0 && <div className="panel empty">Nobody in this list right now.</div>}
                {shown.map(({ worker, view }) => (
                  <WorkerCard key={worker.id} worker={worker} view={view} now={now} onOpen={open} />
                ))}
              </div>
            </section>
            <Worksite items={items} alerts={alerts} events={events} siteHistory={siteHistory} serial={serial} now={now} onAcknowledge={onAcknowledge} onOpen={open} />
          </div>
        )}
      </div>
    </div>
  );
}
