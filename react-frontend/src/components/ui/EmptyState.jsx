export default function EmptyState({ title = 'No items', message = '', action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-title">{title}</div>
      {message && (
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem', marginBottom: 0 }}>
          {message}
        </p>
      )}
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
}
