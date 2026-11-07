// Watches the workers and writes down what changed, for "Recent events" on
// the worker page. Only covers what this browser has seen since it opened.

import { useEffect, useRef, useState } from 'react';

const MAX_EVENTS = 300;

export function useEventLog(workers) {
  const [events, setEvents] = useState([]);
  const prevRef = useRef({});

  useEffect(() => {
    const prev = prevRef.current;
    const found = [];
    const at = Date.now();
    const add = (id, text, kind) => found.push({ id, at, text, kind });

    for (const w of workers) {
      const p = prev[w.id];
      if (!p) {
        add(w.id, 'Wearable connected', 'safe');
        if (w.sos) add(w.id, 'SOS active', 'danger');
        continue;
      }
      if (w.sos && !p.sos) add(w.id, 'SOS button pressed', 'danger');
      if (!w.sos && p.sos) add(w.id, 'SOS cleared', 'safe');
      if (w.sos && w.acknowledged && !p.acknowledged) add(w.id, 'SOS acknowledged by supervisor', 'brand');
      if (w.level !== p.level) add(w.id, `Gas ${p.level} → ${w.level} (${w.gas})`, w.level);
      if (w.offline && !p.offline) add(w.id, 'Signal lost', 'muted');
      if (!w.offline && p.offline) add(w.id, 'Signal back', 'safe');
    }

    prevRef.current = Object.fromEntries(workers.map((w) => [w.id, w]));
    if (found.length) setEvents((list) => [...list, ...found].slice(-MAX_EVENTS));
  }, [workers]);

  return events;
}
