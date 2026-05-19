import { useState, useCallback, useRef, useEffect } from 'react';
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
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [createCategory, setCreateCategory] = useState('');
  const [creating, setCreating] = useState(false);
  const fileInputRef = useRef(null);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' });
  const [previewModal, setPreviewModal] = useState(null); // { name, documentId }
  const [previewPages, setPreviewPages] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Create envelope from template
  const [envelopeFromTemplate, setEnvelopeFromTemplate] = useState(null);
  const [envName, setEnvName] = useState('');
  const [envMessage, setEnvMessage] = useState('');
  const [envDueDate, setEnvDueDate] = useState('');
  const [envRecipients, setEnvRecipients] = useState([{ name: '', email: '', role: 'signer', party_key: '' }]);
  const [envCreating, setEnvCreating] = useState(false);

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

  const openPreview = useCallback(async (t) => {
    const version = t.versions?.[0];
    const documentId = version?.document;
    setPreviewModal({ name: t.name, documentId, fields: t.fields || [], versions: t.versions || [] });
    setPreviewPages([]);
    if (!documentId) return;
    setPreviewLoading(true);
    try {
      // Fetch document — get already-rendered pages if they exist
      const { data: doc } = await apiClient.get(EP.DOCUMENT(documentId));
      const existingPages = (doc.pages ?? []).filter(p => p.image_url);

      if (existingPages.length > 0) {
        setPreviewPages(existingPages);
        return;
      }

      // No rendered pages yet — trigger prepare-for-builder to generate them
      // via pdf2image on the backend; rendered_pages come back in the response.
      const prepRes = await apiClient.post(EP.DOCUMENT_PREPARE(documentId), {
        page_count: doc.page_count || 1,
        width: 1040,
      });
      const rendered = prepRes.data?.rendered_pages?.length
        ? prepRes.data.rendered_pages
        : prepRes.data?.pages ?? [];
      setPreviewPages(rendered.filter(p => p.image_url));
    } catch { /* no pages available */ }
    finally { setPreviewLoading(false); }
  }, []);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateDescription('');
    setCreateCategory('');
    setCreateDocumentId('');
    setUploadFile(null);
    setUploadDragging(false);
  };

  const handleCreateSubmit = async () => {
    if (!createName.trim()) { toast.error('Template name is required'); return; }
    setCreating(true);
    try {
      let docId = createDocumentId ? Number(createDocumentId) : null;

      // Upload PDF first if the user dropped/selected one
      if (uploadFile) {
        const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('title', uploadFile.name.replace(/\.[^.]+$/, ''));
        fd.append('mime_type', uploadFile.type || 'application/pdf');
        if (orgId) fd.append('organization', orgId);
        const docRes = await apiClient.post(EP.DOCUMENTS, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        docId = docRes.data.id;
        // Kick off processing in background (non-blocking)
        apiClient.post(EP.DOCUMENT_PROCESS(docId), {}).catch(() => {});
      }

      const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
      const payload = {
        name: createName.trim(),
        description: createDescription.trim(),
        organization: orgId ? Number(orgId) : undefined,
      };
      if (createCategory.trim()) payload.category = createCategory.trim();
      if (docId) payload.document = docId;

      const res = await apiClient.post(EP.TEMPLATES, payload);
      toast.success('Template created');
      setCreateModal(false);
      resetCreateForm();
      // Pass docId in URL so FormBuilder loads the right document
      navigate(docId ? `/form-builder/${res.data.id}?doc=${docId}` : `/form-builder/${res.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setCreating(false);
    }
  };

  const resetEnvForm = () => {
    setEnvName('');
    setEnvMessage('');
    setEnvDueDate('');
    setEnvRecipients([{ name: '', email: '', role: 'signer', party_key: '' }]);
  };

  const handleEnvelopeFromTemplateSubmit = async (sendNow = false) => {
    if (!envName.trim()) { toast.error('Envelope name is required'); return; }
    const validRecipients = envRecipients.filter(r => r.name.trim() && r.email.trim());
    if (!validRecipients.length) { toast.error('At least one recipient with name and email is required'); return; }
    const orgId = Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'));
    const t = envelopeFromTemplate;
    const latestVersion = t?.latest_version || t?.versions?.[0];
    const versionId = typeof latestVersion === 'object' ? latestVersion?.id : latestVersion;
    setEnvCreating(true);
    try {
      let res;
      if (versionId) {
        res = await apiClient.post(EP.ENVELOPE_CREATE_FROM_TEMPLATE, {
          organization: orgId,
          template_version: versionId,
          name: envName.trim(),
          message: envMessage.trim() || undefined,
          due_date: envDueDate || undefined,
          send: sendNow,
          recipients: validRecipients.map((r, i) => ({
            name: r.name.trim(),
            email: r.email.trim(),
            role: r.role || 'signer',
            routing_order: i + 1,
            ...(r.party_key ? { party_key: r.party_key } : {}),
          })),
        });
      } else {
        res = await apiClient.post(EP.ENVELOPES, {
          name: envName.trim(),
          organization: orgId,
          template: t?.id,
          message: envMessage.trim() || undefined,
          due_date: envDueDate || undefined,
          recipients: validRecipients.map((r, i) => ({
            name: r.name.trim(),
            email: r.email.trim(),
            role: r.role || 'signer',
            routing_order: i + 1,
          })),
        });
        if (sendNow) await apiClient.post(EP.ENVELOPE_SEND(res.data.id), {});
      }
      const fieldCount = res.data?.fields?.length ?? 0;
      toast.success(`Envelope ${sendNow ? 'created and sent' : 'draft created'}${fieldCount > 0 ? ` with ${fieldCount} field(s)` : ''}`);
      setEnvelopeFromTemplate(null);
      resetEnvForm();
      navigate(`/envelopes/${res.data.id}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setEnvCreating(false);
    }
  };

  const addEnvRecipient = () => setEnvRecipients(prev => [...prev, { name: '', email: '', role: 'signer', party_key: '' }]);
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
                <div key={t.id} className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Document thumbnail */}
                  <div
                    onClick={() => openPreview(t)}
                    title="Click to preview"
                    style={{
                      width: '100%',
                      height: 148,
                      background: '#f1f5f9',
                      borderBottom: '1px solid var(--border)',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      position: 'relative',
                    }}
                  >
                    {t.preview_image_url ? (
                      <img
                        src={t.preview_image_url}
                        alt="Page 1 preview"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div style={{ fontSize: '2rem', marginBottom: 4 }}>📄</div>
                        <div style={{ fontSize: '0.7rem' }}>No preview</div>
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'rgba(15,23,42,0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.15s',
                      fontSize: '0.75rem', color: 'white', fontWeight: 600,
                    }}
                      className="thumbnail-hover-overlay"
                    />
                  </div>

                  <div style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
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
                      className="btn btn-ghost btn-sm"
                      onClick={() => openPreview(t)}
                      title="Preview document pages"
                    >
                      Preview
                    </button>
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
                        const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
                        setEnvName(`${t.name} — ${new Date().toLocaleDateString()}`);
                        setEnvMessage('Please review and sign this document at your earliest convenience.');
                        setEnvDueDate(sevenDays);
                        setEnvRecipients([{ name: '', email: '', role: 'signer', party_key: '' }]);
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
                  </div>{/* end inner padding wrapper */}
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
            <button className="btn btn-ghost" onClick={() => { setCreateModal(false); resetCreateForm(); }} disabled={creating}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCreateSubmit}
              disabled={creating}
            >
              {creating ? 'Creating…' : 'Create & Open Builder'}
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
              autoFocus
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-input"
              placeholder="Briefly describe what this template is for..."
              rows={2}
              value={createDescription}
              onChange={e => setCreateDescription(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Category</label>
            <input
              className="form-input"
              placeholder="e.g. Legal, HR, Sales…"
              value={createCategory}
              onChange={e => setCreateCategory(e.target.value)}
            />
          </div>

          {/* PDF upload drop zone */}
          <div className="form-group">
            <label className="form-label">Upload PDF</label>
            <div
              onDragOver={e => { e.preventDefault(); setUploadDragging(true); }}
              onDragLeave={() => setUploadDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setUploadDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) { setUploadFile(f); setCreateDocumentId(''); }
              }}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${uploadDragging ? 'var(--primary)' : uploadFile ? 'var(--success)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '1.25rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: uploadDragging ? 'rgba(79,142,247,0.05)' : uploadFile ? 'rgba(34,197,94,0.04)' : 'var(--bg-secondary)',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              {uploadFile ? (
                <div>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>📄</div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--success)' }}>{uploadFile.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {(uploadFile.size / 1024 / 1024).toFixed(2)} MB — click to change
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--danger)' }}
                    onClick={e => { e.stopPropagation(); setUploadFile(null); }}
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.375rem', color: 'var(--text-muted)' }}>⬆</div>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Drop a PDF here or click to browse</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>PDF, DOCX · Max 50 MB</div>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setUploadFile(f); setCreateDocumentId(''); }
              }}
            />
          </div>

          {/* OR: pick an existing document */}
          {documents.length > 0 && !uploadFile && (
            <div className="form-group">
              <label className="form-label" style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>
                — or select an existing document —
              </label>
              <select className="form-input" value={createDocumentId} onChange={e => setCreateDocumentId(e.target.value)}>
                <option value="">None</option>
                {documents.map(doc => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name || doc.original_filename || doc.filename || `Document #${doc.id}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!uploadFile && !createDocumentId && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
              No document is required — you can place fields on a blank canvas in the builder.
            </p>
          )}
        </div>
      </Modal>

      {/* Create Envelope from Template Modal */}
      {(() => {
        const t = envelopeFromTemplate;
        const latestVersion = t?.latest_version || t?.versions?.[0];
        const versionId = typeof latestVersion === 'object' ? latestVersion?.id : latestVersion;
        const partyKeys = t?.party_keys ?? [];
        const fieldCount = t?.field_count ?? t?.fields?.length ?? 0;
        const isReady = !!versionId && fieldCount > 0;
        const hasParties = partyKeys.length > 0;

        return (
          <Modal
            open={Boolean(t)}
            onClose={() => { setEnvelopeFromTemplate(null); resetEnvForm(); }}
            title={`New Envelope — ${t?.name || ''}`}
            size="lg"
            footer={
              <>
                <button className="btn btn-ghost" onClick={() => { setEnvelopeFromTemplate(null); resetEnvForm(); }} disabled={envCreating}>
                  Cancel
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => handleEnvelopeFromTemplateSubmit(false)}
                  disabled={envCreating}
                >
                  {envCreating ? 'Creating…' : 'Save Draft'}
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleEnvelopeFromTemplateSubmit(true)}
                  disabled={envCreating}
                >
                  {envCreating ? 'Sending…' : 'Create & Send'}
                </button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              {/* Template readiness indicator */}
              <div style={{
                padding: '0.75rem 1rem',
                borderRadius: 8,
                fontSize: '0.8125rem',
                background: isReady ? 'rgba(34,197,94,0.08)' : 'rgba(234,179,8,0.08)',
                border: `1px solid ${isReady ? 'var(--success)' : 'var(--warning)'}`,
              }}>
                {isReady ? (
                  <span style={{ color: 'var(--success)' }}>
                    ✓ Template ready — {fieldCount} field{fieldCount !== 1 ? 's' : ''} configured
                    {partyKeys.length > 0 && `, ${partyKeys.length} signing part${partyKeys.length !== 1 ? 'ies' : 'y'}`}
                  </span>
                ) : versionId ? (
                  <span style={{ color: 'var(--warning)' }}>
                    ⚠ Template has no fields yet — envelope will be created but recipients won't have anything to sign
                  </span>
                ) : (
                  <span style={{ color: 'var(--warning)' }}>
                    ⚠ Template has no published version — creating a basic envelope without template fields
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Envelope Name *</label>
                <input
                  className="form-input"
                  placeholder="e.g. NDA — Acme Corp"
                  value={envName}
                  onChange={e => setEnvName(e.target.value)}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Due Date</label>
                  <input
                    className="form-input"
                    type="date"
                    value={envDueDate}
                    onChange={e => setEnvDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Message to Recipients</label>
                <textarea
                  className="form-input"
                  rows={2}
                  placeholder="Please review and sign this document at your earliest convenience."
                  value={envMessage}
                  onChange={e => setEnvMessage(e.target.value)}
                />
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem' }}>Recipients *</div>
                <div className="flex flex-col gap-2">
                  {/* Column headers */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: hasParties ? '1fr 1fr 120px 130px auto' : '1fr 1fr 120px auto',
                    gap: '0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--text-muted)',
                    paddingBottom: '0.25rem',
                  }}>
                    <span>Full Name</span>
                    <span>Email</span>
                    <span>Role</span>
                    {hasParties && <span>Party</span>}
                    <span />
                  </div>

                  {envRecipients.map((r, idx) => (
                    <div key={idx} style={{
                      display: 'grid',
                      gridTemplateColumns: hasParties ? '1fr 1fr 120px 130px auto' : '1fr 1fr 120px auto',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}>
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
                      <select
                        className="form-input"
                        value={r.role}
                        onChange={e => updateEnvRecipient(idx, 'role', e.target.value)}
                      >
                        <option value="signer">Signer</option>
                        <option value="approver">Approver</option>
                        <option value="cc">CC</option>
                      </select>
                      {hasParties && (
                        <select
                          className="form-input"
                          value={r.party_key}
                          onChange={e => updateEnvRecipient(idx, 'party_key', e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {partyKeys.map(pk => (
                            <option key={pk} value={pk}>{pk}</option>
                          ))}
                        </select>
                      )}
                      {envRecipients.length > 1 ? (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => removeEnvRecipient(idx)}
                        >
                          ×
                        </button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.5rem' }} onClick={addEnvRecipient}>
                  + Add Recipient
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

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

      {/* Document page preview modal */}
      <Modal
        open={!!previewModal}
        onClose={() => { setPreviewModal(null); setPreviewPages([]); }}
        title={previewModal ? `Preview — ${previewModal.name}` : ''}
        size="lg"
      >
        {previewLoading ? (
          <Spinner center />
        ) : previewPages.length > 0 ? (() => {
          const PREVIEW_PARTY_COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2'];
          const partyColorMap = (previewModal?.versions?.[0]?.parties || []).reduce(
            (map, p, idx) => ({ ...map, [p.id]: PREVIEW_PARTY_COLORS[idx % PREVIEW_PARTY_COLORS.length] }),
            {},
          );
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
              {previewPages.map((p, i) => {
                const pageNum = p.page_number || i + 1;
                const pageW = p.width || 1040;
                const pageH = p.height || 1471;
                const pageFields = (previewModal?.fields || []).filter(f => f.page === pageNum);
                return (
                  <div key={p.id || i}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem', textAlign: 'center' }}>Page {pageNum}</div>
                    <div style={{ position: 'relative' }}>
                      <img
                        src={p.image_url}
                        alt={`Page ${pageNum}`}
                        style={{ width: '100%', display: 'block', border: '1px solid var(--border)', borderRadius: 4 }}
                      />
                      {pageFields.map((field, fi) => {
                        const color = partyColorMap[field.party] || '#2563eb';
                        return (
                          <div
                            key={fi}
                            title={`${field.label} (${field.field_type})`}
                            style={{
                              position: 'absolute',
                              left: `${(field.x / pageW) * 100}%`,
                              top: `${(field.y / pageH) * 100}%`,
                              width: `${(field.width / pageW) * 100}%`,
                              height: `${(field.height / pageH) * 100}%`,
                              border: `2px solid ${color}`,
                              borderRadius: 3,
                              backgroundColor: `${color}22`,
                              boxSizing: 'border-box',
                              pointerEvents: 'none',
                              display: 'flex',
                              alignItems: 'center',
                              overflow: 'hidden',
                            }}
                          >
                            <span style={{ fontSize: 9, color, padding: '0 2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1 }}>
                              {field.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })() : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            {previewModal?.documentId
              ? 'No page images available for this document.'
              : 'No document attached to this template yet. Open the form builder to upload one.'}
          </div>
        )}
      </Modal>
    </div>
  );
}
