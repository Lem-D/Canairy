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
      <path d="M12 3 L22 20 H2 Z" fill={on ? '#ff5a4a' : 'transparent'} stroke={on ? '#ff5a4a' : '#5e544a'} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9v5M12 17h.01" stroke={on ? '#1a0806' : '#5e544a'} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
