import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { apiClient } from '../api/client';
import { EP } from '../api/endpoints';
import { useToast } from '../hooks/useToast';
import { formatDate, formatDateTime } from '../utils/formatting';
import Modal from '../components/ui/Modal';
import Drawer from '../components/ui/Drawer';
import Badge, { statusColor } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Pagination from '../components/ui/Pagination';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'signing', label: 'Signing' },
  { key: 'approvals', label: 'Approvals' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'snoozed', label: 'Snoozed' },
];

const PRIORITY_OPTIONS = [
  { value: '', label: 'All Priorities' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const WORK_TYPE_OPTIONS = [
  { value: '', label: 'All Work Types' },
  { value: 'sign', label: 'Signing' },
  { value: 'approve', label: 'Approvals' },
  { value: 'task', label: 'Failed Tasks' },
];

function priorityDotColor(priority) {
  if (priority === 'high') return '#ef4444';
  if (priority === 'medium') return '#f59e0b';
  return '#9ca3af';
}

function uiTypeFromItem(item) {
  // item may have explicit uiType set when combining arrays
  if (item.uiType) return item.uiType;
  if (item.token) return 'sign';
  if (item.approval_role != null || item.approver != null) return 'approve';
  return 'task';
}

function itemTitle(item) {
  return item.envelope_name || item.task_name || `Task #${item.id}`;
}

function itemDescription(item) {
  const t = uiTypeFromItem(item);
  if (t === 'approve') {
    return `Approval role: ${item.role || item.approval_role || '—'}${item.assigned_to_me_as_delegate ? ' · delegated to you' : ''}`;
  }
  if (t === 'sign') return `Signing task for ${item.recipient_name || 'recipient'}`;
  if (t === 'task') return item.error_message || 'Failed task';
  return `Completed ${item.status || ''}`;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function Inbox() {
  const navigate = useNavigate();
  const toast = useToast();

  // Tab / filter state
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [priority, setPriority] = useState('');
  const [workType, setWorkType] = useState('');
  const [page, setPage] = useState(1);

  // Selection state
  const [selected, setSelected] = useState(new Set());

  // Drawer
  const [drawerItem, setDrawerItem] = useState(null);

  // Action modal state
  const [approveModal, setApproveModal] = useState({ open: false, item: null });
  const [rejectModal, setRejectModal] = useState({ open: false, item: null });
  const [delegateModal, setDelegateModal] = useState({ open: false, item: null });
  const [snoozeModal, setSnoozeModal] = useState({ open: false, key: null });

  // Form values
  const [approveComment, setApproveComment] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [delegateUserId, setDelegateUserId] = useState('');
  const [delegateReason, setDelegateReason] = useState('');

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

  // Data fetch
  const taskType = activeTab === 'all' ? '' : activeTab;
  const { data, isLoading, refetch } = useApiQuery(
    ['inbox', activeTab, search, priority, page],
    EP.INBOX,
    { task_type: taskType, search, priority, page }
  );

  // Users for delegate picker
  const { data: usersData } = useApiQuery(['users'], EP.USERS);
  const users = usersData?.results ?? usersData ?? [];

  // Flatten all inbox items into one array with uiType annotation
  const signing = (data?.signing ?? []).map((i) => ({ ...i, uiType: 'sign' }));
  const approvals = (data?.approvals ?? []).map((i) => ({ ...i, uiType: 'approve' }));
  const failedTasks = (data?.failed_tasks ?? []).map((i) => ({ ...i, uiType: 'task' }));
  const snoozedItems = (data?.snoozed ?? []).map((i) => ({ ...i, uiType: i.uiType || 'task' }));
  const completedItems = (data?.completed ?? []).map((i) => ({ ...i, uiType: 'complete' }));

  let allItems;
  if (activeTab === 'all') {
    allItems = [...signing, ...approvals, ...failedTasks];
  } else if (activeTab === 'signing') {
    allItems = signing;
  } else if (activeTab === 'approvals') {
    allItems = approvals;
  } else if (activeTab === 'tasks') {
    allItems = failedTasks;
  } else if (activeTab === 'snoozed') {
    allItems = snoozedItems;
  } else {
    allItems = [...signing, ...approvals, ...failedTasks];
  }

  // Apply work type filter
  if (workType) {
    allItems = allItems.filter((item) => uiTypeFromItem(item) === workType);
  }

  // Tab counts from API
  const counts = data?.counts ?? {};
  const signingCount = counts.signing ?? signing.length;
  const approvalsCount = counts.approvals ?? approvals.length;
  const totalActive = signingCount + approvalsCount + (counts.failed_tasks ?? failedTasks.length);

  const tabCount = (key) => {
    if (key === 'all') return totalActive;
    if (key === 'signing') return signingCount;
    if (key === 'approvals') return approvalsCount;
    if (key === 'tasks') return counts.failed_tasks ?? failedTasks.length;
    return null;
  };

  // Pagination (API-level or client-level)
  const hasNext = data?.next != null;
  const hasPrev = data?.previous != null;
  const totalCount = data?.count ?? allItems.length;

  // ─── mutations ──────────────────────────────────────────────────────────────

  const approveMutation = useApiMutation(
    ({ id, comment }) => apiClient.post(EP.APPROVAL_APPROVE(id), { notes: comment }),
    {
      invalidateKeys: ['inbox', 'approvals'],
      onSuccess: () => { toast.success('Approved'); setApproveModal({ open: false, item: null }); setApproveComment(''); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const rejectMutation = useApiMutation(
    ({ id, reason }) => apiClient.post(EP.APPROVAL_REJECT(id), { notes: reason }),
    {
      invalidateKeys: ['inbox', 'approvals'],
      onSuccess: () => { toast.success('Rejected'); setRejectModal({ open: false, item: null }); setRejectReason(''); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const delegateMutation = useApiMutation(
    ({ id, delegated_to }) => apiClient.post(EP.APPROVAL_DELEGATE(id), { user: delegated_to }),
    {
      invalidateKeys: ['inbox', 'approvals'],
      onSuccess: () => { toast.success('Delegated'); setDelegateModal({ open: false, item: null }); setDelegateUserId(''); setDelegateReason(''); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const markReadMutation = useApiMutation(
    (key) => apiClient.post(EP.INBOX, { action: 'mark_read', key }),
    {
      invalidateKeys: ['inbox'],
      onSuccess: () => { toast.success('Marked as read'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const snoozeMutation = useApiMutation(
    ({ key, minutes }) => apiClient.post(EP.INBOX, { action: 'snooze', key, minutes }),
    {
      invalidateKeys: ['inbox'],
      onSuccess: () => { toast.success('Snoozed'); setSnoozeModal({ open: false, key: null }); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const retryTaskMutation = useApiMutation(
    (id) => apiClient.post(EP.INBOX, { action: 'restart_task', id }),
    {
      invalidateKeys: ['inbox'],
      onSuccess: () => { toast.success('Task queued for retry'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const cancelTaskMutation = useApiMutation(
    (id) => apiClient.post(EP.INBOX, { action: 'cancel_task', id }),
    {
      invalidateKeys: ['inbox'],
      onSuccess: () => { toast.success('Task cancelled'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const markAllReadMutation = useApiMutation(
    () => apiClient.post(EP.INBOX, { action: 'mark_all_read' }),
    {
      invalidateKeys: ['inbox'],
      onSuccess: () => { toast.success('All inbox items marked read'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ─── bulk actions ────────────────────────────────────────────────────────────

  const selectedItems = allItems.filter((item) => selected.has(itemKey(item)));

  function itemKey(item) {
    return item.action_key || `${item.uiType}:${item.id}`;
  }

  function toggleSelect(item) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = itemKey(item);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedItems.length === allItems.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allItems.map(itemKey)));
    }
  }

  async function bulkMarkRead() {
    if (!selectedItems.length) return toast.info('Select at least one item.');
    for (const item of selectedItems) {
      if (item.action_key) {
        await apiClient.post(EP.INBOX, { action: 'mark_read', key: item.action_key });
      }
    }
    toast.success(`${selectedItems.length} item(s) marked read`);
    setSelected(new Set());
    refetch();
  }

  async function bulkSnooze(minutes, label) {
    if (!selectedItems.length) return toast.info('Select at least one item.');
    for (const item of selectedItems) {
      if (item.action_key) {
        await apiClient.post(EP.INBOX, { action: 'snooze', key: item.action_key, minutes });
      }
    }
    toast.success(`${selectedItems.length} item(s) snoozed until ${label}`);
    setSelected(new Set());
    refetch();
  }

  async function bulkCancel() {
    const tasks = selectedItems.filter((i) => i.uiType === 'task');
    if (!tasks.length) return toast.info('Select failed task rows to cancel.');
    for (const task of tasks) {
      await apiClient.post(EP.INBOX, { action: 'cancel_task', id: task.id });
    }
    toast.success(`${tasks.length} task(s) cancelled`);
    setSelected(new Set());
    refetch();
  }

  // ─── submit handlers ─────────────────────────────────────────────────────────

  function submitApprove() {
    if (!approveModal.item) return;
    approveMutation.mutate({ id: approveModal.item.id, comment: approveComment });
  }

  function submitReject() {
    if (!rejectModal.item) return;
    if (!rejectReason.trim()) { toast.error('Rejection reason is required.'); return; }
    rejectMutation.mutate({ id: rejectModal.item.id, reason: rejectReason });
  }

  function submitDelegate() {
    if (!delegateModal.item) return;
    if (!delegateUserId) { toast.error('Select a delegate.'); return; }
    delegateMutation.mutate({ id: delegateModal.item.id, delegated_to: delegateUserId });
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Inbox / My Tasks</h1>
          <p className="page-subtitle">Tasks and documents waiting for your action</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => markAllReadMutation.mutate()}>
            Mark all read
          </button>
          <button className="btn btn-primary" onClick={() => refetch()}>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats mini-row */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Pending Signatures</div>
          <div className="stat-value">{counts.signing ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approvals</div>
          <div className="stat-value">{counts.approvals ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Failed Tasks</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{counts.failed_tasks ?? '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed Today</div>
          <div className="stat-value">{counts.completed_today ?? '—'}</div>
        </div>
      </div>

      {/* Tabs + toolbar card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-header" style={{ paddingBottom: 0, borderBottom: 'none', flexWrap: 'wrap', gap: '0.5rem' }}>
          {/* Tabs */}
          <div className="tabs">
            {TABS.map((tab) => {
              const cnt = tabCount(tab.key);
              return (
                <button
                  key={tab.key}
                  className={`tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => { setActiveTab(tab.key); setPage(1); setSelected(new Set()); }}
                >
                  {tab.label}
                  {cnt != null && (
                    <Badge color={activeTab === tab.key ? 'primary' : 'secondary'} style={{ marginLeft: '4px' }}>
                      {cnt}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>

          {/* Toolbar */}
          <div className="flex gap-2" style={{ marginLeft: 'auto', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
            <input
              className="form-input"
              placeholder="Search tasks..."
              value={searchInput}
              onChange={handleSearchChange}
              style={{ width: '200px' }}
            />
            <select
              className="form-input"
              value={workType}
              onChange={(e) => { setWorkType(e.target.value); setPage(1); }}
              style={{ width: '150px' }}
            >
              {WORK_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="form-input"
              value={priority}
              onChange={(e) => { setPriority(e.target.value); setPage(1); }}
              style={{ width: '140px' }}
            >
              {PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Bulk toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', padding: '0 1rem 0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <input
              type="checkbox"
              checked={allItems.length > 0 && selectedItems.length === allItems.length}
              ref={(el) => { if (el) el.indeterminate = selectedItems.length > 0 && selectedItems.length < allItems.length; }}
              onChange={toggleSelectAll}
            />
            Select visible
          </label>
          <Badge color="secondary">{selected.size} selected</Badge>
          {selected.size > 0 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={bulkMarkRead}>Mark read</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSnoozeModal({ open: true, key: '__bulk__' })}>Snooze</button>
              <button className="btn btn-ghost btn-sm" onClick={bulkCancel}>Cancel tasks</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
            </>
          )}
        </div>
      </div>

      {/* Item list */}
      {isLoading ? (
        <Spinner center />
      ) : allItems.length === 0 ? (
        <EmptyState title="All caught up" message="No inbox items match this view." />
      ) : (
        <div className="flex flex-col gap-3">
          {allItems.map((item, idx) => {
            const type = uiTypeFromItem(item);
            const title = itemTitle(item);
            const desc = itemDescription(item);
            const due = item.due_at ? formatDate(item.due_at) : 'No due date';
            const isOverdue = item.overdue || (item.due_at && new Date(item.due_at) < new Date());
            const typeLabel = type === 'sign' ? 'Sign Required' : type === 'approve' ? 'Approval Needed' : type === 'task' ? 'Failed Task' : 'Completed';
            const typeColor = type === 'sign' ? 'primary' : type === 'approve' ? 'warning' : type === 'task' ? 'danger' : 'success';
            const priorityColor = item.priority === 'high' ? 'danger' : item.priority === 'medium' ? 'warning' : 'success';
            const key = itemKey(item);
            const isSelected = selected.has(key);

            return (
              <div
                key={key}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderLeft: item.unread ? '4px solid var(--primary)' : undefined,
                }}
                onClick={() => setDrawerItem(item)}
              >
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', padding: '1.25rem' }}>
                  {/* Checkbox */}
                  <label style={{ paddingTop: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(item)}
                    />
                  </label>

                  {/* Priority dot */}
                  <div style={{ paddingTop: '4px' }}>
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: priorityDotColor(item.priority),
                        flexShrink: 0,
                      }}
                    />
                  </div>

                  {/* Avatar */}
                  <div style={{ marginTop: '2px' }}>
                    <Avatar name={type === 'sign' ? (item.recipient_name || 'Signer') : 'HanMak'} size={40} />
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex" style={{ gap: '0.5rem', marginBottom: '0.375rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <Badge color={typeColor}>{typeLabel}</Badge>
                      {item.priority && type !== 'complete' && (
                        <Badge color={priorityColor}>{item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} Priority</Badge>
                      )}
                      {isOverdue && <Badge color="danger">Overdue</Badge>}
                      {item.unread && <Badge color="primary">Unread</Badge>}
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                        {item.action_key || `#${item.id}`}
                      </span>
                    </div>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem', fontSize: '0.9375rem' }}>
                      {title}
                    </div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                      {desc}
                    </div>
                    {(item.fields_remaining != null || item.remaining_fields != null) && (
                      <div style={{ fontSize: '0.75rem', marginBottom: '0.375rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: 4,
                            background: 'rgba(79, 142, 247, 0.1)',
                            color: 'var(--primary)',
                            fontWeight: 600,
                          }}
                        >
                          {item.fields_remaining ?? item.remaining_fields} field{(item.fields_remaining ?? item.remaining_fields) !== 1 ? 's' : ''} remaining
                        </span>
                      </div>
                    )}
                    <div className="flex" style={{ gap: '1.5rem', fontSize: '0.8rem', color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                      <span>{formatDateTime(item.created_at)}</span>
                      <span style={isOverdue ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
                        Due: {due}
                      </span>
                      {type === 'complete' && item.completed_at && (
                        <span>Completed: {formatDate(item.completed_at)}</span>
                      )}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2" style={{ flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {type === 'sign' && (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ whiteSpace: 'nowrap' }}
                        onClick={() => item.token && window.open(`${window.location.origin}${window.location.pathname}?token=${encodeURIComponent(item.token)}`, '_blank')}
                      >
                        Sign Now
                      </button>
                    )}
                    {type === 'approve' && (
                      <>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#10b981', color: '#fff', border: 'none', whiteSpace: 'nowrap' }}
                          onClick={() => { setApproveModal({ open: true, item }); setApproveComment(''); }}
                        >
                          Approve
                        </button>
                        <button
                          className="btn btn-danger btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => { setRejectModal({ open: true, item }); setRejectReason(''); }}
                        >
                          Reject
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => { setDelegateModal({ open: true, item }); setDelegateUserId(''); setDelegateReason(''); }}
                        >
                          Delegate
                        </button>
                      </>
                    )}
                    {type === 'task' && (
                      <>
                        <button
                          className="btn btn-primary btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => retryTaskMutation.mutate(item.id)}
                        >
                          Retry
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => cancelTaskMutation.mutate(item.id)}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {type !== 'complete' && (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => markReadMutation.mutate(item.action_key || key)}
                        >
                          Mark Read
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ whiteSpace: 'nowrap' }}
                          onClick={() => setSnoozeModal({ open: true, key: item.action_key || key })}
                        >
                          Snooze
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {(hasNext || hasPrev) && (
        <Pagination
          hasNext={hasNext}
          hasPrev={hasPrev}
          onNext={() => setPage((p) => p + 1)}
          onPrev={() => setPage((p) => Math.max(1, p - 1))}
          count={totalCount}
        />
      )}

      {/* ─── Modals ─────────────────────────────────────────────────── */}

      {/* Approve modal */}
      <Modal
        open={approveModal.open}
        onClose={() => setApproveModal({ open: false, item: null })}
        title="Approve Document"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setApproveModal({ open: false, item: null })}>Cancel</button>
            <button
              className="btn btn-sm"
              style={{ background: '#10b981', color: '#fff', border: 'none' }}
              onClick={submitApprove}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? <Spinner /> : 'Confirm Approval'}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          You are about to approve this document. This will send it to the next workflow stage.
        </p>
        <div className="form-group">
          <label className="form-label">Add a comment (optional)</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Approved. Looks good to proceed."
            value={approveComment}
            onChange={(e) => setApproveComment(e.target.value)}
          />
        </div>
      </Modal>

      {/* Reject modal */}
      <Modal
        open={rejectModal.open}
        onClose={() => setRejectModal({ open: false, item: null })}
        title="Reject Approval"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRejectModal({ open: false, item: null })}>Cancel</button>
            <button
              className="btn btn-danger"
              onClick={submitReject}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? <Spinner /> : 'Reject'}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Reject this approval request and stop it from proceeding.
        </p>
        <div className="form-group">
          <label className="form-label">Reason *</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Delegate modal */}
      <Modal
        open={delegateModal.open}
        onClose={() => setDelegateModal({ open: false, item: null })}
        title="Delegate Task"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setDelegateModal({ open: false, item: null })}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={submitDelegate}
              disabled={delegateMutation.isPending}
            >
              {delegateMutation.isPending ? <Spinner /> : 'Delegate'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Delegate to</label>
          <select
            className="form-input"
            value={delegateUserId}
            onChange={(e) => setDelegateUserId(e.target.value)}
          >
            <option value="">Select team member...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.username || u.email}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="Out of office / Not my area..."
            value={delegateReason}
            onChange={(e) => setDelegateReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Snooze modal */}
      <Modal
        open={snoozeModal.open}
        onClose={() => setSnoozeModal({ open: false, key: null })}
        title="Snooze Task"
      >
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          When should this task reappear in your inbox?
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[
            ['1 hour', 60],
            ['3 hours', 180],
            ['Tomorrow 9am', 1440],
            ['Monday 9am', 4320],
            ['Next week', 10080],
          ].map(([label, minutes]) => (
            <button
              key={label}
              className="btn btn-ghost"
              style={{ justifyContent: 'flex-start' }}
              onClick={() => {
                if (snoozeModal.key === '__bulk__') {
                  bulkSnooze(minutes, label);
                  setSnoozeModal({ open: false, key: null });
                } else {
                  snoozeMutation.mutate({ key: snoozeModal.key, minutes });
                }
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </Modal>

      {/* Item detail drawer */}
      <Drawer
        open={!!drawerItem}
        onClose={() => setDrawerItem(null)}
        title={drawerItem ? itemTitle(drawerItem) : ''}
      >
        {drawerItem && (
          <div className="flex flex-col gap-4">
            {/* Badges */}
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <Badge color={uiTypeFromItem(drawerItem) === 'sign' ? 'primary' : uiTypeFromItem(drawerItem) === 'approve' ? 'warning' : 'danger'}>
                {uiTypeFromItem(drawerItem) === 'sign' ? 'Sign Required' : uiTypeFromItem(drawerItem) === 'approve' ? 'Approval Needed' : 'Failed Task'}
              </Badge>
              {drawerItem.priority && (
                <Badge color={drawerItem.priority === 'high' ? 'danger' : drawerItem.priority === 'medium' ? 'warning' : 'success'}>
                  {drawerItem.priority.charAt(0).toUpperCase() + drawerItem.priority.slice(1)} Priority
                </Badge>
              )}
              {drawerItem.overdue && <Badge color="danger">Overdue</Badge>}
            </div>

            {/* Detail rows */}
            {[
              ['Subject', itemTitle(drawerItem)],
              ['Description', itemDescription(drawerItem)],
              ['Created', formatDateTime(drawerItem.created_at)],
              ['Due', drawerItem.due_at ? formatDate(drawerItem.due_at) : 'No due date'],
              ['Status', drawerItem.status || '—'],
              ['Priority', drawerItem.priority || '—'],
              ['Envelope', drawerItem.envelope_name || (drawerItem.envelope ? `Envelope #${drawerItem.envelope}` : '—')],
            ].map(([label, value]) => (
              <div key={label} className="detail-row" style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ fontSize: '0.875rem' }}>{value}</span>
              </div>
            ))}

            {/* Drawer actions */}
            <div className="flex flex-col gap-2" style={{ marginTop: '1rem' }}>
              {uiTypeFromItem(drawerItem) === 'sign' && drawerItem.token && (
                <button
                  className="btn btn-primary"
                  onClick={() => window.open(`${window.location.origin}${window.location.pathname}?token=${encodeURIComponent(drawerItem.token)}`, '_blank')}
                >
                  Sign Now
                </button>
              )}
              {uiTypeFromItem(drawerItem) === 'approve' && (
                <>
                  <button
                    className="btn btn-sm"
                    style={{ background: '#10b981', color: '#fff', border: 'none' }}
                    onClick={() => { setDrawerItem(null); setApproveModal({ open: true, item: drawerItem }); setApproveComment(''); }}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => { setDrawerItem(null); setRejectModal({ open: true, item: drawerItem }); setRejectReason(''); }}
                  >
                    Reject
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setDrawerItem(null); setDelegateModal({ open: true, item: drawerItem }); setDelegateUserId(''); }}
                  >
                    Delegate
                  </button>
                </>
              )}
              {uiTypeFromItem(drawerItem) === 'task' && (
                <>
                  <button className="btn btn-primary btn-sm" onClick={() => { retryTaskMutation.mutate(drawerItem.id); setDrawerItem(null); }}>Retry</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { cancelTaskMutation.mutate(drawerItem.id); setDrawerItem(null); }}>Cancel</button>
                </>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  const k = drawerItem.action_key || itemKey(drawerItem);
                  markReadMutation.mutate(k);
                  setDrawerItem(null);
                }}
              >
                Mark Read
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
