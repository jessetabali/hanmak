import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

function titleCase(str) {
  return (str || '').split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'viewed', label: 'Viewed' },
  { value: 'partially_signed', label: 'Partially Signed' },
  { value: 'completed', label: 'Completed' },
  { value: 'declined', label: 'Declined' },
  { value: 'voided', label: 'Voided' },
  { value: 'expired', label: 'Expired' },
];

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Date: Newest' },
  { value: 'created_at', label: 'Date: Oldest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'due_date', label: 'Due Date' },
];

export default function EnvelopeList() {
  const navigate = useNavigate();
  const toast = useToast();

  // Filters & pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('-created_at');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState(new Set());

  // Drawer for viewing single envelope
  const [drawerEnvelope, setDrawerEnvelope] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null); // { name, pages[] }

  // Fetch envelope-documents when drawer is open
  const { data: envelopeDocsData } = useApiQuery(
    ['envelope-documents', drawerEnvelope?.id],
    EP.ENVELOPE_DOCUMENTS,
    { envelope: drawerEnvelope?.id, page_size: 20 },
    { enabled: !!drawerEnvelope?.id }
  );
  const envelopeDocs = envelopeDocsData?.results ?? [];

  // Create envelope modal
  const [createModal, setCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createTemplateId, setCreateTemplateId] = useState('');
  const [createRecipients, setCreateRecipients] = useState([{ name: '', email: '' }]);

  // Void modal
  const [voidModal, setVoidModal] = useState({ open: false, id: null });
  const [voidReason, setVoidReason] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' });

  // Bulk confirm
  const [bulkConfirm, setBulkConfirm] = useState({ open: false, action: '', label: '' });

  // Debounce timer
  const debounceRef = useRef(null);

  // ---- Queries ----
  const { data: summaryData } = useApiQuery(
    ['envelopes-summary'],
    EP.ENVELOPE_SUMMARY
  );

  const { data, isLoading, refetch } = useApiQuery(
    ['envelopes', search, status, sort, dueFrom, dueTo, page],
    EP.ENVELOPES,
    { search, status, ordering: sort, due_date_after: dueFrom, due_date_before: dueTo, page }
  );

  const { data: templatesData } = useApiQuery(
    ['templates-picker'],
    EP.TEMPLATES,
    { page_size: 50 }
  );

  const envelopes = data?.results ?? [];
  const count = data?.count ?? 0;
  const hasNext = Boolean(data?.next);
  const hasPrev = Boolean(data?.previous);
  const templates = templatesData?.results ?? [];

  // ---- Stats ----
  const stats = summaryData || {};
  const total = stats.total ?? 0;
  const draftCount = stats.draft ?? 0;
  const inProgress = (stats.sent ?? 0) + (stats.viewed ?? 0) + (stats.partially_signed ?? 0);
  const completedCount = stats.completed ?? 0;
  const voidedExpired = (stats.voided ?? 0) + (stats.expired ?? 0);

  // ---- Mutations ----
  const sendMutation = useApiMutation(
    (id) => apiClient.post(EP.ENVELOPE_SEND(id), {}),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: () => toast.success('Envelope sent successfully'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const voidMutation = useApiMutation(
    ({ id, reason }) => apiClient.post(EP.ENVELOPE_VOID(id), { reason }),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: () => {
        toast.success('Envelope voided');
        setVoidModal({ open: false, id: null });
        setVoidReason('');
        if (drawerEnvelope?.id === voidModal.id) setDrawerEnvelope(null);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.ENVELOPE(id)),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: () => {
        toast.success('Envelope deleted');
        if (drawerEnvelope?.id === confirmDelete.id) setDrawerEnvelope(null);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const bulkMutation = useApiMutation(
    ({ action, ids }) => apiClient.post(EP.ENVELOPE_BULK, { action, ids }),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: (res) => {
        const count = res.data?.updated ?? res.data?.deleted ?? 0;
        toast.success(`Bulk action complete: ${count} envelope(s) affected`);
        setSelected(new Set());
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.ENVELOPES, payload),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: (res) => {
        toast.success('Envelope created');
        setCreateModal(false);
        resetCreateForm();
        navigate(`/envelopes/${res.data.id}`);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ---- Handlers ----
  const handleSearchChange = useCallback((e) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(val);
      setPage(1);
    }, 300);
  }, []);

  const handleStatusChange = (e) => { setStatus(e.target.value); setPage(1); };
  const handleSortChange = (e) => { setSort(e.target.value); setPage(1); };
  const handleDueFromChange = (e) => { setDueFrom(e.target.value); setPage(1); };
  const handleDueToChange = (e) => { setDueTo(e.target.value); setPage(1); };

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = (e) => {
    if (e.target.checked) setSelected(new Set(envelopes.map(env => env.id)));
    else setSelected(new Set());
  };

  const openDrawer = async (id) => {
    setDrawerLoading(true);
    setDrawerEnvelope({ id });
    try {
      const res = await apiClient.get(EP.ENVELOPE(id));
      setDrawerEnvelope(res.data);
    } catch (e) {
      toast.error('Could not load envelope details');
      setDrawerEnvelope(null);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleDownload = async (id, name) => {
    try {
      const res = await apiClient.get(EP.ENVELOPE_DOWNLOAD(id), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name || `envelope-${id}`}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  const handleSend = (id) => sendMutation.mutate(id);

  const handleVoidOpen = (id) => {
    setVoidReason('');
    setVoidModal({ open: true, id });
  };

  const handleVoidSubmit = () => {
    if (!voidModal.id) return;
    voidMutation.mutate({ id: voidModal.id, reason: voidReason || 'Voided by admin' });
  };

  const handleDeleteOpen = (env) => {
    setConfirmDelete({ open: true, id: env.id, name: env.name });
  };

  const handleDeleteConfirm = () => {
    deleteMutation.mutate(confirmDelete.id);
  };

  const handleBulkAction = (action, label) => {
    if (!selected.size) { toast.error('Select at least one envelope first'); return; }
    setBulkConfirm({ open: true, action, label });
  };

  const handleBulkConfirm = () => {
    bulkMutation.mutate({ action: bulkConfirm.action, ids: [...selected] });
    setBulkConfirm({ open: false, action: '', label: '' });
  };

  const resetCreateForm = () => {
    setCreateName('');
    setCreateTemplateId('');
    setCreateRecipients([{ name: '', email: '' }]);
  };

  const handleCreateSubmit = () => {
    if (!createName.trim()) { toast.error('Envelope name is required'); return; }
    const validRecipients = createRecipients.filter(r => r.name.trim() && r.email.trim());
    if (!validRecipients.length) { toast.error('At least one recipient with name and email is required'); return; }
    const missingEmail = createRecipients.find(r => r.name.trim() && !r.email.trim());
    if (missingEmail) { toast.error(`Email is required for ${missingEmail.name}`); return; }
    const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
    const payload = {
      name: createName.trim(),
      organization: orgId ? Number(orgId) : undefined,
      recipients: validRecipients.map((r, i) => ({ name: r.name.trim(), email: r.email.trim(), routing_order: i + 1 })),
    };
    if (createTemplateId) payload.template = Number(createTemplateId);
    createMutation.mutate(payload);
  };

  const addRecipientRow = () => setCreateRecipients(prev => [...prev, { name: '', email: '' }]);
  const updateRecipient = (idx, field, val) => {
    setCreateRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeRecipient = (idx) => {
    setCreateRecipients(prev => prev.filter((_, i) => i !== idx));
  };

  const isActionable = (env) => ['sent', 'viewed', 'partially_signed'].includes(env.status);
  const isDraft = (env) => env.status === 'draft';
  const isCompleted = (env) => env.status === 'completed';

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = (env) => env.due_date && !['completed', 'voided', 'declined', 'expired'].includes(env.status) && env.due_date < today;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Envelopes</h1>
          <p className="page-subtitle">All document envelopes across your organization</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => { resetCreateForm(); setCreateModal(true); }}>
            + New Envelope
          </button>
        </div>
      </div>

      {/* Stats grid */}
      <div className="stats-grid" style={{ '--cols': 5, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Draft</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{draftCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: 'var(--warning)' }}>{inProgress}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{completedCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Voided/Expired</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>{voidedExpired}</div>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="card flex gap-2" style={{ padding: '0.75rem 1.25rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{selected.size} selected</span>
          <button className="btn btn-ghost btn-sm" onClick={() => handleBulkAction('send', 'Send drafts')}>
            Send Selected Drafts
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleBulkAction('void', 'Void envelopes')}>
            Void Selected
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => handleBulkAction('delete_drafts', 'Delete selected drafts')}>
            Delete Selected Drafts
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>
            Clear selection
          </button>
        </div>
      )}

      {/* Main card */}
      <div className="card">
        {/* Toolbar */}
        <div className="table-toolbar">
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            <div className="table-search" style={{ width: 260, flex: 'none' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                placeholder="Search envelopes..."
                value={searchInput}
                onChange={handleSearchChange}
              />
            </div>
            <select className="form-input" style={{ width: 160 }} value={status} onChange={handleStatusChange}>
              {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className="form-input" style={{ width: 160 }} value={sort} onChange={handleSortChange}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <input
              className="form-input"
              type="date"
              style={{ width: 150 }}
              title="Due date from"
              value={dueFrom}
              onChange={handleDueFromChange}
            />
            <input
              className="form-input"
              type="date"
              style={{ width: 150 }}
              title="Due date to"
              value={dueTo}
              onChange={handleDueToChange}
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <Spinner center />
        ) : envelopes.length === 0 ? (
          <EmptyState title="No envelopes found" message="Try adjusting your filters or create a new envelope." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selected.size === envelopes.length && envelopes.length > 0}
                    onChange={toggleAll}
                  />
                </th>
                <th>Envelope</th>
                <th>Status</th>
                <th>Recipients</th>
                <th>Template</th>
                <th>Sent</th>
                <th>Due</th>
                <th>Completion</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {envelopes.map(env => {
                const recipients = env.recipients || [];
                const pct = env.completion_percent || 0;
                const overdue = isOverdue(env);
                return (
                  <tr key={env.id}>
                    <td onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(env.id)}
                        onChange={() => toggleSelect(env.id)}
                      />
                    </td>
                    <td
                      style={{ cursor: 'pointer' }}
                      onClick={() => openDrawer(env.id)}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{env.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ENV-{env.id}</div>
                    </td>
                    <td>
                      <Badge color={statusColor(env.status)}>{titleCase(env.status)}</Badge>
                      {overdue && (
                        <div style={{ marginTop: 3 }}>
                          <Badge color="danger" style={{ fontSize: '0.65rem' }}>OVERDUE</Badge>
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex" style={{ gap: 0 }}>
                        {recipients.slice(0, 3).map((r, i) => (
                          <div key={i} style={{ marginLeft: i > 0 ? -4 : 0 }} title={r.name}>
                            <Avatar name={r.name} size={26} />
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.8125rem' }}>{env.template || '—'}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{formatDate(env.sent_at)}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {env.due_date ? formatDate(env.due_date) : '—'}
                    </td>
                    <td style={{ minWidth: 100 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)' }} />
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{pct}%</span>
                      </div>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button className="btn btn-ghost btn-sm" title="View" onClick={() => openDrawer(env.id)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        <button className="btn btn-ghost btn-sm" title="View detail page" onClick={() => navigate(`/envelopes/${env.id}`)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </button>
                        {isDraft(env) && (
                          <button className="btn btn-ghost btn-sm" title="Send" onClick={() => handleSend(env.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                          </button>
                        )}
                        {(isCompleted(env) || isActionable(env)) && (
                          <button className="btn btn-ghost btn-sm" title="Download" onClick={() => handleDownload(env.id, env.name)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          </button>
                        )}
                        {(isDraft(env) || isActionable(env)) && (
                          <button className="btn btn-ghost btn-sm" title="Void" style={{ color: 'var(--warning)' }} onClick={() => handleVoidOpen(env.id)}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" title="Delete" style={{ color: 'var(--danger)' }} onClick={() => handleDeleteOpen(env)}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <Pagination
          hasNext={hasNext}
          hasPrev={hasPrev}
          onNext={() => setPage(p => p + 1)}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          count={count}
          page={page}
        />
      </div>

      {/* Envelope detail drawer */}
      <Drawer open={Boolean(drawerEnvelope)} onClose={() => setDrawerEnvelope(null)} title={drawerEnvelope?.name || 'Envelope Details'} width={520}>
        {drawerLoading ? (
          <Spinner center />
        ) : drawerEnvelope && drawerEnvelope.status ? (
          <div className="flex flex-col gap-4">
            {/* Status & actions */}
            <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge color={statusColor(drawerEnvelope.status)}>{titleCase(drawerEnvelope.status)}</Badge>
              {isDraft(drawerEnvelope) && (
                <button className="btn btn-primary btn-sm" onClick={() => { handleSend(drawerEnvelope.id); setDrawerEnvelope(null); }}>
                  Send
                </button>
              )}
              {(isCompleted(drawerEnvelope) || isActionable(drawerEnvelope)) && (
                <button className="btn btn-ghost btn-sm" onClick={() => handleDownload(drawerEnvelope.id, drawerEnvelope.name)}>
                  Download PDF
                </button>
              )}
              {(isDraft(drawerEnvelope) || isActionable(drawerEnvelope)) && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => { setDrawerEnvelope(null); handleVoidOpen(drawerEnvelope.id); }}>
                  Void
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/envelopes/${drawerEnvelope.id}`)}>
                Full page
              </button>
            </div>

            {/* Details */}
            <div className="card" style={{ padding: '1rem' }}>
              <div className="section-title" style={{ marginBottom: '0.75rem' }}>Details</div>
              <div className="detail-row">
                <span className="detail-label">Name</span>
                <span className="detail-value">{drawerEnvelope.name}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Created</span>
                <span className="detail-value">{formatDate(drawerEnvelope.created_at)}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Due Date</span>
                <span className="detail-value">{drawerEnvelope.due_date ? formatDate(drawerEnvelope.due_date) : '—'}</span>
              </div>
              {drawerEnvelope.template && (
                <div className="detail-row">
                  <span className="detail-label">Template</span>
                  <span className="detail-value">{drawerEnvelope.template}</span>
                </div>
              )}
              <div className="detail-row">
                <span className="detail-label">Completion</span>
                <span className="detail-value">{drawerEnvelope.completion_percent || 0}%</span>
              </div>
            </div>

            {/* Recipients */}
            {(drawerEnvelope.recipients || []).length > 0 && (
              <div className="card" style={{ padding: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>
                  Recipients ({drawerEnvelope.recipients.length})
                </div>
                {drawerEnvelope.recipients.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0', borderBottom: i < drawerEnvelope.recipients.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <Avatar name={r.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.email}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                      <Badge color={statusColor(r.status || r.role)}>{titleCase(r.role || 'signer')}</Badge>
                      {r.signed_at && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Signed {formatDate(r.signed_at)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Documents with page previews */}
            {envelopeDocs.length > 0 && (
              <div className="card" style={{ padding: '1rem' }}>
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Documents</div>
                {envelopeDocs.map((ed, i) => {
                  const doc = ed.document_detail || ed;
                  const pages = doc.pages || [];
                  const firstPage = pages.find(p => p.image_url);
                  return (
                    <div key={ed.id || i} style={{ marginBottom: '0.75rem' }}>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                        {doc.title || doc.name || `Document ${i + 1}`}
                        {doc.page_count ? <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>{doc.page_count} pages</span> : null}
                      </div>
                      {firstPage ? (
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {pages.filter(p => p.image_url).slice(0, 4).map((p, pi) => (
                            <img
                              key={p.id || pi}
                              src={p.image_url}
                              alt={`Page ${p.page_number || pi + 1}`}
                              onClick={() => setPreviewDoc({ name: doc.title || doc.name || `Document ${i + 1}`, pages })}
                              style={{ width: 72, height: 100, objectFit: 'cover', objectPosition: 'top', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}
                            />
                          ))}
                          {pages.filter(p => p.image_url).length > 4 && (
                            <div
                              onClick={() => setPreviewDoc({ name: doc.title || doc.name || `Document ${i + 1}`, pages })}
                              style={{ width: 72, height: 100, border: '1px solid var(--border)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', cursor: 'pointer', background: 'var(--bg-surface)' }}
                            >
                              +{pages.filter(p => p.image_url).length - 4} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>No page previews available</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </Drawer>

      {/* Create Envelope Modal */}
      <Modal
        open={createModal}
        onClose={() => { setCreateModal(false); resetCreateForm(); }}
        title="Create New Envelope"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setCreateModal(false); resetCreateForm(); }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateSubmit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Envelope'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Envelope Name *</label>
            <input
              className="form-input"
              placeholder="e.g. NDA — Acme Corp"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
            />
          </div>

          {templates.length > 0 && (
            <div className="form-group">
              <label className="form-label">Template (optional)</label>
              <select className="form-input" value={createTemplateId} onChange={e => setCreateTemplateId(e.target.value)}>
                <option value="">No template</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Recipients *</div>
            <div className="flex flex-col gap-2">
              {createRecipients.map((r, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    placeholder="Full name"
                    value={r.name}
                    onChange={e => updateRecipient(idx, 'name', e.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="Email address"
                    type="email"
                    value={r.email}
                    onChange={e => updateRecipient(idx, 'email', e.target.value)}
                  />
                  {createRecipients.length > 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeRecipient(idx)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={addRecipientRow}>
              + Add Recipient
            </button>
          </div>
        </div>
      </Modal>

      {/* Void Modal */}
      <Modal
        open={voidModal.open}
        onClose={() => setVoidModal({ open: false, id: null })}
        title="Void Envelope"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setVoidModal({ open: false, id: null })}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={handleVoidSubmit}
              disabled={voidMutation.isPending}
            >
              {voidMutation.isPending ? 'Voiding…' : 'Void Envelope'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Voiding this envelope will prevent all signers from completing it. This action cannot be undone.
          </p>
          <div className="form-group">
            <label className="form-label">Reason (optional)</label>
            <input
              className="form-input"
              placeholder="Reason for voiding..."
              value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, name: '' })}
        onConfirm={handleDeleteConfirm}
        title="Delete Envelope"
        message={`Are you sure you want to delete "${confirmDelete.name}"? This removes the record and all related signing data. This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {/* Bulk Action Confirm */}
      <ConfirmDialog
        open={bulkConfirm.open}
        onClose={() => setBulkConfirm({ open: false, action: '', label: '' })}
        onConfirm={handleBulkConfirm}
        title={`Bulk: ${bulkConfirm.label}`}
        message={`Apply "${bulkConfirm.label}" to ${selected.size} selected envelope(s)?`}
        confirmLabel={bulkConfirm.label}
        danger={bulkConfirm.action.includes('delete')}
      />

      {/* Document page preview modal */}
      {previewDoc && (
        <Modal
          open={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={previewDoc.name}
          size="lg"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
            {previewDoc.pages.filter(p => p.image_url).map((p, i) => (
              <div key={p.id || i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Page {p.page_number || i + 1}</div>
                <img
                  src={p.image_url}
                  alt={`Page ${p.page_number || i + 1}`}
                  style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 4 }}
                />
              </div>
            ))}
            {previewDoc.pages.filter(p => p.image_url).length === 0 && (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No page images available for this document.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
