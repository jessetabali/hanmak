import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatBytes } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const SORT_OPTIONS = [
  { value: '-created_at', label: 'Date: Newest' },
  { value: 'created_at', label: 'Date: Oldest' },
  { value: 'title', label: 'Name A–Z' },
  { value: '-title', label: 'Name Z–A' },
  { value: '-file_size', label: 'Size: Largest' },
];

const STATUS_COLORS = {
  ready: 'success',
  processing: 'warning',
  uploaded: 'secondary',
  failed: 'danger',
};

function getExt(doc) {
  if ((doc.mime_type || '').includes('pdf')) return 'PDF';
  const name = doc.title || doc.original_filename || '';
  const ext = name.split('.').pop().toUpperCase();
  return ext && ext !== name.toUpperCase() ? ext : 'FILE';
}

export default function Documents() {
  const toast = useToast();
  const navigate = useNavigate();

  // Search / filter
  const [search, setSearch] = useState('');
  const [liveSearch, setLiveSearch] = useState('');
  const [sort, setSort] = useState('-created_at');
  const [page, setPage] = useState(1);
  const searchTimer = useRef(null);

  // Upload modal state
  const [uploadModal, setUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [autoProcess, setAutoProcess] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

  // Drawers / dialogs
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [drawerPages, setDrawerPages] = useState(null);
  const [drawerPagesLoading, setDrawerPagesLoading] = useState(false);

  // Data
  const { data: summaryData, refetch: refetchSummary } = useApiQuery(['docs-summary'], EP.DOCUMENTS + 'summary/');
  const { data, isLoading, refetch } = useApiQuery(
    ['documents', liveSearch, sort, page],
    EP.DOCUMENTS,
    { search: liveSearch || undefined, ordering: sort, page }
  );

  const docs = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const hasNext = !!data?.next;
  const hasPrev = !!data?.previous;
  const summary = summaryData ?? {};

  const handleRefresh = useCallback(() => {
    refetch();
    refetchSummary();
  }, [refetch, refetchSummary]);

  // Mutations
  const uploadMutation = useApiMutation(
    (formData) =>
      apiClient.post(EP.DOCUMENTS, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    {
      invalidateKeys: ['documents', 'docs-summary'],
      onSuccess: async (res) => {
        const doc = res.data;
        if (autoProcess && doc?.id) {
          try {
            await apiClient.post(EP.DOCUMENT_PROCESS(doc.id), {});
          } catch {
            /* best effort */
          }
        }
        toast.success('Document uploaded');
        setUploadModal(false);
        setUploadFile(null);
        setUploadTitle('');
        handleRefresh();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const processMutation = useApiMutation(
    (id) => apiClient.post(EP.DOCUMENT_PROCESS(id), {}),
    {
      invalidateKeys: ['documents'],
      onSuccess: () => { toast.success('Document processing started'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const duplicateMutation = useApiMutation(
    ({ id, title }) => apiClient.post(EP.DOCUMENT_DUPLICATE(id), { title }),
    {
      invalidateKeys: ['documents', 'docs-summary'],
      onSuccess: () => { toast.success('Document duplicated'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const prepareMutation = useApiMutation(
    (id) => apiClient.post(EP.DOCUMENT_PREPARE(id), { width: 1040 }),
    {
      onSuccess: (_res, id) => {
        toast.success('Document prepared for Form Builder');
        localStorage.setItem('HANMAK_BUILDER_DOCUMENT_ID', String(id));
        navigate('/form-builder?doc=' + id);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.DOCUMENT(id)),
    {
      invalidateKeys: ['documents', 'docs-summary'],
      onSuccess: () => {
        toast.success('Document deleted');
        setConfirmDelete(null);
        setSelectedDoc(null);
        handleRefresh();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // Search debounce
  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLiveSearch(value);
      setPage(1);
    }, 300);
  }, []);

  // Upload
  const handleUpload = useCallback(() => {
    if (!uploadFile) { toast.error('Select a file first'); return; }
    const formData = new FormData();
    formData.append('file', uploadFile);
    formData.append('title', uploadTitle.trim() || uploadFile.name.replace(/\.[^.]+$/, ''));
    formData.append('mime_type', uploadFile.type || 'application/octet-stream');
    uploadMutation.mutate(formData);
  }, [uploadFile, uploadTitle, uploadMutation, toast]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setUploadFile(file);
      setUploadTitle(file.name.replace(/\.[^.]+$/, ''));
    }
  }, []);

  const openUploadModal = () => {
    setUploadModal(true);
    setUploadFile(null);
    setUploadTitle('');
  };

  // Drawer: load pages on open
  const openDocDrawer = useCallback(async (doc) => {
    setSelectedDoc(doc);
    setDrawerPages(null);
    if (doc.page_count && doc.page_count > 0) {
      setDrawerPagesLoading(true);
      try {
        const res = await apiClient.post(EP.DOCUMENT_RENDER_PAGES(doc.id), { width: 400 });
        setDrawerPages(res.data?.pages ?? null);
      } catch {
        setDrawerPages(null);
      } finally {
        setDrawerPagesLoading(false);
      }
    }
  }, []);

  // Cleanup
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Document Library</h1>
          <p className="page-subtitle">Signed documents, attachments, and generated files</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={handleRefresh}>Refresh</button>
          <button className="btn btn-primary" onClick={openUploadModal}>Upload Document</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {[
          ['Total Documents', summary.total ?? 0],
          ['Processing', summary.processing ?? 0],
          ['Ready', summary.ready ?? 0],
          ['Total Storage', formatBytes(summary.file_size ?? 0)],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <div className="table-toolbar" style={{ gap: '0.5rem' }}>
          <input
            className="form-input"
            placeholder="Search documents…"
            style={{ width: 280 }}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            className="form-input"
            style={{ width: 170 }}
            value={sort}
            onChange={(e) => { setSort(e.target.value); setPage(1); }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <Spinner center />
      ) : docs.length === 0 ? (
        <EmptyState
          title="No documents found"
          message="Upload a PDF, DOCX, or image to get started."
          action={
            <button className="btn btn-primary" onClick={openUploadModal}>
              Upload Document
            </button>
          }
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Pages</th>
                <th>File Size</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr
                  key={doc.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => openDocDrawer(doc)}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>
                      {doc.title || doc.original_filename || '—'}
                    </div>
                  </td>
                  <td>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        padding: '0.15rem 0.4rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: 4,
                        fontWeight: 700,
                      }}
                    >
                      {getExt(doc)}
                    </span>
                  </td>
                  <td>{doc.page_count ?? '—'}</td>
                  <td>{doc.file_size ? formatBytes(doc.file_size) : '—'}</td>
                  <td>
                    <Badge color={STATUS_COLORS[doc.status] || 'secondary'}>
                      {doc.status || '—'}
                    </Badge>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {formatDate(doc.created_at)}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Open in Form Builder"
                        disabled={prepareMutation.isPending}
                        onClick={() => prepareMutation.mutate(doc.id)}
                      >
                        Builder
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Process"
                        disabled={processMutation.isPending}
                        onClick={() => processMutation.mutate(doc.id)}
                      >
                        Process
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Duplicate"
                        disabled={duplicateMutation.isPending}
                        onClick={() =>
                          duplicateMutation.mutate({
                            id: doc.id,
                            title: `${doc.title || 'Document'} Copy`,
                          })
                        }
                      >
                        Duplicate
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmDelete(doc.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            count={totalCount}
            page={page}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={() => setPage((p) => p + 1)}
            onPrev={() => setPage((p) => Math.max(1, p - 1))}
          />
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        title="Upload Document"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setUploadModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={uploadMutation.isPending || !uploadFile}
              onClick={handleUpload}
            >
              {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
            </button>
          </>
        }
      >
        {/* Drag-drop zone */}
        <div className="form-group">
          <div
            className="upload-zone"
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
              borderRadius: 8,
              padding: '2rem',
              textAlign: 'center',
              background: dragging ? 'var(--primary-light, #dbeafe)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📄</div>
            {uploadFile ? (
              <div>
                <div style={{ fontWeight: 600 }}>{uploadFile.name}</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {formatBytes(uploadFile.size)}
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontWeight: 500, marginBottom: '0.25rem' }}>
                  Drop file here or click to browse
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  PDF, DOCX, DOC, or images
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc,image/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setUploadFile(f);
                  if (!uploadTitle) setUploadTitle(f.name.replace(/\.[^.]+$/, ''));
                }
              }}
            />
          </div>
        </div>

        {/* Title */}
        <div className="form-group">
          <label className="form-label">Document Title</label>
          <input
            className="form-input"
            placeholder="Auto-filled from filename"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
          />
        </div>

        {/* Auto-process */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={autoProcess}
            onChange={(e) => setAutoProcess(e.target.checked)}
          />
          Process document after upload
        </label>
      </Modal>

      {/* Document Detail Drawer */}
      <Drawer
        open={!!selectedDoc}
        onClose={() => { setSelectedDoc(null); setDrawerPages(null); }}
        title={selectedDoc?.title || 'Document'}
        width={520}
      >
        {selectedDoc && (
          <div className="flex flex-col gap-3">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge color={STATUS_COLORS[selectedDoc.status] || 'secondary'}>
                {selectedDoc.status || '—'}
              </Badge>
              <span
                style={{
                  fontSize: '0.72rem',
                  padding: '0.15rem 0.4rem',
                  background: 'var(--bg-secondary)',
                  borderRadius: 4,
                  fontWeight: 700,
                }}
              >
                {getExt(selectedDoc)}
              </span>
            </div>

            {[
              ['MIME Type', selectedDoc.mime_type || '—'],
              ['Pages', selectedDoc.page_count ?? '—'],
              ['File Size', selectedDoc.file_size ? formatBytes(selectedDoc.file_size) : '—'],
              ['Created', formatDate(selectedDoc.created_at)],
              ['Updated', formatDate(selectedDoc.updated_at)],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '0.375rem 0',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.875rem',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span>{value}</span>
              </div>
            ))}

            {/* StoredFile info */}
            {selectedDoc.stored_file && (
              <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                  Stored File
                </div>
                <div style={{ fontSize: '0.8125rem' }}>
                  {selectedDoc.stored_file.filename || selectedDoc.stored_file.id}
                </div>
              </div>
            )}

            {selectedDoc.file_url && (
              <a
                className="btn btn-ghost btn-sm"
                href={selectedDoc.file_url}
                target="_blank"
                rel="noreferrer"
                style={{ alignSelf: 'flex-start' }}
              >
                Download File
              </a>
            )}

            {/* Page thumbnails */}
            {selectedDoc.page_count > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Pages
                  {drawerPagesLoading && (
                    <Spinner style={{ display: 'inline-block', marginLeft: '0.5rem' }} />
                  )}
                </div>
                {drawerPages?.length > 0 ? (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                      gap: '0.5rem',
                    }}
                  >
                    {drawerPages.map((pg, i) => (
                      <div
                        key={i}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          overflow: 'hidden',
                          background: 'var(--bg-secondary)',
                        }}
                      >
                        {pg.url ? (
                          <img
                            src={pg.url}
                            alt={`Page ${i + 1}`}
                            style={{ width: '100%', display: 'block' }}
                          />
                        ) : (
                          <div
                            style={{
                              height: 80,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '0.72rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            p.{i + 1}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : !drawerPagesLoading ? (
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {selectedDoc.page_count} page{selectedDoc.page_count !== 1 ? 's' : ''} (thumbnails not yet rendered)
                  </div>
                ) : null}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2" style={{ marginTop: '0.5rem' }}>
              <button
                className="btn btn-primary btn-sm"
                disabled={prepareMutation.isPending}
                onClick={() => prepareMutation.mutate(selectedDoc.id)}
              >
                Open in Form Builder
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={processMutation.isPending}
                onClick={() => processMutation.mutate(selectedDoc.id)}
              >
                Process Document
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={duplicateMutation.isPending}
                onClick={() =>
                  duplicateMutation.mutate({
                    id: selectedDoc.id,
                    title: `${selectedDoc.title || 'Document'} Copy`,
                  })
                }
              >
                Duplicate
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => { setSelectedDoc(null); setConfirmDelete(selectedDoc.id); }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete)}
        title="Delete Document"
        message="Delete this document? This cannot be undone. Documents under legal hold are protected and will return an error."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
