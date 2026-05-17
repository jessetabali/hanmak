import { useState } from 'react';
import { useApiQuery } from '../../hooks/useApi';
import { EP } from '../../api/endpoints';
import { formatDate } from '../../utils/formatting';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';

export default function Signing() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useApiQuery(
    ['signing-sessions', search, status, page],
    EP.SIGNING_SESSIONS,
    { search: search || undefined, status: status || undefined, page },
  );

  const sessions = data?.results || (Array.isArray(data) ? data : []);
  const count = data?.count ?? sessions.length;
  const pageSize = 20;
  const totalPages = Math.ceil(count / pageSize);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Signing Sessions</h1>
          <p className="page-subtitle">
            Active and recent signing sessions — sessions are created automatically when envelopes are sent
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-input"
          type="search"
          placeholder="Search by token or email…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ maxWidth: 280, fontSize: 13 }}
        />
        <select
          className="form-input"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          style={{ maxWidth: 180, fontSize: 13 }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="viewed">Viewed</option>
          <option value="signed">Signed</option>
          <option value="completed">Completed</option>
          <option value="declined">Declined</option>
          <option value="expired">Expired</option>
        </select>
        {(search || status) && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { setSearch(''); setStatus(''); setPage(1); }}
          >
            ✕ Clear filters
          </button>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-muted)' }}>
          {count} session{count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      {isLoading ? (
        <Spinner center />
      ) : sessions.length === 0 ? (
        <EmptyState
          title="No signing sessions"
          message={
            search || status
              ? 'No sessions match your filters. Try adjusting the search.'
              : 'Signing sessions appear here when envelopes are sent to recipients.'
          }
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Token</th>
                <th>Envelope</th>
                <th>Recipient</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <SessionRow key={session.id} session={session} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ marginTop: 16 }}>
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

// ─── SessionRow ───────────────────────────────────────────────────────────────

function SessionRow({ session }) {
  const token = session.token || session.signing_token || '';
  const truncatedToken = token.length > 16 ? `${token.slice(0, 8)}…${token.slice(-6)}` : token;
  const envelopeName = session.envelope_name || session.envelope_subject || (session.envelope ? `Envelope #${session.envelope}` : '—');
  const recipientEmail = session.recipient_email || session.signer_email || session.email || '—';
  const sessionStatus = session.status || 'pending';

  const handleOpenSigner = () => {
    if (!token) return;
    window.open(`/sign/${token}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <tr>
      <td>
        <code
          style={{
            fontSize: '0.75rem',
            background: 'var(--bg-secondary)',
            padding: '2px 6px',
            borderRadius: 4,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            display: 'inline-block',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            verticalAlign: 'bottom',
          }}
          title={token}
        >
          {truncatedToken || '—'}
        </code>
      </td>
      <td>
        <div
          style={{
            maxWidth: 200,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 13,
            fontWeight: 500,
          }}
          title={envelopeName}
        >
          {envelopeName}
        </div>
        {session.envelope && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            #{session.envelope}
          </div>
        )}
      </td>
      <td style={{ fontSize: 13 }}>
        <div style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={recipientEmail}>
          {recipientEmail}
        </div>
        {session.recipient_name && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{session.recipient_name}</div>
        )}
      </td>
      <td>
        <Badge color={statusColor(sessionStatus)}>
          {sessionStatus.replace(/_/g, ' ')}
        </Badge>
      </td>
      <td style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
        {formatDate(session.created_at)}
        {session.expires_at && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Expires {formatDate(session.expires_at)}
          </div>
        )}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {token && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleOpenSigner}
              title="Open signer page in new tab"
              style={{ whiteSpace: 'nowrap', fontSize: 11 }}
            >
              ✍ Open Signer
            </button>
          )}
          {token && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const url = `${window.location.origin}/sign/${token}`;
                navigator.clipboard?.writeText(url).then(() => {}).catch(() => {});
              }}
              title="Copy signing link"
              style={{ fontSize: 11 }}
            >
              📋 Copy Link
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
