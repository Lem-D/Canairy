// Small helpers shared by the components.
import { GAS_THRESHOLDS, WORKER_INFO, ZONES } from './config';

export function workerInfo(id) {
  const info = WORKER_INFO[id] || {};
  const zone = info.zone && ZONES[info.zone] !== undefined ? info.zone : null;
  return {
    role: info.role || 'Worker',
    zone,
    zoneText: zone ? `Zone ${zone}` : 'Zone not set',
  };
}

export function initials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function duration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function clockTime(time) {
  return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

// Everything about how one worker should look, worked out in one place.
// rank: 0 SOS, 1 dangerous gas, 2 no signal, 3 gas warning, 4 all clear.
export function workerView(w, now) {
  const info = workerInfo(w.id);
  let rank = 4;
  let status = 'OK';
  let reason = 'All clear';
  if (w.sos) {
    rank = 0;
    status = 'NOT OK';
    reason = w.acknowledged ? 'SOS acknowledged' : `SOS pressed ${duration(now - (w.sosSince || now))} ago`;
  } else if (w.level === 'danger' && !w.offline) {
    rank = 1;
    status = 'NOT OK';
    reason = 'Dangerous gas';
  } else if (w.offline) {
    rank = 2;
    status = 'NO SIGNAL';
    reason = `Lost signal ${duration(now - w.lastSeen)} ago`;
  } else if (w.level === 'warning') {
    rank = 3;
    reason = 'Gas rising, watch closely';
  }
  const level = w.offline ? 'nodata' : w.level;
  return { ...info, rank, status, reason, level, levelText: LEVEL_TEXT[level] };
}

export const LEVEL_TEXT = { safe: 'Safe', warning: 'Warning', danger: 'Danger', nodata: 'No data' };

export function barColor(gas) {
  if (gas >= GAS_THRESHOLDS.danger) return 'var(--danger-bar)';
  if (gas >= GAS_THRESHOLDS.warning) return 'var(--warn-bar)';
  return 'var(--safe-bar)';
}
