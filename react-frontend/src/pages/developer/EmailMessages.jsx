import { useState, useCallback, useEffect, useRef } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Drawer from '../../components/ui/Drawer';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'failed', label: 'Failed' },
  { id: 'delivered', label: 'Delivered' },
];

function emailStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'sent') return 'success';
  if (s === 'failed' || s === 'bounced') return 'danger';
  if (s === 'pending' || s === 'queued') return 'warning';
  return 'secondary';
}

// ── Message Detail Drawer ─────────────────────────────────────────────────────

function MessageDrawer({ message, onClose, onRetry, onBounce }) {
  return (
    <Drawer open={!!message} onClose={onClose} title="Email Message Detail" width={500}>
      {message && (
        <div className="flex flex-col gap-4">
          {/* Status badge */}
          <div className="flex gap-2">
            <Badge color={emailStatusColor(message.status)}>{message.status || 'unknown'}</Badge>
            {message.email_type && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Template: {message.email_type}</span>
            )}
          </div>

          {/* Key/value fields */}
          <div className="card" style={{ padding: '1rem' }}>
            {[
              ['To', message.to_email || message.recipient || '—'],
              ['From', message.from_email || '—'],
              ['Subject', message.subject || '—'],
              ['Template', message.template_name || message.email_type || '—'],
              ['Created', message.created_at ? formatDateTime(message.created_at) : '—'],
              ['Queued', message.queued_at ? formatDateTime(message.queued_at) : '—'],
              ['Sent', message.sent_at ? formatDateTime(message.sent_at) : '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ fontSize: '0.875rem' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Error message if failed */}
          {message.error_message && (
            <div className="card" style={{ padding: '1rem', background: '#fef2f2', border: '1px solid var(--danger)' }}>
              <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '0.375rem', fontSize: '0.875rem' }}>Delivery Error</div>
              <pre className="mono" style={{ fontSize: '0.8125rem', color: 'var(--danger)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {message.error_message}
              </pre>
            </div>
          )}

          {/* Body preview */}
          {(message.body || message.html_body || message.text_body) && (
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Body Preview</div>
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: '6px',
                  padding: '0.75rem',
                  fontSize: '0.8125rem',
                  maxHeight: '250px',
                  overflowY: 'auto',
                  whiteSpace: 'pre-wrap',
                  color: 'var(--text-secondary)',
                }}
              >
                {/* Show text body or strip HTML tags for preview */}
                {message.text_body ||
                  (message.html_body || message.body || '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                    .slice(0, 1500) || 'No body content.'}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {message.status === 'failed' && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => { onRetry?.(message.id); onClose(); }}
              >
                ↻ Retry
              </button>
            )}
            {(message.status === 'delivered' || message.status === 'sent' || message.status === 'pending') && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => { onBounce?.(message.id); onClose(); }}
              >
                Mark Bounced
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EmailMessages() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const searchTimer = useRef(null);

  // Debounce search input 300ms
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const { data: summaryData } = useApiQuery(['email-summary'], '/email-messages/summary/');

  const { data: messagesData, isLoading, refetch } = useApiQuery(
    ['email-messages', activeTab, debouncedSearch, page],
    '/email-messages/',
    {
      status: activeTab === 'all' ? undefined : activeTab,
      search: debouncedSearch || undefined,
      page,
    }
  );

  const messages = messagesData?.results ?? messagesData ?? [];
  const count = messagesData?.count ?? messages.length;
  const hasNext = !!messagesData?.next;
  const hasPrev = !!messagesData?.previous;
  const summary = summaryData || {};

  const retryMutation = useApiMutation(
    (id) => apiClient.post(`/email-messages/${id}/retry/`),
    {
      invalidateKeys: ['email-messages', 'email-summary'],
      onSuccess: () => { toast.success('Email queued for retry'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const bounceMutation = useApiMutation(
    (id) => apiClient.post(`/email-messages/${id}/mark_bounced/`),
    {
      invalidateKeys: ['email-messages', 'email-summary'],
      onSuccess: () => { toast.success('Email marked as bounced'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
    setPage(1);
  }, []);

  const handleSearch = useCallback((e) => {
    setSearch(e.target.value);
  }, []);

  const statsCards = [
    ['Total', summary.total ?? count],
    ['Delivered', summary.sent ?? summary.delivered ?? '—'],
    ['Failed', summary.failed ?? '—'],
    ['Pending', summary.queued ?? summary.pending ?? '—'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Messages</h1>
          <p className="page-subtitle">Outbound email log, delivery tracking, and retry management</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={refetch}>↺ Refresh</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {statsCards.map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="tabs">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                className={`tab${activeTab === tab.id ? ' active' : ''}`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
                {tab.id === 'failed' && summary.failed > 0 && (
                  <span className="badge badge-danger" style={{ marginLeft: '0.375rem', fontSize: '0.68rem' }}>
                    {summary.failed}
                  </span>
                )}
                {tab.id === 'pending' && summary.queued > 0 && (
                  <span className="badge badge-warning" style={{ marginLeft: '0.375rem', fontSize: '0.68rem' }}>
                    {summary.queued}
                  </span>
                )}
              </button>
            ))}
          </div>
          <input
            className="form-input"
            style={{ width: '220px' }}
            placeholder="Search recipient or subject…"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <Spinner center />
        ) : messages.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <EmptyState
              title="No email messages"
              message={activeTab === 'all' ? 'No emails have been sent yet.' : `No ${activeTab} emails found.`}
            />
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>To</th>
                  <th>Subject</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Queued</th>
                  <th>Sent</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr
                    key={msg.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedMessage(msg)}
                  >
                    <td style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                      {msg.to_email || msg.recipient || '—'}
                    </td>
                    <td
                      style={{ fontSize: '0.8125rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={msg.subject}
                    >
                      {msg.subject || '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {msg.template_name || msg.email_type || '—'}
                    </td>
                    <td>
                      <Badge color={emailStatusColor(msg.status)}>{msg.status || '—'}</Badge>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {msg.created_at ? formatDateTime(msg.created_at) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {msg.queued_at ? formatDateTime(msg.queued_at) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {msg.sent_at ? formatDateTime(msg.sent_at) : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {msg.status === 'failed' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => retryMutation.mutate(msg.id)}
                            disabled={retryMutation.isPending}
                            title="Retry delivery"
                          >
                            ↻ Retry
                          </button>
                        )}
                        {(msg.status === 'delivered' || msg.status === 'sent' || msg.status === 'pending') && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => bounceMutation.mutate(msg.id)}
                            disabled={bounceMutation.isPending}
                            title="Mark as bounced"
                          >
                            Bounce
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage((p) => p + 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              count={count}
              page={page}
            />
          </>
        )}
      </div>

      {/* Detail Drawer */}
      <MessageDrawer
        message={selectedMessage}
        onClose={() => setSelectedMessage(null)}
        onRetry={(id) => retryMutation.mutate(id)}
        onBounce={(id) => bounceMutation.mutate(id)}
      />
    </div>
  );
}
