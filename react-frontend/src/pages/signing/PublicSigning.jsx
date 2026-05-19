import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useApiQuery } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import Spinner from '../../components/ui/Spinner';

// ─── Google Fonts ─────────────────────────────────────────────────────────────

const CURSIVE_FONTS = [
  { name: 'Dancing Script', label: 'Dancing Script' },
  { name: 'Pacifico',       label: 'Pacifico' },
  { name: 'Sacramento',     label: 'Sacramento' },
  { name: 'Great Vibes',    label: 'Great Vibes' },
  { name: 'Kaushan Script', label: 'Kaushan Script' },
];

const SIG_COLORS = [
  { label: 'Black', value: '#0f172a' },
  { label: 'Blue',  value: '#1e40af' },
  { label: 'Red',   value: '#991b1b' },
];

const DOC_WIDTH = 1040;

// Load Google Fonts once
let fontsLoaded = false;
function ensureFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const families = CURSIVE_FONTS.map((f) => f.name.replace(/ /g, '+')).join('|');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  document.head.appendChild(link);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PublicSigning() {
  const { token } = useParams();

  const { data: session, isLoading, error } = useApiQuery(
    ['sign', token],
    EP.SIGN(token),
    {},
    { retry: false },
  );

  useEffect(() => { ensureFonts(); }, []);

  // ── State ──────────────────────────────────────────────────────────────────
  const [fieldValues, setFieldValues] = useState({});
  const [signatureData, setSignatureData] = useState(null); // {type, data, font, color}
  const [signatureTab, setSignatureTab] = useState('type');
  const [typedName, setTypedName] = useState('');
  const [typedFont, setTypedFont] = useState(CURSIVE_FONTS[0].name);
  const [typedColor, setTypedColor] = useState(SIG_COLORS[0].value);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [delegated, setDelegated] = useState(null);
  const [declineModal, setDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [delegateModal, setDelegateModal] = useState(false);
  const [delegateForm, setDelegateForm] = useState({ name: '', email: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [delegating, setDelegating] = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [signatureModalFieldId, setSignatureModalFieldId] = useState(null);

  // Canvas drawing
  const canvasRef = useRef(null);
  const drawingRef = useRef({ active: false, strokes: [], current: [] });
  const ctxRef = useRef(null);
  const [penColor, setPenColor] = useState(SIG_COLORS[0].value);
  const [penSize] = useState(2);

  // ── Signature field ids ────────────────────────────────────────────────────
  const fields = session?.fields || session?.form_fields || [];

  // Pages live at session.documents[].document_detail.pages[] (from EnvelopeDocumentSerializer).
  // Collect all pages across all documents in attachment order, then page order.
  const pages = (() => {
    if (session?.documents?.length) {
      return session.documents
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .flatMap((d) =>
          (d.document_detail?.pages ?? [])
            .slice()
            .sort((a, b) => a.page_number - b.page_number),
        );
    }
    // Fallback paths for older response shapes
    return session?.pages ?? session?.document?.pages ?? [];
  })();

  const envelopeName = session?.envelope_subject || session?.envelope_name || 'Document Signing';
  const signerName = session?.signer_name || session?.recipient_name || '';

  // Prefill typed name from signer
  useEffect(() => {
    if (signerName && !typedName) setTypedName(signerName);
  }, [signerName]);

  // ── Canvas init ────────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctxRef.current = ctx;
    drawingRef.current = { active: false, strokes: [], current: [] };
  }, [penColor, penSize]);

  useEffect(() => {
    if (signatureTab === 'draw' && signatureModalOpen) {
      setTimeout(initCanvas, 60);
    }
  }, [signatureTab, signatureModalOpen, initCanvas]);

  // ── Canvas event helpers ───────────────────────────────────────────────────
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (e.touches) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleCanvasMouseDown = (e) => {
    e.preventDefault();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pos = getCanvasPos(e);
    drawingRef.current.active = true;
    drawingRef.current.current = [pos];
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penSize;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const handleCanvasMouseMove = (e) => {
    e.preventDefault();
    if (!drawingRef.current.active) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const pos = getCanvasPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    drawingRef.current.current.push(pos);
  };

  const handleCanvasMouseUp = (e) => {
    if (!drawingRef.current.active) return;
    drawingRef.current.active = false;
    if (drawingRef.current.current.length > 1) {
      drawingRef.current.strokes.push([...drawingRef.current.current]);
    }
    drawingRef.current.current = [];
    ctxRef.current?.closePath();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current.strokes = [];
  };

  const getCanvasDataUrl = () => canvasRef.current?.toDataURL('image/png') || null;

  // ── Signature modal ────────────────────────────────────────────────────────
  const openSignatureModal = (fieldId) => {
    setSignatureModalFieldId(fieldId);
    setSignatureModalOpen(true);
    setSignatureTab('type');
  };

  const applySignature = () => {
    let data = null;
    let type = signatureTab;

    if (signatureTab === 'type') {
      data = { type: 'typed', name: typedName, font: typedFont, color: typedColor };
    } else if (signatureTab === 'draw') {
      const dataUrl = getCanvasDataUrl();
      if (!dataUrl) return;
      data = { type: 'drawn', dataUrl };
    } else if (signatureTab === 'upload') {
      if (!uploadPreview) return;
      data = { type: 'uploaded', dataUrl: uploadPreview };
    }

    if (!data) return;
    setSignatureData(data);

    // Apply to the specific field or all signature fields if none specified
    if (signatureModalFieldId) {
      setFieldValues((prev) => ({ ...prev, [signatureModalFieldId]: data }));
    } else {
      const sigFields = fields.filter((f) => ['signature', 'initials'].includes(f.field_type || f.type));
      const vals = {};
      sigFields.forEach((f) => { vals[f.id] = data; });
      setFieldValues((prev) => ({ ...prev, ...vals }));
    }

    setSignatureModalOpen(false);
    setSignatureModalFieldId(null);
  };

  // ── Field value handling ───────────────────────────────────────────────────
  const setFieldValue = (fieldId, value) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: value }));
  };

  // ── Check completion ───────────────────────────────────────────────────────
  const requiredFields = fields.filter((f) => f.required !== false);
  const allFilled = requiredFields.every((f) => {
    const val = fieldValues[f.id];
    if (val == null || val === '' || val === false) return false;
    return true;
  });

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!allFilled) return;
    setSubmitting(true);
    try {
      // Map id-keyed fieldValues to [{field_key, value}] array the backend expects
      const fieldValuesArr = Object.entries(fieldValues).map(([idStr, val]) => {
        const field = fields.find((f) => String(f.id) === String(idStr));
        let serializedVal;
        if (val && typeof val === 'object' && val.type) {
          serializedVal = val.type === 'typed'
            ? `[TYPED:${val.name}|${val.font}|${val.color}]`
            : val.dataUrl || '';
        } else {
          serializedVal = val ?? '';
        }
        return { field_key: field?.field_key || idStr, value: serializedVal };
      });

      // Map frontend tab name to backend signature_type enum
      const SIG_TYPE_MAP = { type: 'typed', draw: 'drawn', upload: 'uploaded' };
      const sigPayload = signatureData
        ? {
            signature_type: SIG_TYPE_MAP[signatureData.type] || 'typed',
            typed_name: signatureData.type === 'type' ? signatureData.name : (session?.recipient_detail?.name || ''),
            metadata: signatureData.type !== 'type' ? { dataUrl: signatureData.dataUrl } : {},
          }
        : null;

      await apiClient.post(EP.SIGN_SUBMIT(token), {
        field_values: fieldValuesArr,
        ...(sigPayload ? { signature: sigPayload } : {}),
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Submit error', err);
      alert(err.response?.data?.detail || err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Decline ────────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    if (!declineReason.trim()) return;
    setDeclining(true);
    try {
      await apiClient.post(EP.SIGN_DECLINE(token), { action: 'decline', reason: declineReason });
      setDeclined(true);
      setDeclineModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Could not decline. Please try again.');
    } finally {
      setDeclining(false);
    }
  };

  // ── Delegate ───────────────────────────────────────────────────────────────
  const handleDelegate = async () => {
    const name = delegateForm.name.trim();
    const email = delegateForm.email.trim();
    const reason = delegateForm.reason.trim();
    if (!name || !email) return;
    setDelegating(true);
    try {
      const res = await apiClient.post(EP.SIGN(token), { action: 'delegate', name, email, reason });
      setDelegated({ name, email, response: res.data });
      setDelegateModal(false);
    } catch (err) {
      alert(err.response?.data?.detail || err.message || 'Could not delegate. Please try again.');
    } finally {
      setDelegating(false);
    }
  };

  // ── Upload handler ─────────────────────────────────────────────────────────
  const handleUploadSig = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setUploadPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  // ── Render: loading / error ────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
        <Spinner center />
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading signing session…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '3rem' }}>⛔</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Invalid or expired signing link</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {error.response?.data?.detail || error.message || 'This signing link is not valid.'}
        </div>
      </div>
    );
  }

  // ── Render: declined ──────────────────────────────────────────────────────
  if (declined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '3rem' }}>✗</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>Signing Declined</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, textAlign: 'center' }}>
          You have declined to sign this document. The sender will be notified.
        </div>
      </div>
    );
  }

  // ── Render: delegated ─────────────────────────────────────────────────────
  if (delegated) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12, padding: 24 }}>
        <div style={{ fontSize: '3rem' }}>↗</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--primary, #2563eb)' }}>Signing Delegated</div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 460, textAlign: 'center' }}>
          A new signing link was issued to {delegated.name} at {delegated.email}. This signing link has been revoked.
        </div>
      </div>
    );
  }

  // ── Render: submitted / completed ─────────────────────────────────────────
  if (submitted || session?.status === 'completed') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: '3rem' }}>✅</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success, #16a34a)' }}>
          {submitted ? 'Document Signed Successfully' : 'Signing Complete'}
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 440, textAlign: 'center' }}>
          {submitted
            ? 'Thank you! Your signature has been recorded. You will receive a copy via email once all parties have signed.'
            : 'This document has already been completed.'}
        </div>
        {/* Read-only field summary */}
        {submitted && Object.keys(fieldValues).length > 0 && (
          <div style={{ marginTop: 16, maxWidth: 480, width: '100%' }}>
            <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Submitted values:</div>
            {fields.map((f) => {
              const val = fieldValues[f.id];
              if (!val) return null;
              const display = typeof val === 'object' && val.type === 'typed'
                ? `[Signature: ${val.name}]`
                : typeof val === 'object' && val.type
                ? `[${val.type} signature]`
                : String(val);
              return (
                <div key={f.id} style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 120 }}>{f.label}:</span>
                  <span style={{ fontWeight: 500 }}>{display}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Render: main signing UI ───────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* Header */}
      <div style={{
        background: 'white',
        borderBottom: '1px solid var(--border)',
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexShrink: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--primary, #2563eb)', letterSpacing: '-0.02em' }}>HanMak</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Signing</span>
        </div>
        <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>|</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {envelopeName}
          </div>
          {signerName && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Signing as: {signerName}</div>
          )}
        </div>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--primary, #2563eb)', flexShrink: 0 }}
          onClick={() => {
            setDelegateForm({ name: '', email: '', reason: '' });
            setDelegateModal(true);
          }}
        >
          Delegate
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ color: 'var(--danger)', flexShrink: 0 }}
          onClick={() => setDeclineModal(true)}
        >
          Decline to Sign
        </button>
      </div>

      {/* Main layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', flex: 1, overflow: 'hidden', height: 'calc(100vh - 56px)' }}>

        {/* Left: Document pages */}
        <div style={{
          background: '#dbe3ef',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: 24,
          gap: 20,
        }}>
          {pages.length === 0 && (
            <div style={{
              width: DOC_WIDTH,
              minHeight: 400,
              background: 'white',
              borderRadius: 4,
              boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              gap: 12,
              padding: 32,
            }}>
              <div style={{ fontSize: '2.5rem' }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Document preview not available</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 }}>
                Please fill in the required fields on the right panel and submit your signature.
              </div>
            </div>
          )}

          {pages.map((page, pageIndex) => (
            <DocumentSigningPage
              key={pageIndex}
              page={page}
              pageIndex={pageIndex}
              fields={fields}
              fieldValues={fieldValues}
              activeFieldId={activeFieldId}
              onFieldClick={(fid) => {
                setActiveFieldId(fid);
                const field = fields.find((f) => f.id === fid);
                if (field && ['signature', 'initials'].includes(field.field_type || field.type)) {
                  openSignatureModal(fid);
                }
              }}
            />
          ))}
        </div>

        {/* Right: Field form panel */}
        <div style={{
          background: 'white',
          borderLeft: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Progress */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Complete Your Signature</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <div style={{
                flex: 1,
                height: 6,
                background: 'var(--border)',
                borderRadius: 3,
                overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%',
                  width: requiredFields.length > 0
                    ? `${Math.round((requiredFields.filter((f) => {
                        const v = fieldValues[f.id];
                        return v != null && v !== '' && v !== false;
                      }).length / requiredFields.length) * 100)}%`
                    : '0%',
                  background: 'var(--primary, #2563eb)',
                  borderRadius: 3,
                  transition: 'width 0.3s',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 36 }}>
                {requiredFields.length > 0
                  ? `${Math.round((requiredFields.filter((f) => {
                      const v = fieldValues[f.id];
                      return v != null && v !== '' && v !== false;
                    }).length / requiredFields.length) * 100)}%`
                  : '—'}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {requiredFields.filter((f) => { const v = fieldValues[f.id]; return v != null && v !== '' && v !== false; }).length}{' '}
              of {requiredFields.length} required fields completed
            </div>
          </div>

          {/* Field list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {fields.length === 0 && (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                No fields to fill in for this document.
              </div>
            )}
            {fields.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={fieldValues[field.id]}
                isActive={activeFieldId === field.id}
                onClick={() => {
                  setActiveFieldId(field.id);
                  if (['signature', 'initials'].includes(field.field_type || field.type)) {
                    openSignatureModal(field.id);
                  }
                }}
                onChange={(val) => setFieldValue(field.id, val)}
                onOpenSig={() => openSignatureModal(field.id)}
              />
            ))}
          </div>

          {/* Submit */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface, #f8fafc)' }}>
            {!allFilled && (
              <div style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                color: '#92400e',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 12,
                marginBottom: 12,
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}>
                ⚠ Complete all required fields before submitting
              </div>
            )}
            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}
              disabled={!allFilled || submitting}
              onClick={handleSubmit}
            >
              {submitting ? 'Submitting…' : '✓ Submit Signed Document'}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
              By submitting, you agree to the Electronic Signature Terms.
            </div>
          </div>
        </div>
      </div>

      {/* ── Signature Modal ── */}
      {signatureModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSignatureModalOpen(false); }}
        >
          <div style={{
            background: 'white',
            borderRadius: 12,
            width: '100%',
            maxWidth: 620,
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '90vh',
            overflow: 'hidden',
          }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>✍ Apply Your Signature</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Draw, type, or upload your signature</div>
              </div>
              <button
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--text-muted)', padding: '4px 8px' }}
                onClick={() => setSignatureModalOpen(false)}
              >
                ×
              </button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
              {[['type', 'Aa Type'], ['draw', '✏ Draw'], ['upload', '📎 Upload']].map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setSignatureTab(tab)}
                  style={{
                    flex: 1,
                    padding: '12px 0',
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: signatureTab === tab ? 700 : 400,
                    color: signatureTab === tab ? 'var(--primary, #2563eb)' : 'var(--text-secondary)',
                    borderBottom: signatureTab === tab ? '2.5px solid var(--primary, #2563eb)' : '2.5px solid transparent',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Type tab */}
              {signatureTab === 'type' && (
                <div style={{ padding: 20 }}>
                  <div className="form-group">
                    <label className="form-label">Type your full legal name</label>
                    <input
                      className="form-input"
                      type="text"
                      value={typedName}
                      placeholder={signerName || 'Your Name'}
                      onChange={(e) => setTypedName(e.target.value)}
                      style={{ fontSize: 14 }}
                    />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>Choose a signature style:</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                    {CURSIVE_FONTS.map((font) => (
                      <div
                        key={font.name}
                        onClick={() => setTypedFont(font.name)}
                        style={{
                          padding: '16px',
                          border: `2px solid ${typedFont === font.name ? 'var(--primary, #2563eb)' : 'var(--border)'}`,
                          borderRadius: 8,
                          cursor: 'pointer',
                          textAlign: 'center',
                          background: typedFont === font.name ? '#eff6ff' : 'transparent',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ fontFamily: `'${font.name}', cursive`, fontSize: 26, color: typedColor, lineHeight: 1.2 }}>
                          {typedName || 'Signature'}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{font.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Signature color:</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {SIG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => setTypedColor(c.value)}
                          title={c.label}
                          style={{
                            width: 28,
                            height: 28,
                            background: c.value,
                            border: `3px solid ${typedColor === c.value ? '#60a5fa' : 'transparent'}`,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: '16px', textAlign: 'center' }}>
                    <div style={{ fontFamily: `'${typedFont}', cursive`, fontSize: 36, color: typedColor }}>
                      {typedName || 'Preview'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Preview of your signature</div>
                  </div>
                </div>
              )}

              {/* Draw tab */}
              {signatureTab === 'draw' && (
                <div style={{ padding: 20 }}>
                  <div style={{ background: '#f8fafc', border: '2px dashed var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ background: '#1e40af', color: 'white', fontSize: 10, fontWeight: 600, padding: '4px 12px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Draw your signature below
                    </div>
                    <canvas
                      ref={canvasRef}
                      style={{ display: 'block', width: '100%', height: 180, cursor: 'crosshair', background: 'white', touchAction: 'none' }}
                      onMouseDown={handleCanvasMouseDown}
                      onMouseMove={handleCanvasMouseMove}
                      onMouseUp={handleCanvasMouseUp}
                      onMouseLeave={handleCanvasMouseUp}
                      onTouchStart={(e) => { e.preventDefault(); handleCanvasMouseDown(e); }}
                      onTouchMove={(e) => { e.preventDefault(); handleCanvasMouseMove(e); }}
                      onTouchEnd={handleCanvasMouseUp}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Color:</span>
                      {SIG_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => { setPenColor(c.value); if (ctxRef.current) ctxRef.current.strokeStyle = c.value; }}
                          style={{
                            width: 22,
                            height: 22,
                            background: c.value,
                            border: `2.5px solid ${penColor === c.value ? '#60a5fa' : 'transparent'}`,
                            borderRadius: '50%',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        />
                      ))}
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={clearCanvas} style={{ marginLeft: 'auto' }}>
                      🗑 Clear
                    </button>
                  </div>
                </div>
              )}

              {/* Upload tab */}
              {signatureTab === 'upload' && (
                <div style={{ padding: 20 }}>
                  <label style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: 32,
                    border: '2px dashed var(--border)',
                    borderRadius: 10,
                    cursor: 'pointer',
                    background: '#f8fafc',
                    minHeight: 140,
                  }}>
                    {uploadPreview ? (
                      <img src={uploadPreview} alt="Signature preview" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
                    ) : (
                      <>
                        <div style={{ fontSize: '2rem' }}>📎</div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Upload signature image</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PNG or JPG with transparent background · Max 2MB</div>
                      </>
                    )}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleUploadSig} />
                  </label>
                  {uploadPreview && (
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setUploadPreview(null)}>
                      Remove
                    </button>
                  )}
                  <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', background: '#eff6ff', borderRadius: 6, padding: '8px 12px' }}>
                    ℹ Upload a PNG with transparent background for best results.
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              background: 'var(--bg-surface, #f8fafc)',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>
                By applying your signature you agree to the Electronic Signature Terms.
              </div>
              <button className="btn btn-ghost" onClick={() => setSignatureModalOpen(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={applySignature}
                disabled={
                  (signatureTab === 'type' && !typedName.trim()) ||
                  (signatureTab === 'upload' && !uploadPreview)
                }
              >
                ✓ Apply Signature
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Decline Modal ── */}
      {declineModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDeclineModal(false); }}
        >
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Decline to Sign</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Please provide a reason for declining this document.
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea
                className="form-input"
                rows={4}
                placeholder="Explain why you cannot sign this document…"
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDeclineModal(false)}>Cancel</button>
              <button
                className="btn btn-danger"
                disabled={!declineReason.trim() || declining}
                onClick={handleDecline}
              >
                {declining ? 'Declining…' : 'Decline to Sign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delegate Modal ── */}
      {delegateModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 500,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setDelegateModal(false); }}
        >
          <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 460, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Delegate Signing Task</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Delegation revokes this link and emails a new secure link to the delegate.
            </div>
            <div className="form-group">
              <label className="form-label">Delegate Name</label>
              <input
                className="form-input"
                value={delegateForm.name}
                placeholder="Full name"
                onChange={(e) => setDelegateForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Delegate Email</label>
              <input
                className="form-input"
                type="email"
                value={delegateForm.email}
                placeholder="delegate@example.com"
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
                style={{ resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDelegateModal(false)}>Cancel</button>
              <button
                className="btn btn-primary"
                disabled={!delegateForm.name.trim() || !delegateForm.email.trim() || delegating}
                onClick={handleDelegate}
              >
                {delegating ? 'Delegating…' : 'Delegate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DocumentSigningPage ──────────────────────────────────────────────────────

function DocumentSigningPage({ page, pageIndex, fields, fieldValues, activeFieldId, onFieldClick }) {
  const imgUrl = page.image_url || page.url || '';
  const imgW = page.width || DOC_WIDTH;
  const imgH = page.height || 1471;
  const scale = DOC_WIDTH / imgW;
  const displayW = imgW * scale;
  const displayH = imgH * scale;

  const pageFields = fields.filter(
    (f) => (f.page != null ? Number(f.page) - 1 === pageIndex : f.page_index === pageIndex || f.pageIndex === pageIndex),
  );

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>
        Page {pageIndex + 1}
      </div>
      <div style={{ position: 'relative', width: displayW, height: displayH, background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}>
        {imgUrl && (
          <img
            src={imgUrl}
            alt={`Page ${pageIndex + 1}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
          />
        )}
        {pageFields.map((field) => (
          <SigningFieldOverlay
            key={field.id}
            field={field}
            scale={scale}
            value={fieldValues[field.id]}
            isActive={activeFieldId === field.id}
            onClick={() => onFieldClick(field.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── SigningFieldOverlay ──────────────────────────────────────────────────────

function SigningFieldOverlay({ field, scale, value, isActive, onClick }) {
  const fieldType = field.field_type || field.type || 'text';
  const isSig = ['signature', 'initials'].includes(fieldType);
  const filled = value != null && value !== '' && value !== false;
  const color = filled ? '#16a34a' : isActive ? '#2563eb' : '#f59e0b';

  const x = (field.x || 0) * scale;
  const y = (field.y || 0) * scale;
  const w = (field.width || field.w || 160) * scale;
  const h = (field.height || field.h || 32) * scale;

  let content = null;
  if (filled && isSig && value.type === 'typed') {
    content = (
      <span style={{ fontFamily: `'${value.font || 'Dancing Script'}', cursive`, fontSize: h * 0.55, color: value.color || '#1e40af', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {value.name}
      </span>
    );
  } else if (filled && isSig && value.dataUrl) {
    content = <img src={value.dataUrl} alt="Signature" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
  } else if (!filled) {
    content = (
      <span style={{ fontSize: Math.min(11, h * 0.4), fontWeight: 600, color }}>
        {isSig ? `✍ ${fieldType === 'initials' ? 'Add Initials' : 'Click to sign'}` : `▶ ${field.label || fieldType}`}
      </span>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        background: filled ? `${color}12` : `${color}18`,
        border: `${isActive ? '2.5px' : '1.5px'} solid ${color}`,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 4px',
        cursor: 'pointer',
        boxSizing: 'border-box',
        zIndex: 10,
        overflow: 'hidden',
      }}
    >
      {content}
    </div>
  );
}

// ─── FieldInput (right panel) ─────────────────────────────────────────────────

function FieldInput({ field, value, isActive, onClick, onChange, onOpenSig }) {
  const fieldType = field.field_type || field.type || 'text';
  const isSig = ['signature', 'initials'].includes(fieldType);
  const filled = value != null && value !== '' && value !== false;
  const label = field.label || fieldType;
  const required = field.required !== false;

  return (
    <div
      onClick={onClick}
      style={{
        border: `1.5px solid ${isActive ? 'var(--primary, #2563eb)' : filled ? '#16a34a' : 'var(--border)'}`,
        borderRadius: 8,
        padding: '10px 14px',
        background: isActive ? '#eff6ff' : filled ? '#f0fdf4' : 'white',
        cursor: isSig ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
        {filled && <span style={{ color: '#16a34a', marginLeft: 6 }}>✓</span>}
      </label>

      {isSig && (
        <div>
          {filled ? (
            <div style={{ minHeight: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
              {value.type === 'typed' && (
                <span style={{ fontFamily: `'${value.font || 'Dancing Script'}', cursive`, fontSize: 24, color: value.color || '#1e40af' }}>
                  {value.name}
                </span>
              )}
              {value.type === 'drawn' && value.dataUrl && (
                <img src={value.dataUrl} alt="Signature" style={{ maxHeight: 40, maxWidth: '80%', objectFit: 'contain' }} />
              )}
              {value.type === 'uploaded' && value.dataUrl && (
                <img src={value.dataUrl} alt="Signature" style={{ maxHeight: 40, maxWidth: '80%', objectFit: 'contain' }} />
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); onOpenSig(); }}>
                Change
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={(e) => { e.stopPropagation(); onOpenSig(); }}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              ✍ {fieldType === 'initials' ? 'Add Initials' : 'Click to Sign'}
            </button>
          )}
        </div>
      )}

      {fieldType === 'text' && (
        <input
          className="form-input"
          type="text"
          placeholder={`Enter ${label}…`}
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13 }}
        />
      )}

      {fieldType === 'textarea' && (
        <textarea
          className="form-input"
          rows={3}
          placeholder={`Enter ${label}…`}
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13, resize: 'vertical' }}
        />
      )}

      {(fieldType === 'number') && (
        <input
          className="form-input"
          type="number"
          placeholder="0"
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13 }}
        />
      )}

      {(fieldType === 'email') && (
        <input
          className="form-input"
          type="email"
          placeholder="email@example.com"
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13 }}
        />
      )}

      {fieldType === 'date' && (
        <input
          className="form-input"
          type="date"
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13 }}
        />
      )}

      {fieldType === 'checkbox' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}
          onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          {label}
        </label>
      )}

      {(fieldType === 'dropdown' || fieldType === 'select') && (
        <select
          className="form-input"
          value={value || ''}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: 13 }}
        >
          <option value="">Select an option…</option>
          {(field.options || []).map((opt, i) => (
            <option key={i} value={opt}>{opt}</option>
          ))}
        </select>
      )}

      {fieldType === 'attachment' && (
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="file"
            style={{ fontSize: 12 }}
            onChange={(e) => {
              const file = e.target.files[0];
              if (file) onChange(file.name);
            }}
          />
          {value && (
            <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ {value}</div>
          )}
        </div>
      )}
    </div>
  );
}
