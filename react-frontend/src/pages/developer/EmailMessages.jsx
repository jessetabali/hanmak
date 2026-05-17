import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';

const STATUS_TABS = [
  { id: 'all', label: 'All' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'failed', label: 'Failed' },
  { id: 'pending', label: 'Pending' },
];

function statusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'delivered' || s === 'sent') return 'success';
  if (s === 'failed' || s === 'bounced') return 'danger';
  if (s === 'pending' || s === 'queued') return 'warning';
  return 'secondary';
}

export default function EmailMessages() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useApiQuery(
    ['email-messages', activeTab, search, page],
    '/email-messages/',
    { status: activeTab === 'all' ? '' : activeTab, search, page }
  );
  const messages = data?.results ?? data ?? [];
  const hasNext = !!data?.next;
  const hasPrev = !!data?.previous;
  const count = data?.count ?? messages.length;

  const { data: summaryData } = useApiQuery(['email-summary'], '/email-messages/summary/');
  const summary = summaryData || {};

  const retryMutation = useApiMutation(
    (id) => apiClient.post(`/email-messages/${id}/retry/`),
    {
      invalidateKeys: ['email-messages'],
      onSuccess: () => { toast.success('Email queued for retry'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const bounceMutation = useApiMutation(
    (id) => apiClient.post(`/email-messages/${id}/mark_bounced/`),
    {
      invalidateKeys: ['email-messages'],
      onSuccess: () => { toast.success('Email marked as bounced'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const handleSearch = (e) => {
    setSearch(e.target.value);
    setPage(1);
  };

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Messages</h1>
          <p className="page-subtitle">Outbound email log, delivery status, and retry management</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ '--cols': 5, marginBottom: '1.5rem' }}>
        {[
          ['Total', summary.total ?? count],
          ['Delivered', summary.sent ?? summary.delivered ?? '—'],
          ['Failed', summary.failed ?? '—'],
          ['Pending', summary.queued ?? summary.pending ?? '—'],
          ['Bounced', summary.bounced ?? '—'],
        ].map(([label, value]) => (
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
              </button>
            ))}
          </div>
          <input
            className="form-input"
            style={{ width: '200px' }}
            placeholder="Search recipient or subject…"
            value={search}
            onChange={handleSearch}
          />
        </div>

        {/* Table */}
        {messages.length === 0 ? (
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
                  <th>Status</th>
                  <th>Template</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id}>
                    <td style={{ fontWeight: 500 }}>{msg.to_email || msg.recipient || '—'}</td>
                    <td style={{ fontSize: '0.8125rem' }}>{msg.subject || '—'}</td>
                    <td>
                      <Badge color={statusColor(msg.status)}>{msg.status || '—'}</Badge>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {msg.template_name || msg.email_type || '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {msg.created_at ? formatDateTime(msg.created_at) : '—'}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        {msg.status === 'failed' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => retryMutation.mutate(msg.id)}
                            disabled={retryMutation.isPending}
                            title="Retry"
                          >
                            ↻ Retry
                          </button>
                        )}
                        {(msg.status === 'delivered' || msg.status === 'sent') && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => bounceMutation.mutate(msg.id)}
                            disabled={bounceMutation.isPending}
                            title="Mark bounced"
                          >
                            Mark Bounced
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
              onPrev={() => setPage((p) => p - 1)}
              count={count}
            />
          </>
        )}
      </div>
    </div>
  );
}
