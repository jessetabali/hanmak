const COLORS = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#d97706', '#0891b2', '#dc2626'];

function colorFor(name) {
  const code = String(name || ' ').charCodeAt(0);
  return COLORS[code % COLORS.length];
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name = '', size = 36 }) {
  return (
    <div
      aria-label={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: colorFor(name),
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.33) + 'px',
        fontWeight: 700,
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {initials(name)}
    </div>
  );
}
