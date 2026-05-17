export default function Spinner({ size = 24, center = false }) {
  const el = <span className="spinner" style={{ width: size, height: size }} />;
  if (!center) return el;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
      {el}
    </div>
  );
}
