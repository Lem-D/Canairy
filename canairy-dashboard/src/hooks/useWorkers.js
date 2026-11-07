// React hook that connects the dashboard to the Canairy bridge.
//
// Start the bridge first (see bridge/README.md), then in any component:
//
//   import { useWorkers } from './hooks/useWorkers';
//   const { workers, connected, serial, acknowledge } = useWorkers();
//
//   workers      every worker the bridge has seen, sorted by id. Each one has:
//                  id, name, source ('live' | 'sim'), gas (0-1023), sos,
//                  acknowledged, seq, lost (packets missed), lastSeen (ms),
//                  offline   true if nothing heard for OFFLINE_AFTER_MS
//                  level     'safe' | 'warning' | 'danger' from GAS_THRESHOLDS
//                  ok        false if SOS, gas at danger, or offline
//                  reasons   why not ok, e.g. ['sos', 'gas', 'offline']
//   connected    true while the browser is connected to the bridge
//   serial       receiver Arduino status from the bridge:
//                  { state: 'connected' | 'searching' | 'disabled', path }
//   acknowledge(id)  tell the bridge a supervisor has seen this worker's SOS
//
// It reconnects by itself if the bridge is restarted.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export const BRIDGE_URL = 'ws://localhost:8080';

// No data for this long and the worker shows as offline.
export const OFFLINE_AFTER_MS = 5000;

// PLACEHOLDER thresholds on the raw MQ-2 reading (0-1023). The team still has
// to pick these: take a clean-air reading after warm-up and set them from that.
export const GAS_THRESHOLDS = { warning: 400, danger: 600 };

export function gasLevel(gas) {
  if (gas >= GAS_THRESHOLDS.danger) return 'danger';
  if (gas >= GAS_THRESHOLDS.warning) return 'warning';
  return 'safe';
}

export function useWorkers({ url = BRIDGE_URL, offlineAfterMs = OFFLINE_AFTER_MS } = {}) {
  const [byId, setById] = useState({});
  const [connected, setConnected] = useState(false);
  const [serial, setSerial] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const socketRef = useRef(null);

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
          setById(Object.fromEntries(msg.workers.map((w) => [w.id, { ...w, lastSeen: w.lastSeen + offset }])));
          setSerial(msg.serial);
        } else if (msg.type === 'worker') {
          setById((prev) => ({ ...prev, [msg.worker.id]: { ...msg.worker, lastSeen: Date.now() } }));
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
    const clock = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(clock);
      socket.close();
    };
  }, [url]);

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

  return { workers, connected, serial, acknowledge };
}
