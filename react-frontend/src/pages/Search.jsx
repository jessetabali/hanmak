import { useState } from 'react';
import { useApiQuery } from '../hooks/useApi';
import { EP } from '../api/endpoints';

export default function Search() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading } = useApiQuery(
    ['search', submitted],
    EP.SEARCH,
    { q: submitted },
    { enabled: submitted.length > 1 },
  );
  const results = data?.results || [];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Search</h1></div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setSubmitted(query); }} style={{ marginBottom: '1.5rem' }}>
        <input
          className="form-input"
          style={{ width: '100%', maxWidth: '480px' }}
          placeholder="Search envelopes, templates, documents…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </form>
      {isLoading && <div>Searching…</div>}
      {results.length === 0 && submitted && !isLoading && (
        <div className="empty-state"><div className="empty-state-title">No results for "{submitted}"</div></div>
      )}
      {results.map((r) => (
        <div key={r.id} className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
          <div style={{ fontWeight: 600 }}>{r.title}</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{r.object_type} #{r.object_id}</div>
        </div>
      ))}
    </div>
  );
}
