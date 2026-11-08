// Settings the team is likely to change. Everything else reads from here.

// Where the bridge is running (see bridge/README.md).
export const BRIDGE_URL = 'ws://localhost:8080';

// No data from a worker for this long and they show as "No signal".
export const OFFLINE_AFTER_MS = 5000;

// PLACEHOLDER gas cutoffs in LPG ppm, as estimated by the wearable's MQ-2. Danger
// matches the modules' ppm_thresh. Check both against a calibrated sensor.
export const GAS_THRESHOLDS = { warning: 1000, danger: 2000 };

// The dial goes from 0 to this, in ppm. Readings above it pin the needle at the end.
export const GAUGE_MAX = 3000;

// Shown in the header and the Emergency info box. Fill these in.
export const SITE = {
  name: '[YOUR SITE NAME]',
  shift: 'Day shift',
  musterPoint: '[YOUR MUSTER POINT]',
  safetyLead: '[NAME, PHONE]',
};

// The bridge only knows each worker's id, name, gas and SOS. Role and zone are
// typed in here by hand, keyed by worker id (real wearables 1-99, simulated
// 101 and up). Anyone not listed shows as "Zone not set".
export const ZONES = {
  A: 'Scaffolding · Ground floor',
  B: 'Level 2 · Loading bay',
  C: 'Fabrication · Stairwell',
};

export const WORKER_INFO = {
  1: { role: 'Wearable prototype', zone: 'A' },
  101: { role: 'Welder', zone: 'C' },
  102: { role: 'Electrician', zone: 'B' },
  103: { role: 'Labourer', zone: 'A' },
  104: { role: 'Machine operator', zone: 'B' },
};
