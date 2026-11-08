// React hook that connects the dashboard to the Canairy bridge.
//
// Start the bridge first (see bridge/README.md), then in any component:
//
//   import { useWorkers } from './hooks/useWorkers';
//   const { workers, connected, serial, siteHistory, acknowledge, now } = useWorkers();
//
//   workers      every worker the bridge has seen, sorted by id. Each one has:
//                  id, name, source ('live' | 'sim'), gas (ppm), sos,
//                  acknowledged, seq, lost (packets missed), lastSeen (ms),
//                  offline     true if nothing heard for OFFLINE_AFTER_MS
//                  level       'safe' | 'warning' | 'danger' from GAS_THRESHOLDS
//                  ok          false if SOS, gas at danger, or offline
//                  reasons     why not ok, e.g. ['sos', 'gas', 'offline']
//                  history     [{ t, gas }] for the last 10 minutes, oldest first
//                  received    readings this browser has received
//                  firstSeen   when this browser first heard from them (ms)
//                  sosSince    when the current SOS started (ms), or null
//                  dangerSince when gas went above the danger line (ms), or null
//   connected    true while the browser is connected to the bridge
//   serial       receiver Arduino status: { state: 'connected' | 'searching' | 'disabled', path }
//   siteHistory  highest gas reading among online workers, once a second, last minute
//   acknowledge(id)  tell the bridge a supervisor has seen this worker's SOS
//   now          the current time, updated every second
//
// It reconnects by itself if the bridge is restarted.
// Settings (bridge address, gas cutoffs, ...) are in src/config.js.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BRIDGE_URL, GAS_THRESHOLDS, OFFLINE_AFTER_MS } from '../config';

export { BRIDGE_URL, GAS_THRESHOLDS, OFFLINE_AFTER_MS };

const HISTORY_MS = 10 * 60 * 1000;
const SITE_HISTORY_LENGTH = 60;

export function gasLevel(gas) {
  if (gas >= GAS_THRESHOLDS.danger) return 'danger';
  if (gas >= GAS_THRESHOLDS.warning) return 'warning';
  return 'safe';
}

// Adds one reading to a worker, keeping the browser-side extras.
function withReading(prev, worker, lastSeen) {
  const isNew = !prev || prev.seq !== worker.seq; // an ack re-sends the same reading
  let history = prev?.history || [];
  if (isNew) {
    history = [...history, { t: lastSeen, gas: worker.gas }];
    while (history.length && lastSeen - history[0].t > HISTORY_MS) history = history.slice(1);
  }
  const danger = worker.gas >= GAS_THRESHOLDS.danger;
  return {
    ...worker,
    lastSeen,
    history,
    received: (prev?.received || 0) + (isNew ? 1 : 0),
    firstSeen: prev?.firstSeen ?? lastSeen,
    sosSince: worker.sos ? prev?.sosSince ?? lastSeen : null,
    dangerSince: danger ? prev?.dangerSince ?? lastSeen : null,
  };
}

export function useWorkers({ url = BRIDGE_URL, offlineAfterMs = OFFLINE_AFTER_MS } = {}) {
  const [byId, setById] = useState({});
  const [connected, setConnected] = useState(false);
  const [serial, setSerial] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [siteHistory, setSiteHistory] = useState([]);
  const socketRef = useRef(null);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  useEffect(() => {
    let socket;
    let retryTimer;
    let retryDelay = 500;
    let stopped = false;

    function connect() {
      socket = new WebSocket(url);
      socketRef.current = socket;

      // After cleanup (unmount, or React StrictMode's double-mount in dev),
      // this socket's events are ignored so they can't overwrite the new one.
      socket.onopen = () => {
        if (stopped) return;
        setConnected(true);
        retryDelay = 500;
      };

      socket.onmessage = (event) => {
        if (stopped) return;
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }
        // lastSeen is converted to this browser's clock, in case they differ.
        if (msg.type === 'snapshot') {
          const offset = Date.now() - msg.serverTime;
          setById((prev) =>
            Object.fromEntries(msg.workers.map((w) => [w.id, withReading(prev[w.id], w, w.lastSeen + offset)])),
          );
          setSerial(msg.serial);
        } else if (msg.type === 'worker') {
          setById((prev) => ({ ...prev, [msg.worker.id]: withReading(prev[msg.worker.id], msg.worker, Date.now()) }));
        } else if (msg.type === 'serial') {
          setSerial(msg.serial);
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        setConnected(false);
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5000);
      };

      socket.onerror = () => socket.close();
    }

    connect();
    const clock = setInterval(() => {
      const t = Date.now();
      setNow(t);
      const online = Object.values(byIdRef.current).filter((w) => t - w.lastSeen <= offlineAfterMs);
      if (online.length) {
        const max = Math.max(...online.map((w) => w.gas));
        setSiteHistory((prev) => [...prev, max].slice(-SITE_HISTORY_LENGTH));
      }
    }, 1000);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(clock);
      socket.close();
    };
  }, [url, offlineAfterMs]);

  const acknowledge = useCallback((id) => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ack', id }));
  }, []);

  const workers = useMemo(
    () =>
      Object.values(byId)
        .map((w) => {
          const offline = now - w.lastSeen > offlineAfterMs;
          const level = gasLevel(w.gas);
          // What makes a worker "Not OK" is still a team decision. Edit here.
          const reasons = [];
          if (w.sos) reasons.push('sos');
          if (level === 'danger') reasons.push('gas');
          if (offline) reasons.push('offline');
          return { ...w, offline, level, ok: reasons.length === 0, reasons };
        })
        .sort((a, b) => a.id - b.id),
    [byId, now, offlineAfterMs],
  );

  return { workers, connected, serial, siteHistory, acknowledge, now };
}
