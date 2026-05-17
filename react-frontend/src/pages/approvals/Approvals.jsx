import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'delegated', label: 'Delegated' },
  { key: 'all', label: 'All' },
];

const STATUS_COLORS = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  changes_requested: 'primary',
  delegated: 'secondary',
};

// ─── Main component ────────────────────────────────────────────────────────────

export default function Approvals() {
  const navigate = useNavigate();
  const toast = useToast();

  // Filter state
  const [activeTab, setActiveTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);

  // Action modal state
  const [actionModal, setActionModal] = useState({ open: false, type: '', item: null });
  const [comment, setComment] = useState('');
  const [delegateUserId, setDelegateUserId] = useState('');

  // Confirm delete dialog
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null });

  // Detail modal
  const [detailItem, setDetailItem] = useState(null);

  // Debounce search
  const debounceRef = useRef(null);
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  }, []);

  // Main approvals data
  const { data, isLoading, refetch } = useApiQuery(
    ['approvals', activeTab, search, page],
    EP.APPROVALS,
    { status: activeTab === 'all' ? '' : activeTab, search, page }
  );

  // Sidebar analytics
  const { data: analyticsRaw } = useApiQuery(
    ['analytics-approval'],
    EP.ANALYTICS_APPROVAL
  );

  // Users for delegate picker
  const { data: usersData } = useApiQuery(['users'], EP.USERS);
  const users = usersData?.results ?? usersData ?? [];

  const approvals = data?.results ?? [];
  const hasNext = data?.next != null;
  const hasPrev = data?.previous != null;
  const totalCount = data?.count ?? approvals.length;

  // Analytics sidebar processing
  const bottlenecks = Array.isArray(analyticsRaw) ? analyticsRaw : [];
  const analyticsStatusTotals = bottlenecks.reduce((acc, row) => {
    const status = row.status || 'unknown';
    acc[status] = (acc[status] || 0) + Number(row.count || 0);
    return acc;
  }, {});
  const analyticsTotal = Object.values(analyticsStatusTotals).reduce((sum, n) => sum + n, 0) || 1;
  const analyticsRows = [
    ['Approved', analyticsStatusTotals.approved || 0, 'success'],
    ['Rejected', analyticsStatusTotals.rejected || 0, 'danger'],
    ['Changes Requested', analyticsStatusTotals.changes_requested || 0, 'primary'],
    ['Delegated', analyticsStatusTotals.delegated || 0, 'secondary'],
    ['Pending', analyticsStatusTotals.pending || 0, 'warning'],
  ].filter(([, count]) => count > 0);

  // Approver load (pending items grouped by approver username)
  const pendingApprovals = activeTab === 'pending' ? approvals : [];
  const approverLoad = pendingApprovals.reduce((acc, row) => {
    const key = row.approver_username || row.approver || 'Unassigned';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const approverLoadRows = Object.entries(approverLoad)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const LOAD_COLORS = ['warning', 'danger', 'primary', 'secondary', 'success', 'secondary'];

  // ─── mutations ──────────────────────────────────────────────────────────────

  const approveMutation = useApiMutation(
    ({ id, notes }) => apiClient.post(EP.APPROVAL_APPROVE(id), { notes }),
    {
      invalidateKeys: ['approvals', 'inbox'],
      onSuccess: () => {
        toast.success('Approved!');
        closeActionModal();
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const rejectMutation = useApiMutation(
    ({ id, notes }) => apiClient.post(EP.APPROVAL_REJECT(id), { notes }),
    {
      invalidateKeys: ['approvals', 'inbox'],
      onSuccess: () => {
        toast.success('Rejected');
        closeActionModal();
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const delegateMutation = useApiMutation(
    ({ id, delegated_to }) => apiClient.post(EP.APPROVAL_DELEGATE(id), { user: delegated_to }),
    {
      invalidateKeys: ['approvals', 'inbox'],
      onSuccess: () => {
        toast.success('Approval delegated');
        closeActionModal();
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const requestChangesMutation = useApiMutation(
    ({ id, notes }) => apiClient.post(`${EP.APPROVAL(id)}request-changes/`, { notes }),
    {
      invalidateKeys: ['approvals', 'inbox'],
      onSuccess: () => {
        toast.success('Changes requested');
        closeActionModal();
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ─── helpers ─────────────────────────────────────────────────────────────────

  function openModal(type, item) {
    setActionModal({ open: true, type, item });
    setComment('');
    setDelegateUserId('');
  }

  function closeActionModal() {
    setActionModal({ open: false, type: '', item: null });
    setComment('');
    setDelegateUserId('');
  }

  function submitAction() {
    const id = actionModal.item?.id;
    if (!id) return;

    if (actionModal.type === 'approve') {
      approveMutation.mutate({ id, notes: comment });
    } else if (actionModal.type === 'reject') {
      if (!comment.trim()) { toast.error('Rejection reason is required.'); return; }
      rejectMutation.mutate({ id, notes: comment });
    } else if (actionModal.type === 'delegate') {
      if (!delegateUserId) { toast.error('Select a delegate.'); return; }
      delegateMutation.mutate({ id, delegated_to: delegateUserId });
    } else if (actionModal.type === 'request_changes') {
      if (!comment.trim()) { toast.error('Changes description is required.'); return; }
      requestChangesMutation.mutate({ id, notes: comment });
    }
  }

  const isPending = approveMutation.isPending || rejectMutation.isPending || delegateMutation.isPending || requestChangesMutation.isPending;

  function modalTitle() {
    if (actionModal.type === 'approve') return 'Approve';
    if (actionModal.type === 'reject') return 'Reject';
    if (actionModal.type === 'delegate') return 'Delegate Approval';
    if (actionModal.type === 'request_changes') return 'Request Changes';
    return '';
  }

  function modalActionLabel() {
    if (actionModal.type === 'approve') return 'Confirm Approval';
    if (actionModal.type === 'reject') return 'Reject';
    if (actionModal.type === 'delegate') return 'Delegate';
    if (actionModal.type === 'request_changes') return 'Request Changes';
    return 'Submit';
  }

  function modalButtonClass() {
    if (actionModal.type === 'reject') return 'btn btn-danger';
    if (actionModal.type === 'approve') return 'btn';
    return 'btn btn-primary';
  }

  function modalButtonStyle() {
    if (actionModal.type === 'approve') return { background: '#10b981', color: '#fff', border: 'none' };
    return {};
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Approval Queue</h1>
          <p className="page-subtitle">Documents awaiting approval decisions across your organization</p>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 5, marginBottom: '1.5rem' }}>
        {[
          { label: 'Pending', key: 'pending', color: '#f59e0b' },
          { label: 'Approved', key: 'approved', color: '#10b981' },
          { label: 'Rejected', key: 'rejected', color: '#ef4444' },
          { label: 'Changes Requested', key: 'changes_requested', color: '#4f8ef7' },
          { label: 'Delegated', key: 'delegated', color: '#8b5cf6' },
        ].map(({ label, key, color }) => (
          <div key={key} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color }}>
              {analyticsStatusTotals[key] ?? '—'}
            </div>
          </div>
        ))}
      </div>

      {/* 2-column: main + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Main table */}
        <div>
          <div className="card">
            {/* Tabs + search toolbar */}
            <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="tabs">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`tab${activeTab === tab.key ? ' active' : ''}`}
                    onClick={() => { setActiveTab(tab.key); setPage(1); }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <input
                  className="form-input"
                  placeholder="Search approvals..."
                  value={searchInput}
                  onChange={handleSearchChange}
                  style={{ width: '220px' }}
                />
              </div>
            </div>

            {/* Table */}
            {isLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner center /></div>
            ) : approvals.length === 0 ? (
              <EmptyState
                title={`No ${activeTab === 'all' ? '' : activeTab} approvals`}
                message="No approvals match the current filter."
              />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Envelope / Document</th>
                    <th>Requester</th>
                    <th>Assignee</th>
                    <th>Status</th>
                    <th>Requested</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((approval) => {
                    const badgeColor = STATUS_COLORS[approval.status] || 'secondary';
                    return (
                      <tr key={approval.id}>
                        {/* Envelope / Document */}
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                            {approval.envelope
                              ? `Envelope #${approval.envelope}`
                              : approval.envelope_name || '—'}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {approval.approval_role || '—'}
                          </div>
                        </td>
                        {/* Requester */}
                        <td style={{ fontSize: '0.8125rem' }}>
                          {approval.requester_username || approval.requester || '—'}
                        </td>
                        {/* Assignee (approver) */}
                        <td style={{ fontSize: '0.8125rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Avatar name={approval.approver_username || approval.approver || '?'} size={24} />
                            {approval.approver_username || approval.approver || '—'}
                          </div>
                          {approval.delegated_to && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Delegated to: {approval.delegated_to}
                            </div>
                          )}
                        </td>
                        {/* Status */}
                        <td>
                          <Badge color={badgeColor}>
                            {String(approval.status || '').replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        {/* Requested date */}
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDate(approval.created_at)}
                        </td>
                        {/* Actions */}
                        <td>
                          {approval.status === 'pending' ? (
                            <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                              <button
                                className="btn btn-sm"
                                style={{ background: '#10b981', color: '#fff', border: 'none' }}
                                title="Approve"
                                onClick={() => openModal('approve', approval)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Reject"
                                onClick={() => openModal('reject', approval)}
                              >
                                Reject
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Request Changes"
                                onClick={() => openModal('request_changes', approval)}
                              >
                                Changes
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Delegate"
                                onClick={() => openModal('delegate', approval)}
                              >
                                Delegate
                              </button>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="View details"
                                onClick={() => setDetailItem(approval)}
                              >
                                View
                              </button>
                            </div>
                          ) : (
                            <div className="flex gap-1" style={{ alignItems: 'center' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {approval.decided_at ? formatDate(approval.decided_at) : '—'}
                              </span>
                              <button
                                className="btn btn-ghost btn-sm"
                                title="View details"
                                onClick={() => setDetailItem(approval)}
                              >
                                View
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Pagination */}
            {(hasNext || hasPrev) && (
              <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid var(--border)' }}>
                <Pagination
                  hasNext={hasNext}
                  hasPrev={hasPrev}
                  onNext={() => setPage((p) => p + 1)}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  count={totalCount}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">

          {/* Analytics card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Approval Analytics</div>
            {analyticsRows.length > 0 ? (
              <div className="flex flex-col gap-3">
                {analyticsRows.map(([label, count, color]) => {
                  const pct = Math.round((count / analyticsTotal) * 100);
                  return (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                        <span>{label}</span>
                        <span style={{ fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: color === 'success' ? '#10b981' : color === 'danger' ? '#ef4444' : color === 'primary' ? '#4f8ef7' : color === 'warning' ? '#f59e0b' : '#8b5cf6',
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <EmptyState title="No analytics data" message="Analytics will appear as approvals are processed." />
            )}
          </div>

          {/* Approver load card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>By Approver Load</div>
            {approverLoadRows.length > 0 ? (
              <div>
                {approverLoadRows.map(([name, count], idx) => (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      padding: '0.5rem 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <Avatar name={name} size={30} />
                    <span style={{ flex: 1, fontSize: '0.8125rem' }}>{name}</span>
                    <Badge color={LOAD_COLORS[idx % LOAD_COLORS.length]}>{count} pending</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No pending approver load" message="Load data visible when viewing pending approvals." />
            )}
          </div>

          {/* Avg wait / bottleneck summary */}
          {bottlenecks.length > 0 && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Bottleneck Stages</div>
              <div className="flex flex-col gap-2">
                {bottlenecks.slice(0, 5).map((row, idx) => {
                  const stage = row.approval_role || `Stage ${idx + 1}`;
                  const avgWait = row.avg_wait_hours != null
                    ? `${Number(row.avg_wait_hours).toFixed(1)}h avg`
                    : null;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.8125rem',
                        padding: '0.375rem 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span>{stage}</span>
                      <div className="flex gap-2" style={{ alignItems: 'center' }}>
                        {avgWait && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{avgWait}</span>
                        )}
                        <Badge color={Number(row.count || 0) > 5 ? 'danger' : 'warning'}>
                          {row.count ?? 0}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── Action modal ────────────────────────────────────────────────── */}
      <Modal
        open={actionModal.open}
        onClose={closeActionModal}
        title={modalTitle()}
        footer={
          <>
            <button className="btn btn-ghost" onClick={closeActionModal}>Cancel</button>
            <button
              className={modalButtonClass()}
              style={modalButtonStyle()}
              onClick={submitAction}
              disabled={isPending}
            >
              {isPending ? <Spinner /> : modalActionLabel()}
            </button>
          </>
        }
      >
        {actionModal.type === 'delegate' ? (
          <>
            <div className="form-group">
              <label className="form-label">Delegate To *</label>
              <select
                className="form-input"
                value={delegateUserId}
                onChange={(e) => setDelegateUserId(e.target.value)}
              >
                <option value="">Select user...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.username} &middot; {u.email || ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Message</label>
              <textarea
                className="form-input"
                rows={2}
                placeholder="Please review on my behalf."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          </>
        ) : actionModal.type === 'approve' ? (
          <div className="form-group">
            <label className="form-label">Comment (optional)</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Approved. Please proceed."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        ) : actionModal.type === 'reject' ? (
          <div className="form-group">
            <label className="form-label">Reason *</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Please revise section 4.2 and resubmit…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        ) : actionModal.type === 'request_changes' ? (
          <div className="form-group">
            <label className="form-label">Changes Required *</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Please update the payment terms in section 3…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
        ) : null}
      </Modal>

      {/* ─── Detail modal ────────────────────────────────────────────────── */}
      <Modal
        open={!!detailItem}
        onClose={() => setDetailItem(null)}
        title="Approval Detail"
        size="lg"
        footer={
          <>
            {detailItem?.status === 'pending' && (
              <button
                className="btn btn-sm"
                style={{ background: '#10b981', color: '#fff', border: 'none' }}
                onClick={() => { setDetailItem(null); openModal('approve', detailItem); }}
              >
                Approve
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setDetailItem(null)}>Close</button>
          </>
        }
      >
        {detailItem && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              {[
                ['Approval ID', `#${detailItem.id}`],
                ['Status', String(detailItem.status || '-').replace(/_/g, ' ')],
                ['Role', detailItem.approval_role || '-'],
                ['Approver', detailItem.approver_username || detailItem.approver || '-'],
                ['Delegated To', detailItem.delegated_to || '-'],
                ['Created', detailItem.created_at ? formatDateTime(detailItem.created_at) : '-'],
                ['Due', detailItem.due_at ? formatDate(detailItem.due_at) : '-'],
                ['Decided', detailItem.decided_at ? formatDate(detailItem.decided_at) : '-'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ padding: '0.625rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}
                >
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{value}</div>
                </div>
              ))}
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <div
                className="form-input"
                style={{ height: 'auto', minHeight: '64px', background: 'var(--bg-secondary)', whiteSpace: 'pre-wrap' }}
              >
                {detailItem.notes || 'No notes recorded.'}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
