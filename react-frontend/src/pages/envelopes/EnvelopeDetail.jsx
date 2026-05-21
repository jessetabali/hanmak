import { useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

function titleCase(str) {
  return (str || '').split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

// ─── Envelope document preview helpers ───────────────────────────────────────

const PREVIEW_DOC_WIDTH = 680; // narrower than signing canvas — fits in the detail sidebar

function parseTypedSig(val) {
  if (!val || typeof val !== 'string') return null;
  const m = val.match(/^\[TYPED:(.+)\|(.+)\|(.+)\]$/);
  return m ? { name: m[1], font: m[2], color: m[3] } : null;
}

function EnvelopeFieldOverlay({ field, scale, value }) {
  const fieldType = field.field_type || field.type || 'text';
  const isSig = ['signature', 'initials'].includes(fieldType);
  const hasValue = value != null && value !== '';
  const x = (field.x || 0) * scale;
  const y = (field.y || 0) * scale;
  const w = (field.width || 160) * scale;
  const h = (field.height || 32) * scale;

  let content = null;
  if (hasValue) {
    const typedSig = parseTypedSig(value);
    if (typedSig) {
      content = (
        <span style={{ fontFamily: `'${typedSig.font}', cursive`, fontSize: Math.max(10, h * 0.52), color: typedSig.color, whiteSpace: 'nowrap', overflow: 'hidden', display: 'block' }}>
          {typedSig.name}
        </span>
      );
    } else if (typeof value === 'string' && value.startsWith('data:image/')) {
      content = <img src={value} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
    } else if (fieldType === 'checkbox') {
      content = <span style={{ fontSize: Math.max(10, h * 0.6), color: '#16a34a' }}>{String(value).toLowerCase() === 'true' ? '✓' : ''}</span>;
    } else {
      content = <span style={{ fontSize: Math.max(9, h * 0.4), color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden' }}>{String(value)}</span>;
    }
  } else {
    content = <span style={{ fontSize: Math.max(8, h * 0.35), color: isSig ? '#f59e0b' : '#94a3b8', fontWeight: 500 }}>{isSig ? '✍' : '▷'} {field.label || fieldType}</span>;
  }

  return (
    <div style={{
      position: 'absolute', left: x, top: y, width: w, height: h,
      background: hasValue
        ? (isSig ? 'rgba(22,163,74,0.08)' : 'rgba(37,99,235,0.07)')
        : 'rgba(245,158,11,0.08)',
      border: `1px solid ${hasValue ? (isSig ? 'rgba(22,163,74,0.3)' : 'rgba(37,99,235,0.25)') : 'rgba(245,158,11,0.3)'}`,
      borderRadius: 3, boxSizing: 'border-box',
      display: 'flex', alignItems: 'center', padding: '2px 5px',
      overflow: 'hidden', zIndex: 10,
    }}>
      {content}
    </div>
  );
}

function EnvelopeDocumentPreview({ envelope }) {
  const [expanded, setExpanded] = useState(false);

  // Only show when there are document pages with images
  const docs = envelope?.documents || [];
  const hasPages = docs.some(d => (d.document_detail?.pages || []).some(p => p.image_url));
  const fieldValues = envelope?.field_values || [];
  const allFields = envelope?.fields || [];
  const attachmentValues = fieldValues.filter(v => v.attachment_url);

  if (!hasPages && !allFields.length) return null;

  // Collect all pages sorted by document order then page number
  const allPages = docs
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .flatMap(d =>
      (d.document_detail?.pages || [])
        .slice()
        .sort((a, b) => a.page_number - b.page_number),
    );

  // Build a lookup: field_key → submitted value string
  const valueByKey = {};
  fieldValues.forEach(v => { if (v.field_key) valueByKey[v.field_key] = v.value; });

  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="section-title" style={{ margin: 0 }}>
          Document Preview
          {fieldValues.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>
              ({fieldValues.length} field{fieldValues.length !== 1 ? 's' : ''} completed)
            </span>
          )}
        </div>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{expanded ? '▲ Collapse' : '▼ Expand'}</span>
      </div>

      {expanded && (
        <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>
          {allPages.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem' }}>
              No rendered page images available.
            </div>
          )}
          {allPages.map((page, pageIndex) => {
            const pageNum = page.page_number || pageIndex + 1;
            const pageW = page.width || 1040;
            const pageH = page.height || 1471;
            const scale = PREVIEW_DOC_WIDTH / pageW;
            const displayH = pageH * scale;
            const pageFields = allFields.filter(f => (f.page != null ? Number(f.page) : 1) === pageNum);

            return (
              <div key={page.id || pageIndex}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Page {pageNum}</div>
                <div style={{ position: 'relative', width: PREVIEW_DOC_WIDTH, height: displayH, background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                  {page.image_url && (
                    <img
                      src={page.image_url}
                      alt={`Page ${pageNum}`}
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
                    />
                  )}
                  {pageFields.map(f => (
                    <EnvelopeFieldOverlay
                      key={f.id}
                      field={f}
                      scale={scale}
                      value={valueByKey[f.field_key] ?? null}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Attachment list */}
          {attachmentValues.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.75rem' }}>📎 Signer Attachments ({attachmentValues.length})</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {attachmentValues.map((v, i) => {
                  const filename = v.metadata?.filename || v.value || `Attachment ${i + 1}`;
                  const ct = (v.metadata?.content_type || '').toLowerCase();
                  const isImage = ct.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(filename);
                  return (
                    <div key={v.id || i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0.75rem', background: '#f8fafc', borderRadius: 6, border: '1px solid var(--border)' }}>
                      <span>{isImage ? '🖼' : '📄'}</span>
                      <span style={{ flex: 1, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filename}</span>
                      <a href={v.attachment_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm" style={{ flexShrink: 0, fontSize: '0.75rem' }}>
                        ⬇ Download
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function EnvelopeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [voidModal, setVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [remindingId, setRemindingId] = useState(null);
  const [delegateModal, setDelegateModal] = useState({ open: false, recipient: null });
  const [delegateForm, setDelegateForm] = useState({ name: '', email: '', reason: '' });

  // ---- Queries ----
  const { data: envelope, isLoading, isError } = useApiQuery(
    ['envelope', id],
    EP.ENVELOPE(id)
  );

  const { data: recipientsData, isLoading: recipientsLoading } = useApiQuery(
    ['recipients', id],
    EP.RECIPIENTS,
    { envelope: id }
  );

  const recipients = recipientsData?.results ?? envelope?.recipients ?? [];

  // ---- Mutations ----
  const sendMutation = useApiMutation(
    () => apiClient.post(EP.ENVELOPE_SEND(id), {}),
    {
      invalidateKeys: ['envelope', 'envelopes', 'envelopes-summary'],
      onSuccess: () => toast.success('Envelope sent successfully'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const voidMutation = useApiMutation(
    (reason) => apiClient.post(EP.ENVELOPE_VOID(id), { reason }),
    {
      invalidateKeys: ['envelope', 'envelopes', 'envelopes-summary'],
      onSuccess: () => {
        toast.success('Envelope voided');
        setVoidModal(false);
        setVoidReason('');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    () => apiClient.delete(EP.ENVELOPE(id)),
    {
      invalidateKeys: ['envelopes', 'envelopes-summary'],
      onSuccess: () => {
        toast.success('Envelope deleted');
        navigate('/envelopes');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const delegateMutation = useApiMutation(
    ({ recipientId, payload }) => apiClient.post(EP.RECIPIENT_DELEGATE(recipientId), payload),
    {
      invalidateKeys: ['envelope', 'recipients', 'envelopes'],
      onSuccess: (res) => {
        toast.success(`Delegated to ${res.data?.name || delegateForm.name}`);
        setDelegateModal({ open: false, recipient: null });
        setDelegateForm({ name: '', email: '', reason: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message || 'Failed to delegate recipient'),
    }
  );

  // Gap #3 — per-recipient reminder
  const handleRemind = useCallback(async (recipientId) => {
    setRemindingId(recipientId);
    try {
      await apiClient.post(EP.RECIPIENT_REMIND(recipientId), {});
      toast.success('Reminder sent');
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Failed to send reminder');
    } finally {
      setRemindingId(null);
    }
  }, [toast]);

  const openDelegateModal = useCallback((recipient) => {
    setDelegateForm({ name: '', email: '', reason: '' });
    setDelegateModal({ open: true, recipient });
  }, []);

  const submitDelegate = useCallback(() => {
    const recipient = delegateModal.recipient;
    const name = delegateForm.name.trim();
    const email = delegateForm.email.trim();
    const reason = delegateForm.reason.trim();
    if (!recipient || !name || !email) return;
    delegateMutation.mutate({
      recipientId: recipient.id,
      payload: { name, email, reason },
    });
  }, [delegateForm, delegateModal.recipient, delegateMutation]);

  // Gap #1 — copy signing link to clipboard
  const copySigningLink = useCallback((r) => {
    const url =
      r.signing_url ||
      r.signing_link ||
      (r.token ? `${window.location.origin}/sign/${r.token}` : null);
    if (!url) {
      toast.info('Signing link not available for this recipient yet.');
      return;
    }
    navigator.clipboard.writeText(url).then(
      () => toast.success(`Signing link copied for ${r.name}`),
      () => toast.error('Could not copy to clipboard'),
    );
  }, [toast]);

  const handleDownload = async () => {
    try {
      const res = await apiClient.get(EP.ENVELOPE_DOWNLOAD(id), { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `envelope-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  if (isLoading) return <Spinner center />;
  if (isError || !envelope) {
    return (
      <div>
        <div className="page-header">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/envelopes')}>← Back</button>
        </div>
        <div className="alert alert-warning" style={{ marginTop: '1rem' }}>Envelope not found or you do not have access.</div>
      </div>
    );
  }

  const isDraft = envelope.status === 'draft';
  const isActionable = ['sent', 'viewed', 'partially_signed'].includes(envelope.status);
  const isCompleted = envelope.status === 'completed';
  const isVoidable = isDraft || isActionable;

  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = envelope.due_date && !['completed', 'voided', 'declined', 'expired'].includes(envelope.status) && envelope.due_date < today;

  const pct = envelope.completion_percent || 0;
  const documents = envelope.documents || [];

  // Gap #2 — resolve template display name and ID
  const templateId = envelope.template_id ?? (typeof envelope.template === 'number' ? envelope.template : null);
  const templateName = envelope.template_name ?? envelope.template_details?.name ?? (templateId ? `Template #${templateId}` : null);

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/envelopes')}>← Back</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
              <h1 className="page-title" style={{ margin: 0 }}>{envelope.name}</h1>
              <Badge color={statusColor(envelope.status)}>{titleCase(envelope.status)}</Badge>
              {isOverdue && <Badge color="danger">OVERDUE</Badge>}
            </div>
            <p className="page-subtitle" style={{ marginTop: '0.25rem' }}>ENV-{envelope.id}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isDraft && (
            <button
              className="btn btn-primary"
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
            >
              {sendMutation.isPending ? 'Sending…' : 'Send'}
            </button>
          )}
          {/* Gap #6 — label reflects completion state */}
          {(isCompleted || isActionable) && (
            <button className="btn btn-ghost" onClick={handleDownload}>
              {isCompleted ? 'Download PDF' : 'Download Partial PDF'}
            </button>
          )}
          {isVoidable && (
            <button
              className="btn btn-ghost"
              style={{ color: 'var(--warning)' }}
              onClick={() => { setVoidReason(''); setVoidModal(true); }}
            >
              Void
            </button>
          )}
          <button
            className="btn btn-ghost"
            style={{ color: 'var(--danger)' }}
            onClick={() => setConfirmDelete(true)}
          >
            Delete
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Status</div>
          <div className="stat-value" style={{ fontSize: '1rem' }}>
            <Badge color={statusColor(envelope.status)}>{titleCase(envelope.status)}</Badge>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Created</div>
          <div className="stat-value" style={{ fontSize: '0.9375rem' }}>{formatDate(envelope.created_at)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Due Date</div>
          <div className="stat-value" style={{ fontSize: '0.9375rem', color: isOverdue ? 'var(--danger)' : undefined }}>
            {envelope.due_date ? formatDate(envelope.due_date) : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completion</div>
          <div className="stat-value">{pct}%</div>
          <div style={{ marginTop: '0.5rem', height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.2fr) minmax(0,0.8fr)', gap: '1.5rem' }}>
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {/* Envelope info card */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="section-title" style={{ marginBottom: '1rem' }}>Envelope Information</div>
            <div className="detail-row">
              <span className="detail-label">Name</span>
              <span className="detail-value">{envelope.name}</span>
            </div>

            {/* Gap #2 — template shown as name with link to form builder */}
            {(templateName || envelope.template) && (
              <div className="detail-row">
                <span className="detail-label">Template</span>
                <span className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span>{templateName || envelope.template}</span>
                  {templateId && (
                    <Link
                      to={`/form-builder/${templateId}`}
                      style={{ fontSize: '0.75rem', color: 'var(--primary)', whiteSpace: 'nowrap' }}
                    >
                      Edit in Builder →
                    </Link>
                  )}
                </span>
              </div>
            )}

            {envelope.message && (
              <div className="detail-row">
                <span className="detail-label">Message</span>
                <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{envelope.message}</span>
              </div>
            )}
            <div className="detail-row">
              <span className="detail-label">Created</span>
              <span className="detail-value">{formatDateTime(envelope.created_at)}</span>
            </div>
            {envelope.sent_at && (
              <div className="detail-row">
                <span className="detail-label">Sent</span>
                <span className="detail-value">{formatDateTime(envelope.sent_at)}</span>
              </div>
            )}
            {envelope.completed_at && (
              <div className="detail-row">
                <span className="detail-label">Completed</span>
                <span className="detail-value">{formatDateTime(envelope.completed_at)}</span>
              </div>
            )}
            {envelope.voided_at && (
              <div className="detail-row">
                <span className="detail-label">Voided</span>
                <span className="detail-value">{formatDateTime(envelope.voided_at)}</span>
              </div>
            )}
            {envelope.void_reason && (
              <div className="detail-row">
                <span className="detail-label">Void Reason</span>
                <span className="detail-value">{envelope.void_reason}</span>
              </div>
            )}
            {envelope.due_date && (
              <div className="detail-row">
                <span className="detail-label">Due Date</span>
                <span className="detail-value" style={{ color: isOverdue ? 'var(--danger)' : undefined }}>
                  {formatDate(envelope.due_date)}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            )}
          </div>

          {/* Documents card */}
          {documents.length > 0 && (
            <div className="card" style={{ padding: '1.25rem' }}>
              <div className="section-title" style={{ marginBottom: '1rem' }}>Documents ({documents.length})</div>
              {documents.map((doc, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.625rem 0',
                    borderBottom: i < documents.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                      {doc.name || doc.filename || doc.original_filename || `Document ${i + 1}`}
                    </div>
                    {doc.page_count && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{doc.page_count} pages</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Document preview with completed field overlays */}
          <EnvelopeDocumentPreview envelope={envelope} />
        </div>

        {/* Right column — recipients */}
        <div>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div className="section-title" style={{ marginBottom: '1rem' }}>
              Recipients {recipientsLoading ? '' : `(${recipients.length})`}
            </div>
            {recipientsLoading ? (
              <Spinner center />
            ) : recipients.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>No recipients.</p>
            ) : (
              <div>
                {recipients.map((r, i) => {
                  const isSigned = ['signed', 'completed'].includes(r.status);
                  const isDeclined = r.status === 'declined';
                  const canRemind = isActionable && !isSigned && !isDeclined;
                  const canDelegate = !['signed', 'completed', 'declined', 'delegated'].includes(r.status || 'pending');
                  const hasSigningLink = !!(r.signing_url || r.signing_link || r.token);

                  return (
                    <div
                      key={r.id || i}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.75rem',
                        padding: '0.75rem 0',
                        borderBottom: i < recipients.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <Avatar name={r.name} size={36} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{r.name}</div>
                        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{r.email}</div>
                        <div style={{ marginTop: 4, display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                          <Badge color="secondary">{titleCase(r.role || 'signer')}</Badge>
                          <Badge color={statusColor(r.status || 'pending')}>{titleCase(r.status || 'pending')}</Badge>
                        </div>
                        {r.signed_at && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Signed {formatDateTime(r.signed_at)}
                          </div>
                        )}
                        {r.viewed_at && !r.signed_at && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                            Viewed {formatDateTime(r.viewed_at)}
                          </div>
                        )}
                        {r.routing_order !== undefined && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Signing order: {r.routing_order}
                          </div>
                        )}
                        {r.delegated_from && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                            Delegated from recipient #{r.delegated_from}
                          </div>
                        )}

                        {/* Gap #1 & #3 — signing link copy + reminder */}
                        {(hasSigningLink || canRemind || canDelegate) && (
                          <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                            {/* Gap #1 — copy signing link */}
                            {hasSigningLink && (isActionable || isCompleted) && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => copySigningLink(r)}
                                title="Copy signing link to clipboard"
                              >
                                🔗 Copy Link
                              </button>
                            )}
                            {/* Gap #3 — send reminder */}
                            {canRemind && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.72rem' }}
                                disabled={remindingId === r.id}
                                onClick={() => handleRemind(r.id)}
                                title="Send a reminder email to this signer"
                              >
                                {remindingId === r.id ? 'Sending…' : '✉ Remind'}
                              </button>
                            )}
                            {canDelegate && (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: '0.72rem' }}
                                onClick={() => openDelegateModal(r)}
                                title="Delegate this recipient to another signer"
                              >
                                ↗ Delegate
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Void Modal */}
      <Modal
        open={voidModal}
        onClose={() => setVoidModal(false)}
        title="Void Envelope"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setVoidModal(false)}>
              Cancel
            </button>
            <button
              className="btn btn-danger"
              onClick={() => voidMutation.mutate(voidReason || 'Voided by admin')}
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
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Envelope"
        message={`Are you sure you want to delete "${envelope.name}"? This removes the record and all related signing data. This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      <Modal
        open={delegateModal.open}
        onClose={() => setDelegateModal({ open: false, recipient: null })}
        title="Delegate Recipient"
        size="sm"
        footer={
          <>
            <button
              className="btn btn-ghost"
              onClick={() => setDelegateModal({ open: false, recipient: null })}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={!delegateForm.name.trim() || !delegateForm.email.trim() || delegateMutation.isPending}
              onClick={submitDelegate}
            >
              {delegateMutation.isPending ? 'Delegating…' : 'Delegate'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Delegating revokes the current signing link for {delegateModal.recipient?.name || 'this recipient'} and issues a new secure link to the delegate.
          </p>
          <div className="form-group">
            <label className="form-label">Delegate Name</label>
            <input
              className="form-input"
              placeholder="Full name"
              value={delegateForm.name}
              onChange={(e) => setDelegateForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Delegate Email</label>
            <input
              className="form-input"
              type="email"
              placeholder="delegate@example.com"
              value={delegateForm.email}
              onChange={(e) => setDelegateForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Reason</label>
            <textarea
              className="form-input"
              rows={3}
              placeholder="Optional reason for the delegation"
              value={delegateForm.reason}
              onChange={(e) => setDelegateForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
