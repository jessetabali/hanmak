export default function Pagination({ hasNext, hasPrev, onNext, onPrev, count, page }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)',
      fontSize: '0.8125rem', color: 'var(--text-muted)',
    }}>
      <span>
        {count !== undefined ? `${count} total` : 'Showing results'}
        {page ? ` — page ${page}` : ''}
      </span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-ghost btn-sm" disabled={!hasPrev} onClick={onPrev}>
          ← Previous
        </button>
        <button className="btn btn-ghost btn-sm" disabled={!hasNext} onClick={onNext}>
          Next →
        </button>
      </div>
    </div>
  );
}
