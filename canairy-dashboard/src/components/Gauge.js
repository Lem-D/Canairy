// Gas dial: a wide arc that fades green → yellow → orange → red, labels from
// 0 to GAUGE_MAX, a needle and the reading in the middle. Drawn by hand in SVG
// (no chart library). Offline workers get a grey arc and no needle.
import { useId } from 'react';
import { GAUGE_MAX } from '../config';

const TICKS = [0, 0.25, 0.5, 0.75, 1];
// The arc runs 220° around (70, 62): from 160° (bottom left) to 380° (bottom right).
const START = 160;
const SWEEP = 220;

function tickPos(fraction) {
  const angle = ((START + fraction * SWEEP) * Math.PI) / 180;
  return { x: 70 + 34 * Math.cos(angle), y: 62 + 34 * Math.sin(angle) + 2.5 };
}

export default function Gauge({ value, offline = false, width = 140, label }) {
  const gradientId = `gauge-${useId().replace(/:/g, '')}`;
  const needle = START + (Math.min(GAUGE_MAX, Math.max(0, value)) / GAUGE_MAX) * SWEEP;
  return (
    <svg width={width} height={(width * 96) / 140} viewBox="0 0 140 96" role="img" aria-label={label} className="gauge">
      <defs>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="120" y2="0">
          <stop offset="0" stopColor="#3f9e70" />
          <stop offset="0.3" stopColor="#7cbf55" />
          <stop offset="0.5" stopColor="#e2c13f" />
          <stop offset="0.75" stopColor="#ff8a3c" />
          <stop offset="0.95" stopColor="#e0533f" />
        </linearGradient>
      </defs>
      <path d="M23 79.1 A50 50 0 1 1 117 79.1" fill="none" stroke="#2a231e" strokeWidth="16" />
      <path d="M23 79.1 A50 50 0 1 1 117 79.1" fill="none" stroke={offline ? '#3a332c' : `url(#${gradientId})`} strokeWidth="12" />
      {TICKS.map((f) => {
        const p = tickPos(f);
        return (
          <text key={f} x={p.x} y={p.y} textAnchor="middle" className="gauge-tick">
            {Math.round(f * GAUGE_MAX)}
          </text>
        );
      })}
      {!offline && (
        <>
          <g className="gauge-needle" style={{ transform: `rotate(${needle}deg)` }}>
            <path d="M70 59.5 L112 62 L70 64.5 Z" fill="#f4efe9" />
          </g>
          <circle cx="70" cy="62" r="5" fill="#f4efe9" stroke="#15120f" strokeWidth="2" />
        </>
      )}
      <text x="70" y="90" textAnchor="middle" className="gauge-value">
        {offline ? '—' : value}
      </text>
    </svg>
  );
}
