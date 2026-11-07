import { clockTime, duration } from '../lib';

// How many of each worker's latest events to show on the main page.
const PER_WORKER = 3;

// A short log summary for every worker, so the main page shows what happened
// without opening each worker. Workers are listed most urgent first, same as
// the cards. The full list is still on each worker's page.
export default function WorkerLogs({ items, events, now, onOpen }) {
  const byWorker = new Map();
  for (const e of events) {
    if (!byWorker.has(e.id)) byWorker.set(e.id, []);
    byWorker.get(e.id).push(e);
  }

  const rows = items.filter((i) => byWorker.has(i.worker.id));

  return (
    <section aria-label="Worker logs" className="panel box">
      <div className="box-head">
        <h3>Logs</h3>
        <span className="muted small">Latest {PER_WORKER} per worker · since this page opened</span>
      </div>
      {rows.length === 0 && <p className="muted small">Nothing yet.</p>}
      <div className="log-list">
        {rows.map(({ worker: w }) => {
          const list = byWorker.get(w.id);
          const latest = list.slice(-PER_WORKER).reverse();
          return (
            <div key={w.id} className="log-worker">
              <div className="log-head">
                <button type="button" className="log-name" onClick={() => onOpen(w.id)} aria-label={`Open details for ${w.name}`}>
                  {w.name}
                </button>
                <span className="muted small nowrap">
                  {list.length} event{list.length === 1 ? '' : 's'} · last {duration(now - list[list.length - 1].at)} ago
                </span>
              </div>
              <ol className="events compact">
                {latest.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <span className={`event-dot ev-${e.kind}`} />
                    <span className="grow">{e.text}</span>
                    <span className="muted small nowrap tabular">{clockTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}
      </div>
    </section>
  );
}
