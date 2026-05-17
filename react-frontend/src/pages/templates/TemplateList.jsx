import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

function titleCase(str) {
  return (str || '').split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'archived', label: 'Archived' },
];

export default function TemplateList() {
  const navigate = useNavigate();
  const toast = useToast();

  // Filters & pagination
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debounceRef = useRef(null);

  // Create template modal
  const [createModal, setCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createDocumentId, setCreateDocumentId] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' });

  // Create envelope from template
  const [envelopeFromTemplate, setEnvelopeFromTemplate] = useState(null);
  const [envName, setEnvName] = useState('');
  const [envRecipients, setEnvRecipients] = useState([{ name: '', email: '' }]);

  // ---- Queries ----
  // Summary: use count from a page_size=1 request
  const { data: summaryData } = useApiQuery(
    ['templates-summary'],
    EP.TEMPLATES,
    { page_size: 1 }
  );

  const { data, isLoading } = useApiQuery(
    ['templates', search, status, page],
    EP.TEMPLATES,
    { search, status, ordering: '-created_at', page }
  );

  const { data: documentsData } = useApiQuery(
    ['documents-picker'],
    EP.DOCUMENTS,
    { page_size: 50 }
  );

  const templates = data?.results ?? [];
  const count = data?.count ?? 0;
  const totalCount = summaryData?.count ?? 0;
  const hasNext = Boolean(data?.next);
  const hasPrev = Boolean(data?.previous);
  const documents = documentsData?.results ?? [];

  // ---- Mutations ----
  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.TEMPLATES, payload),
    {
      invalidateKeys: ['templates', 'templates-summary'],
      onSuccess: (res) => {
        toast.success('Template created');
        setCreateModal(false);
        resetCreateForm();
        navigate(`/form-builder/${res.data.id}`);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const duplicateMutation = useApiMutation(
    (id) => apiClient.post(`${EP.TEMPLATE(id)}duplicate/`, {}),
    {
      invalidateKeys: ['templates', 'templates-summary'],
      onSuccess: (res) => {
        toast.success('Template duplicated');
        if (res.data?.id) navigate(`/form-builder/${res.data.id}`);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const archiveMutation = useApiMutation(
    ({ id, newStatus }) => apiClient.patch(EP.TEMPLATE(id), { status: newStatus }),
    {
      invalidateKeys: ['templates', 'templates-summary'],
      onSuccess: (_, vars) => toast.success(`Template ${vars.newStatus === 'archived' ? 'archived' : 'activated'}`),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.TEMPLATE(id)),
    {
      invalidateKeys: ['templates', 'templates-summary'],
      onSuccess: () => toast.success('Template deleted'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const createEnvelopeMutation = useApiMutation(
    (payload) => apiClient.post(EP.ENVELOPES, payload),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: (res) => {
        toast.success('Envelope created from template');
        setEnvelopeFromTemplate(null);
        resetEnvForm();
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

  const resetCreateForm = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateDocumentId('');
  };

  const handleCreateSubmit = () => {
    if (!createName.trim()) { toast.error('Template name is required'); return; }
    const payload = { name: createName.trim(), description: createDescription.trim() };
    if (createDocumentId) payload.document = Number(createDocumentId);
    createMutation.mutate(payload);
  };

  const resetEnvForm = () => {
    setEnvName('');
    setEnvRecipients([{ name: '', email: '' }]);
  };

  const handleEnvelopeFromTemplateSubmit = () => {
    if (!envName.trim()) { toast.error('Envelope name is required'); return; }
    const validRecipients = envRecipients.filter(r => r.name.trim() && r.email.trim());
    if (!validRecipients.length) { toast.error('At least one recipient with name and email is required'); return; }
    createEnvelopeMutation.mutate({
      name: envName.trim(),
      template: envelopeFromTemplate?.id,
      recipients: validRecipients.map((r, i) => ({ name: r.name.trim(), email: r.email.trim(), routing_order: i + 1 })),
    });
  };

  const addEnvRecipient = () => setEnvRecipients(prev => [...prev, { name: '', email: '' }]);
  const updateEnvRecipient = (idx, field, val) => {
    setEnvRecipients(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };
  const removeEnvRecipient = (idx) => setEnvRecipients(prev => prev.filter((_, i) => i !== idx));

  // ---- Derived stats ----
  // We don't have granular status counts from the summary endpoint alone,
  // so we calculate them from the current page as a best-effort, and show total from count.
  const activeCount = templates.filter(t => t.status === 'active' || t.is_active === true).length;
  const draftCount = templates.filter(t => t.status === 'draft').length;
  const archivedCount = templates.filter(t => t.status === 'archived' || t.is_active === false).length;

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Templates</h1>
          <p className="page-subtitle">Reusable document signing templates</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => { resetCreateForm(); setCreateModal(true); }}>
            + New Template
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{totalCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active</div>
          <div className="stat-value" style={{ color: 'var(--success)' }}>{activeCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Draft</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{draftCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Archived</div>
          <div className="stat-value" style={{ color: 'var(--text-muted)' }}>{archivedCount}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1rem' }}>
        <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
          <div className="table-search" style={{ width: 260, flex: 'none' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              placeholder="Search templates..."
              value={searchInput}
              onChange={handleSearchChange}
            />
          </div>
          <select className="form-input" style={{ width: 160 }} value={status} onChange={handleStatusChange}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Template cards grid */}
      {isLoading ? (
        <Spinner center />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates found"
          message="Create your first template to get started with document signing."
          action={
            <button className="btn btn-primary" onClick={() => { resetCreateForm(); setCreateModal(true); }}>
              + New Template
            </button>
          }
        />
      ) : (
        <>
          <div className="grid-auto">
            {templates.map(t => {
              const isActive = t.status === 'active' || t.is_active === true;
              const isArchived = t.status === 'archived' || t.is_active === false;
              const partyCount = t.party_count ?? t.parties?.length ?? 0;
              const fieldCount = t.field_count ?? t.fields?.length;
              const versionNumber = t.version ?? t.current_version;

              return (
                <div key={t.id} className="card" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{t.name}</div>
                      <Badge color={statusColor(t.status || (isActive ? 'active' : 'draft'))}>
                        {titleCase(t.status || (isActive ? 'active' : 'draft'))}
                      </Badge>
                    </div>
                  </div>

                  {/* Description */}
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    {t.description || 'No description'}
                  </p>

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {partyCount > 0 && <span>{partyCount} {partyCount === 1 ? 'party' : 'parties'}</span>}
                    {versionNumber && <span>v{versionNumber}</span>}
                    {fieldCount !== undefined && <span>{fieldCount} fields</span>}
                    <span>Created {formatDate(t.created_at)}</span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 'auto', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => navigate(`/form-builder/${t.id}`)}
                      title="Open in form builder"
                    >
                      Setup
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setEnvName(`${t.name} — ${new Date().toLocaleDateString()}`);
                        setEnvRecipients([{ name: '', email: '' }]);
                        setEnvelopeFromTemplate(t);
                      }}
                      title="Create envelope from this template"
                    >
                      Use Template
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => duplicateMutation.mutate(t.id)}
                      disabled={duplicateMutation.isPending}
                      title="Duplicate template"
                    >
                      Duplicate
                    </button>
                    {!isArchived ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => archiveMutation.mutate({ id: t.id, newStatus: 'archived' })}
                        disabled={archiveMutation.isPending}
                        title="Archive template"
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => archiveMutation.mutate({ id: t.id, newStatus: 'active' })}
                        disabled={archiveMutation.isPending}
                        title="Activate template"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)', marginLeft: 'auto' }}
                      onClick={() => setConfirmDelete({ open: true, id: t.id, name: t.name })}
                      title="Delete template"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <Pagination
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage(p => p + 1)}
              onPrev={() => setPage(p => Math.max(1, p - 1))}
              count={count}
              page={page}
            />
          </div>
        </>
      )}

      {/* Create Template Modal */}
      <Modal
        open={createModal}
        onClose={() => { setCreateModal(false); resetCreateForm(); }}
        title="Create New Template"
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
              {createMutation.isPending ? 'Creating…' : 'Create & Setup'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="form-group">
            <label className="form-label">Template Name *</label>
            <input
              className="form-input"
              placeholder="e.g. Standard NDA"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Briefly describe what this template is for..."
              rows={3}
              value={createDescription}
              onChange={e => setCreateDescription(e.target.value)}
            />
          </div>
          {documents.length > 0 && (
            <div className="form-group">
              <label className="form-label">Starting Document (optional)</label>
              <select className="form-input" value={createDocumentId} onChange={e => setCreateDocumentId(e.target.value)}>
                <option value="">No document — upload in builder</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name || doc.original_filename || doc.filename || `Document #${doc.id}`}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                You can also upload a document in the form builder after creation.
              </p>
            </div>
          )}
          <div className="alert alert-warning" style={{ fontSize: '0.8125rem' }}>
            After creating, you will be taken to the form builder to add signing fields and configure parties.
          </div>
        </div>
      </Modal>

      {/* Create Envelope from Template Modal */}
      <Modal
        open={Boolean(envelopeFromTemplate)}
        onClose={() => { setEnvelopeFromTemplate(null); resetEnvForm(); }}
        title={`New Envelope — ${envelopeFromTemplate?.name || ''}`}
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setEnvelopeFromTemplate(null); resetEnvForm(); }}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleEnvelopeFromTemplateSubmit}
              disabled={createEnvelopeMutation.isPending}
            >
              {createEnvelopeMutation.isPending ? 'Creating…' : 'Create Envelope'}
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
              value={envName}
              onChange={e => setEnvName(e.target.value)}
            />
          </div>

          <div>
            <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Recipients *</div>
            <div className="flex flex-col gap-2">
              {envRecipients.map((r, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '0.5rem', alignItems: 'center' }}>
                  <input
                    className="form-input"
                    placeholder="Full name"
                    value={r.name}
                    onChange={e => updateEnvRecipient(idx, 'name', e.target.value)}
                  />
                  <input
                    className="form-input"
                    placeholder="Email address"
                    type="email"
                    value={r.email}
                    onChange={e => updateEnvRecipient(idx, 'email', e.target.value)}
                  />
                  {envRecipients.length > 1 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: 'var(--danger)' }}
                      onClick={() => removeEnvRecipient(idx)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={addEnvRecipient}>
              + Add Recipient
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, name: '' })}
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        title="Delete Template"
        message={`Are you sure you want to delete "${confirmDelete.name}"? All associated form fields and configurations will be permanently removed.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
