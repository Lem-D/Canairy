// Big banner across the top for the most urgent problem on site.
import SosTriangle from './SosTriangle';
import { GAS_THRESHOLDS } from '../config';
import { clockTime, duration } from '../lib';

export default function AlertBanner({ alert, now, onView, onAcknowledge }) {
  if (!alert) return null;
  const { kind, worker: w, view } = alert;
  let title;
  let detail;
  if (kind === 'sos') {
    title = `SOS from ${w.name}`;
    detail = `${view.zoneText} · pressed at ${clockTime(w.sosSince || now)} (${duration(now - (w.sosSince || now))} ago). Send help and acknowledge.`;
  } else if (kind === 'gas') {
    title = `Dangerous gas near ${w.name}`;
    detail = `Reading ${w.gas} ppm in ${view.zoneText}, above the ${GAS_THRESHOLDS.danger} ppm danger line. Clear the area.`;
  } else {
    title = `${w.name} is not reporting`;
    detail = `No signal for ${duration(now - w.lastSeen)}. Check the wearable battery and radio range.`;
  }
  return (
    <div role="alert" className={`panel banner ${kind}`}>
      <div className="banner-text">
        {kind === 'sos' ? (
          <SosTriangle active size={34} decorative />
        ) : (
          <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" className="banner-icon">
            <path d="M12 3 L22 20 H2 Z" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
            <path d="M12 9v5M12 17h.01" stroke="var(--banner-bg)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        )}
        <div>
          <div className="banner-title">{title}</div>
          <div className="banner-detail">{detail}</div>
        </div>
      </div>
      <div className="row-gap">
        <button type="button" className="btn outline" onClick={() => onView(w.id)}>
          View worker
        </button>
        <button type="button" className="btn solid" onClick={() => onAcknowledge(alert)}>
          {kind === 'sos' ? 'Acknowledge SOS' : 'Acknowledge'}
        </button>
      </div>
    </div>
  );
}
