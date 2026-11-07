// Simple bar chart of gas readings with dashed warning and danger lines.
import { GAS_THRESHOLDS, GAUGE_MAX } from '../config';
import { barColor } from '../lib';

const pct = (v) => `${Math.min(100, (v / GAUGE_MAX) * 100)}%`;

export default function Bars({ values, slots, height = 110, labelsLeft = true }) {
  // Empty slots on the left so new bars appear on the right, like a live feed.
  const padded = Array.from({ length: Math.max(0, slots - values.length) }, () => null).concat(values.slice(-slots));
  return (
    <div className="bars" style={{ height }}>
      <div className="bars-line danger" style={{ bottom: pct(GAS_THRESHOLDS.danger) }}>
        <span className={labelsLeft ? 'left' : ''}>Danger {GAS_THRESHOLDS.danger}</span>
      </div>
      <div className="bars-line warn" style={{ bottom: pct(GAS_THRESHOLDS.warning) }}>
        <span className={labelsLeft ? 'left' : ''}>Warning {GAS_THRESHOLDS.warning}</span>
      </div>
      {padded.map((v, i) => (
        <div
          key={i}
          className="bar"
          title={v == null ? undefined : String(v)}
          style={v == null ? undefined : { height: pct(v), background: barColor(v) }}
        />
      ))}
    </div>
  );
}
