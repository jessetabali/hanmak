import { useState, useMemo } from 'react';
import { useErrorLogStore } from '../../store/errorLogStore';
import { formatDateTime } from '../../utils/formatting';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function JsonBlock({ data }) {
  if (data == null) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <pre
      style={{
        margin: 0,
        fontSize: 11.5,
        lineHeight: 1.5,
        maxHeight: 220,
        overflowY: 'auto',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 5,
        padding: '8px 10px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        color: 'var(--text-secondary)',
      }}
    >
      {text}
    </pre>
  );
}

const LEVEL_STYLE = {
  error:   { background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' },
  warning: { background: '#fef9c3', color: '#a16207', border: '1px solid #fde047' },
  info:    { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
};

const METHOD_STYLE = {
  GET:    { background: '#dbeafe', color: '#1d4ed8' },
  POST:   { background: '#dcfce7', color: '#15803d' },
  PATCH:  { background: '#fef9c3', color: '#a16207' },
  PUT:    { background: '#ffedd5', color: '#c2410c' },
  DELETE: { background: '#fee2e2', color: '#b91c1c' },
};

function Chip({ label, style }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 7px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.03em',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {label}
    </span>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function LogRow({ entry, onResolve, onUnresolve, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const levelStyle = LEVEL_STYLE[entry.level] ?? LEVEL_STYLE.info;
  const methodStyle = entry.method ? (METHOD_STYLE[entry.method] ?? {}) : {};

  return (
    <>
      <tr
        style={{
          opacity: entry.resolved ? 0.5 : 1,
          background: expanded ? 'var(--bg-secondary)' : undefined,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', fontSize: 12 }}>
          <span title={formatDateTime(entry.timestamp)} style={{ color: 'var(--text-muted)' }}>
            {relativeTime(entry.timestamp)}
          </span>
        </td>
        <td style={{ padding: '8px 10px' }}>
          <Chip label={entry.level.toUpperCase()} style={levelStyle} />
        </td>
        <td style={{ padding: '8px 10px' }}>
          {entry.method ? (
            <Chip label={entry.method} style={methodStyle} />
          ) : (
            <Chip label="RENDER" style={{ background: '#f3e8ff', color: '#7e22ce' }} />
          )}
        </td>
        <td style={{ padding: '8px 10px' }}>
          {entry.statusCode ? (
            <code
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: entry.statusCode >= 500 ? 'var(--danger)' : entry.statusCode >= 400 ? '#d97706' : 'var(--success)',
              }}
            >
              {entry.statusCode}
            </code>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
          )}
        </td>
        <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
          {entry.endpoint || '—'}
        </td>
        <td
          style={{
            padding: '8px 10px',
            fontSize: 12,
            maxWidth: 300,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={entry.message}
        >
          {entry.message}
        </td>
        <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
          {entry.pageUrl}
        </td>
        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            {entry.resolved ? (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => onUnresolve(entry.id)}>
                Reopen
              </button>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--success)' }} onClick={() => onResolve(entry.id)}>
                ✓ Resolve
              </button>
            )}
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, color: 'var(--danger)' }}
              onClick={() => onDelete(entry.id)}
            >
              ✕
            </button>
          </div>
        </td>
      </tr>

      {expanded && (
        <tr style={{ background: 'var(--bg-secondary)' }}>
          <td colSpan={8} style={{ padding: '12px 16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Full Message
                </div>
                <div style={{ fontSize: 13, wordBreak: 'break-word', color: 'var(--text-primary)', marginBottom: 12 }}>
                  {entry.message}
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Request Payload
                </div>
                <JsonBlock data={entry.requestPayload} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                  Response Body
                </div>
                <JsonBlock data={entry.responseBody} />
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                  <strong>Time:</strong> {formatDateTime(entry.timestamp)}&ensp;
                  <strong>Page:</strong> {entry.pageUrl}&ensp;
                  <strong>Source:</strong> {entry.source}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ErrorLog() {
  const { entries, resolve, unresolve, deleteEntry, clearResolved, clearAll } = useErrorLogStore();

  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterStatus, setFilterStatus] = useState('unresolved');
  const [filterMethod, setFilterMethod] = useState('');
  const [confirmClear, setConfirmClear] = useState(null); // 'resolved' | 'all'

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return entries.filter((e) => {
      if (filterLevel && e.level !== filterLevel) return false;
      if (filterStatus === 'unresolved' && e.resolved) return false;
      if (filterStatus === 'resolved' && !e.resolved) return false;
      if (filterMethod && e.method !== filterMethod) return false;
      if (q && !`${e.endpoint} ${e.message} ${e.pageUrl} ${e.statusCode}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, filterLevel, filterStatus, filterMethod]);

  const stats = useMemo(() => ({
    total: entries.length,
    unresolved: entries.filter((e) => !e.resolved).length,
    errors: entries.filter((e) => e.level === 'error' && !e.resolved).length,
    warnings: entries.filter((e) => e.level === 'warning' && !e.resolved).length,
  }), [entries]);

  function exportJson() {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-log-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const headers = 'timestamp,level,method,status,endpoint,message,pageUrl,resolved';
    const rows = filtered.map((e) =>
      [
        e.timestamp,
        e.level,
        e.method ?? '',
        e.statusCode ?? '',
        `"${(e.endpoint ?? '').replace(/"/g, '""')}"`,
        `"${e.message.replace(/"/g, '""')}"`,
        `"${e.pageUrl.replace(/"/g, '""')}"`,
        e.resolved,
      ].join(',')
    );
    const blob = new Blob([[headers, ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `error-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Error Log</h1>
          <p className="page-subtitle">All API and render errors captured by the frontend — for admin & super admin diagnosis</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
          <button className="btn btn-ghost btn-sm" onClick={exportJson} disabled={!filtered.length}>Export JSON</button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--warning)' }}
            onClick={() => setConfirmClear('resolved')}
            disabled={!entries.some((e) => e.resolved)}
          >
            Clear Resolved
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)' }}
            onClick={() => setConfirmClear('all')}
            disabled={!entries.length}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Logged', value: stats.total, color: 'var(--text-primary)' },
          { label: 'Unresolved', value: stats.unresolved, color: stats.unresolved ? 'var(--danger)' : 'var(--success)' },
          { label: 'Active Errors', value: stats.errors, color: 'var(--danger)' },
          { label: 'Warnings', value: stats.warnings, color: 'var(--warning)' },
        ].map((s) => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '12px 14px',
          background: 'var(--bg-card)',
          borderRadius: 8,
          border: '1px solid var(--border)',
        }}
      >
        <input
          className="form-input"
          placeholder="Search endpoint, message, status…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: 260, fontSize: 13 }}
        />
        <select className="form-input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ width: 140, fontSize: 13 }}>
          <option value="">All Status</option>
          <option value="unresolved">Unresolved</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="form-input" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} style={{ width: 130, fontSize: 13 }}>
          <option value="">All Levels</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>
        <select className="form-input" value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} style={{ width: 130, fontSize: 13 }}>
          <option value="">All Methods</option>
          {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        {(search || filterLevel || filterMethod || filterStatus) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setFilterLevel(''); setFilterMethod(''); setFilterStatus('unresolved'); }}
          >
            Reset
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          {filtered.length} of {entries.length} entries
        </span>
      </div>

      {/* Table */}
      {entries.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            color: 'var(--text-muted)',
            background: 'var(--bg-card)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✓</div>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
            No errors logged
          </div>
          <div style={{ fontSize: '0.875rem' }}>
            Errors will appear here automatically as they occur. Click any row to expand details.
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
          No entries match the current filters.
        </div>
      ) : (
        <div style={{ overflowX: 'auto', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
                {['When', 'Level', 'Method', 'Status', 'Endpoint', 'Message', 'Page', 'Actions'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '9px 10px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <LogRow
                  key={entry.id}
                  entry={entry}
                  onResolve={resolve}
                  onUnresolve={unresolve}
                  onDelete={deleteEntry}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmClear && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={() => setConfirmClear(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)', borderRadius: 10, padding: 24, width: 360,
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)', border: '1px solid var(--border)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>
              {confirmClear === 'all' ? 'Clear all log entries?' : 'Clear resolved entries?'}
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              {confirmClear === 'all'
                ? 'This will permanently delete all logged errors. This cannot be undone.'
                : 'This will delete all entries that have been marked as resolved.'}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmClear(null)}>Cancel</button>
              <button
                className="btn btn-danger"
                onClick={() => { confirmClear === 'all' ? clearAll() : clearResolved(); setConfirmClear(null); }}
              >
                {confirmClear === 'all' ? 'Clear All' : 'Clear Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
