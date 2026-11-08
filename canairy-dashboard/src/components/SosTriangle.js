// Warning triangle: grey when off, red and pulsing while SOS is active.
export default function SosTriangle({ active, acknowledged = false, size = 34, decorative = false }) {
  const on = active;
  const label = on ? (acknowledged ? 'SOS active, acknowledged' : 'SOS active') : 'SOS not active';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`sos-triangle ${on && !acknowledged ? 'sos-on' : ''}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label })}
    >
      <path d="M12 3 L22 20 H2 Z" fill={on ? 'var(--sos)' : 'transparent'} stroke={on ? 'var(--sos)' : 'var(--border-muted)'} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v5M12 17h.01" stroke={on ? 'var(--ink-on-brand)' : 'var(--border-muted)'} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
