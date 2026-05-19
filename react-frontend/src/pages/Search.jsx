import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useApiQuery } from '../hooks/useApi';
import { EP } from '../api/endpoints';
import { formatDate, formatDateTime } from '../utils/formatting';
import Badge, { statusColor } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Avatar from '../components/ui/Avatar';

const TYPE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'envelopes', label: 'Envelopes' },
  { key: 'templates', label: 'Templates' },
  { key: 'documents', label: 'Documents' },
  { key: 'users', label: 'Users' },
  { key: 'audit_events', label: 'Audit Events' },
];

// Highlight a query term within text — wraps matches in <mark>
function highlight(text, query) {
  if (!query || !text) return text || '';
  const str = String(text);
  const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = str.split(new RegExp(`(${q})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} style={{ background: '#fef08a', borderRadius: 2 }}>{part}</mark>
    ) : part
  );
}

// ── Result renderers ──

function EnvelopeResult({ item, query }) {
  return (
    <Link
      to={`/envelopes/${item.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
            {highlight(item.name || item.subject || `Envelope #${item.id}`, query)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Created {formatDate(item.created_at)}
          </div>
        </div>
        <Badge color={statusColor(item.status)}>{item.status || '—'}</Badge>
      </div>
    </Link>
  );
}

function TemplateResult({ item, query }) {
  return (
    <Link
      to="/templates"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
            {highlight(item.name || `Template #${item.id}`, query)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Created {formatDate(item.created_at)}
          </div>
        </div>
        {item.status && <Badge color={statusColor(item.status)}>{item.status}</Badge>}
      </div>
    </Link>
  );
}

function DocumentResult({ item, query }) {
  return (
    <Link
      to="/documents"
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
            {highlight(item.title || item.name || `Document #${item.id}`, query)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {item.mime_type || item.file_type || 'File'}
            {item.file_size && ` · ${item.file_size}`}
            {' · Created '}{formatDate(item.created_at)}
          </div>
        </div>
        {item.status && <Badge color={statusColor(item.status)}>{item.status}</Badge>}
      </div>
    </Link>
  );
}

function UserResult({ item, query }) {
  const name = item.display_name || item.full_name || item.username || `User #${item.id}`;
  return (
    <Link
      to={`/admin/users/${item.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Avatar name={name} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, marginBottom: '0.1rem' }}>
            {highlight(name, query)}
          </div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {highlight(item.email || '', query)}
          </div>
        </div>
        {item.role && <Badge color="primary">{item.role}</Badge>}
      </div>
    </Link>
  );
}

function AuditEventResult({ item, query }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem', flexWrap: 'wrap' }}>
        <span
          className="mono"
          style={{
            fontSize: '0.72rem',
            padding: '0.15rem 0.4rem',
            background: 'var(--bg-secondary)',
            borderRadius: 4,
            color: 'var(--primary)',
          }}
        >
          {highlight(item.event_type || '—', query)}
        </span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          {formatDateTime(item.created_at)}
        </span>
      </div>
      <div style={{ fontSize: '0.875rem' }}>
        {highlight(item.message || item.actor_username || '—', query)}
      </div>
    </div>
  );
}

function GenericResult({ item, query }) {
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>
        {highlight(item.title || item.name || item.display_name || `#${item.id}`, query)}
      </div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        {item.object_type || item.type} · #{item.object_id || item.id}
      </div>
    </div>
  );
}

// Pick the right renderer
function ResultItem({ item, type, query }) {
  const itemType = item.object_type || item.type || type;
  const Renderer =
    itemType === 'envelope' || itemType === 'envelopes'
      ? EnvelopeResult
      : itemType === 'template' || itemType === 'templates'
      ? TemplateResult
      : itemType === 'document' || itemType === 'documents'
      ? DocumentResult
      : itemType === 'user' || itemType === 'users'
      ? UserResult
      : itemType === 'audit_event' || itemType === 'audit_events'
      ? AuditEventResult
      : GenericResult;
  return <Renderer item={item} query={query} />;
}

// Group results by type for "All" view
function groupByType(results) {
  const groups = {};
  results.forEach((item) => {
    const key = item.object_type || item.type || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });
  return groups;
}

const TYPE_LABELS = {
  envelope: 'Envelopes',
  template: 'Templates',
  document: 'Documents',
  user: 'Users',
  audit_event: 'Audit Events',
  other: 'Other',
};

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const setQuery = (q) => setSearchParams(q ? { q } : {});

  const [inputValue, setInputValue] = useState(query);
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const searchTimer = useRef(null);

  // Sync input value when URL param changes externally
  useEffect(() => {
    setInputValue(query);
    setPage(1);
  }, [query]);

  const handleInputChange = useCallback((value) => {
    setInputValue(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setQuery(value);
      setPage(1);
    }, 300);
  }, []);

  const handleTypeChange = (key) => {
    setTypeFilter(key);
    setPage(1);
  };

  const { data, isLoading } = useApiQuery(
    ['search', query, typeFilter, page],
    EP.SEARCH,
    {
      q: query,
      type: typeFilter !== 'all' ? typeFilter : undefined,
      page,
    },
    { enabled: query.length >= 2 }
  );

  const results = data?.results ?? data ?? [];
  const totalCount = data?.count ?? results.length;
  const hasNext = !!data?.next;
  const hasPrev = !!data?.previous;

  const isGrouped = typeFilter === 'all' && results.length > 0;
  const groups = isGrouped ? groupByType(results) : {};

  // Cleanup
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-subtitle">Search across envelopes, templates, documents, users, and audit events</p>
        </div>
      </div>

      {/* Search bar */}
      <div style={{ marginBottom: '1.5rem' }}>
        <input
          className="form-input"
          style={{ width: '100%', fontSize: '1.0625rem', padding: '0.75rem 1rem' }}
          placeholder="Search envelopes, templates, documents, users…"
          value={inputValue}
          onChange={(e) => handleInputChange(e.target.value)}
          autoFocus
        />
      </div>

      {/* Type filter tabs */}
      <div className="tabs" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            className={`tab${typeFilter === f.key ? ' active' : ''}`}
            onClick={() => handleTypeChange(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Results area */}
      {query.length < 2 ? (
        <div style={{ textAlign: 'center', padding: '4rem 0', color: 'var(--text-muted)', fontSize: '1rem' }}>
          Type at least 2 characters to search
        </div>
      ) : isLoading ? (
        <Spinner center />
      ) : results.length === 0 ? (
        <EmptyState
          title={`No results for "${query}"`}
          message="Try different keywords or broaden your search."
        />
      ) : isGrouped ? (
        // Grouped view (All types)
        <div className="flex flex-col gap-4">
          {Object.entries(groups).map(([type, items]) => (
            <div key={type}>
              <div
                className="section-title"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: 'var(--text-muted)',
                  marginBottom: '0.5rem',
                  paddingBottom: '0.375rem',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                {TYPE_LABELS[type] || type} ({items.length})
              </div>
              <div className="flex flex-col gap-2">
                {items.map((item, i) => (
                  <div
                    key={item.id ?? `${type}-${i}`}
                    className="card"
                    style={{ padding: '0.875rem 1rem' }}
                  >
                    <ResultItem item={item} type={type} query={query} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Pagination for grouped */}
          {(hasNext || hasPrev || totalCount > results.length) && (
            <Pagination
              count={totalCount}
              page={page}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage((p) => p + 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
            />
          )}
        </div>
      ) : (
        // Flat list (specific type selected)
        <div className="flex flex-col gap-2">
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            {totalCount} result{totalCount !== 1 ? 's' : ''} for "{query}"
          </div>
          {results.map((item, i) => (
            <div
              key={item.id ?? `result-${i}`}
              className="card"
              style={{ padding: '0.875rem 1rem' }}
            >
              <ResultItem item={item} type={typeFilter} query={query} />
            </div>
          ))}

          {/* Pagination */}
          {(hasNext || hasPrev || totalCount > results.length) && (
            <Pagination
              count={totalCount}
              page={page}
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage((p) => p + 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
            />
          )}
        </div>
      )}
    </div>
  );
}
