import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useApiQuery } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CURSIVE_FONTS = [
  { name: 'Dancing Script', label: 'Dancing Script' },
  { name: 'Pacifico',       label: 'Pacifico' },
  { name: 'Sacramento',     label: 'Sacramento' },
  { name: 'Great Vibes',    label: 'Great Vibes' },
  { name: 'Kaushan Script', label: 'Kaushan Script' },
];

const SIG_COLORS = [
  { label: 'Navy',  value: '#1e3a5f' },
  { label: 'Black', value: '#0f172a' },
  { label: 'Blue',  value: '#1e40af' },
  { label: 'Dark',  value: '#374151' },
  { label: 'Red',   value: '#991b1b' },
];

const DOC_WIDTH = 1040;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function signingPages(session) {
  return (session?.documents || [])
    .flatMap(link => link?.document_detail?.pages || [])
    .sort((a, b) => Number(a.page_number || 1) - Number(b.page_number || 1));
}

function fieldValueDisplay(value) {
  if (value == null || value === false || value === '') return '';
  if (value instanceof File) return value.name;
  if (typeof value === 'object' && value.type === 'typed') return value.name || '';
  if (typeof value === 'object' && value.type) return `[${value.type} signature]`;
  return String(value);
}

function signaturePayload(value, fallbackName = '') {
  if (!value || typeof value !== 'object' || !value.type) return null;
  if (value.type === 'typed') {
    return {
      value: value.name || fallbackName,
      metadata: { signature_style: { family: 'script', font: value.font, color: value.color } },
    };
  }
  return {
    value: value.dataUrl || '',
    metadata: { image_data_url: value.dataUrl || '', signature_style: { color: value.color || '#0f172a' } },
  };
}

function nameInitials(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase() || '').join('.');
}

let fontsLoaded = false;
function ensureFonts() {
  if (fontsLoaded) return;
  fontsLoaded = true;
  const families = CURSIVE_FONTS.map(f => f.name.replace(/ /g, '+')).join('|');
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
  document.head.appendChild(link);
}

// ─── WorkflowStep ──────────────────────────────────────────────────────────────

function WorkflowStep({ num, title, desc, status }) {
  const dotBg   = status === 'completed' ? 'var(--success, #16a34a)' : status === 'current' ? 'var(--primary, #2563eb)' : '#cbd5e1';
  const border  = status === 'current'   ? 'var(--primary, #2563eb)' : status === 'completed' ? '#bbf7d0' : 'var(--border)';
  const cardBg  = status === 'current'   ? '#eff6ff'                 : status === 'completed' ? '#f0fdf4' : 'transparent';
  const textClr = status === 'pending'   ? 'var(--text-muted)'       : 'var(--text-primary)';
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 10px', borderRadius: 7, marginBottom: 5, border: `1.5px solid ${border}`, background: cardBg }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: dotBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
        {status === 'completed' ? '✓' : String(num)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: textClr }}>{title}</div>
        {desc && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>}
      </div>
    </div>
  );
}

// ─── PartyRow ──────────────────────────────────────────────────────────────────

function PartyRow({ name, role, status, color }) {
  const c = color === 'success' ? '#16a34a' : color === 'warning' ? '#d97706' : '#94a3b8';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#475569', flexShrink: 0 }}>
        {nameInitials(name)}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{name}</div>
        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{role}</div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: `${c}22`, color: c }}>{status}</span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function PublicSigning() {
  const { token } = useParams();
  const toast = useToast();

  const { data: session, isLoading, error } = useApiQuery(
    ['sign', token], EP.SIGN(token), {}, { retry: false },
  );

  useEffect(() => { ensureFonts(); }, []);

  // ── Core state ─────────────────────────────────────────────────────────────
  const [fieldValues, setFieldValues]     = useState({});
  const [submitted, setSubmitted]         = useState(false);
  const [declined, setDeclined]           = useState(false);
  const [declineModal, setDeclineModal]   = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [declining, setDeclining]         = useState(false);
  const [activeFieldId, setActiveFieldId] = useState(null);

  // ── Signing flow ────────────────────────────────────────────────────────────
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentModal, setConsentModal]       = useState(false);
  const [consentCheck1, setConsentCheck1]     = useState(false);
  const [consentCheck2, setConsentCheck2]     = useState(false);
  const [auditEvents, setAuditEvents]         = useState([
    { event: 'Document opened', time: 'just now', user: '' },
  ]);

  // ── Signature modal ─────────────────────────────────────────────────────────
  const [signatureModalOpen, setSignatureModalOpen]     = useState(false);
  const [signatureModalFieldId, setSignatureModalFieldId] = useState(null);
  const [signatureTab, setSignatureTab]                 = useState('draw');
  const [typedName, setTypedName]                       = useState('');
  const [typedFont, setTypedFont]                       = useState(CURSIVE_FONTS[0].name);
  const [typedColor, setTypedColor]                     = useState(SIG_COLORS[0].value);
  const [penColor, setPenColor]                         = useState(SIG_COLORS[0].value);
  const [uploadPreview, setUploadPreview]               = useState(null);

  const canvasRef  = useRef(null);
  const drawingRef = useRef({ active: false, strokes: [], current: [] });
  const ctxRef     = useRef(null);

  // ── Initials modal ──────────────────────────────────────────────────────────
  const [initialsModalOpen, setInitialsModalOpen]       = useState(false);
  const [initialsModalFieldId, setInitialsModalFieldId] = useState(null);
  const [initialsText, setInitialsText]                 = useState('');
  const [initialsFont, setInitialsFont]                 = useState(CURSIVE_FONTS[0].name);
  const [initialsColor, setInitialsColor]               = useState(SIG_COLORS[0].value);

  // ── Session data ────────────────────────────────────────────────────────────
  const fields      = session?.fields || [];
  const pages       = signingPages(session);
  const envelopeName = session?.envelope_detail?.name || 'Document Signing';
  const signerName   = session?.recipient_detail?.name || '';
  const signerRole   = session?.recipient_detail?.role || '';
  const envelopeId   = session?.envelope_detail?.id;

  useEffect(() => {
    if (signerName) {
      if (!typedName)    setTypedName(signerName);
      if (!initialsText) setInitialsText(nameInitials(signerName));
    }
  }, [signerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const sigFields      = fields.filter(f => (f.field_type || f.type) === 'signature');
  const initialsFields = fields.filter(f => (f.field_type || f.type) === 'initials');
  const staticTypes    = new Set(['label', 'divider', 'pagebreak']);
  const requiredFields = fields.filter(f => f.required !== false && !staticTypes.has(f.field_type || f.type));

  const isFieldFilled = useCallback((f) => {
    const val = fieldValues[f.id];
    if (val == null || val === '' || val === false) return false;
    if ((f.field_type || f.type) === 'attachment' && !(val instanceof File)) return false;
    return true;
  }, [fieldValues]);

  const allFilled   = requiredFields.every(isFieldFilled);
  const sigFilled   = sigFields.length === 0 || sigFields.every(isFieldFilled);
  const initsFilled = initialsFields.length === 0 || initialsFields.every(isFieldFilled);
  const filledCount = requiredFields.filter(isFieldFilled).length;

  const phase = useMemo(() => {
    if (submitted) return 'done';
    if (!allFilled) return 'fields';
    if (!consentAccepted) return 'consent';
    if (!sigFilled && sigFields.length > 0) return 'signature';
    if (!initsFilled && initialsFields.length > 0) return 'initials';
    return 'submit';
  }, [submitted, allFilled, consentAccepted, sigFilled, sigFields.length, initsFilled, initialsFields.length]);

  const overallSteps = 2 + (sigFields.length > 0 ? 1 : 0) + (initialsFields.length > 0 ? 1 : 0) + 1;
  const overallDone  = (allFilled ? 1 : 0) + (consentAccepted ? 1 : 0)
    + (sigFilled && sigFields.length > 0 ? 1 : 0)
    + (initsFilled && initialsFields.length > 0 ? 1 : 0)
    + (submitted ? 1 : 0);
  const overallPct = submitted ? 100 : Math.round((overallDone / overallSteps) * 100);

  // ── Audit helper ────────────────────────────────────────────────────────────
  const addAudit = useCallback((event) => {
    setAuditEvents(prev => [{ event, time: 'just now', user: signerName || 'You' }, ...prev.slice(0, 15)]);
  }, [signerName]);

  // ── Canvas draw ─────────────────────────────────────────────────────────────
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr  = window.devicePixelRatio || 1;
    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = penColor;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    ctxRef.current  = ctx;
    drawingRef.current = { active: false, strokes: [], current: [] };
  }, [penColor]);

  useEffect(() => {
    if (signatureTab === 'draw' && signatureModalOpen) setTimeout(initCanvas, 60);
  }, [signatureTab, signatureModalOpen, initCanvas]);

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onCanvasDown = (e) => {
    e.preventDefault();
    const ctx = ctxRef.current; if (!ctx) return;
    const pos = getPos(e);
    drawingRef.current.active  = true;
    drawingRef.current.current = [pos];
    ctx.strokeStyle = penColor;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const onCanvasMove = (e) => {
    e.preventDefault();
    if (!drawingRef.current.active) return;
    const ctx = ctxRef.current; if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    drawingRef.current.current.push(pos);
  };

  const onCanvasUp = () => {
    if (!drawingRef.current.active) return;
    drawingRef.current.active = false;
    if (drawingRef.current.current.length > 1)
      drawingRef.current.strokes.push([...drawingRef.current.current]);
    drawingRef.current.current = [];
    ctxRef.current?.closePath();
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx    = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawingRef.current.strokes = [];
  };

  const undoStroke = () => {
    const canvas = canvasRef.current;
    const ctx    = ctxRef.current;
    if (!canvas || !ctx || !drawingRef.current.strokes.length) return;
    drawingRef.current.strokes.pop();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = penColor;
    ctx.lineWidth   = 2;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';
    drawingRef.current.strokes.forEach(stroke => {
      if (stroke.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(stroke[0].x, stroke[0].y);
      stroke.slice(1).forEach(pt => ctx.lineTo(pt.x, pt.y));
      ctx.stroke();
      ctx.closePath();
    });
  };

  // ── Signature modal ─────────────────────────────────────────────────────────
  const openSignatureModal = (fieldId = null) => {
    setSignatureModalFieldId(fieldId);
    setSignatureModalOpen(true);
    setSignatureTab('draw');
  };

  const applySignature = () => {
    let data = null;
    if (signatureTab === 'draw') {
      const dataUrl = canvasRef.current?.toDataURL('image/png');
      if (!dataUrl) return;
      data = { type: 'drawn', dataUrl };
    } else if (signatureTab === 'type') {
      if (!typedName.trim()) return;
      data = { type: 'typed', name: typedName, font: typedFont, color: typedColor };
    } else if (signatureTab === 'upload') {
      if (!uploadPreview) return;
      data = { type: 'uploaded', dataUrl: uploadPreview };
    }
    if (!data) return;
    if (signatureModalFieldId) {
      setFieldValues(prev => ({ ...prev, [signatureModalFieldId]: data }));
    } else {
      const vals = {};
      sigFields.forEach(f => { vals[f.id] = data; });
      setFieldValues(prev => ({ ...prev, ...vals }));
    }
    setSignatureModalOpen(false);
    setSignatureModalFieldId(null);
    addAudit('Signature applied');
    toast.success('Signature applied');
  };

  // ── Initials modal ──────────────────────────────────────────────────────────
  const openInitialsModal = (fieldId = null) => {
    setInitialsModalFieldId(fieldId);
    setInitialsModalOpen(true);
  };

  const applyInitials = () => {
    if (!initialsText.trim()) return;
    const data = { type: 'typed', name: initialsText, font: initialsFont, color: initialsColor };
    if (initialsModalFieldId) {
      setFieldValues(prev => ({ ...prev, [initialsModalFieldId]: data }));
    } else {
      const vals = {};
      initialsFields.forEach(f => { vals[f.id] = data; });
      setFieldValues(prev => ({ ...prev, ...vals }));
    }
    setInitialsModalOpen(false);
    setInitialsModalFieldId(null);
    addAudit('Initials applied');
    toast.success('Initials applied');
  };

  // ── Consent ─────────────────────────────────────────────────────────────────
  const handleConsentAccept = () => {
    if (!consentCheck1 || !consentCheck2) {
      toast.error('Please accept both items before continuing');
      return;
    }
    setConsentAccepted(true);
    setConsentModal(false);
    addAudit('Electronic signature consent accepted');
    toast.success('Consent accepted');
    if (sigFields.length > 0) setTimeout(() => openSignatureModal(sigFields[0].id), 300);
  };

  // ── Field value change ──────────────────────────────────────────────────────
  const setFieldValue = (fieldId, value) => {
    setFieldValues(prev => ({ ...prev, [fieldId]: value }));
    const f = fields.find(f => f.id === fieldId);
    if (f && value != null && value !== '' && value !== false)
      addAudit(`Field filled: ${f.label || f.field_type || 'field'}`);
  };

  // ── Primary action ──────────────────────────────────────────────────────────
  const handlePrimaryAction = () => {
    if (phase === 'fields') {
      const first = requiredFields.find(f => !isFieldFilled(f));
      if (first) {
        document.getElementById(`field-input-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setActiveFieldId(first.id);
      }
      return;
    }
    if (phase === 'consent') { setConsentModal(true); return; }
    if (phase === 'signature') {
      const first = sigFields.find(f => !isFieldFilled(f));
      openSignatureModal(first?.id || null);
      return;
    }
    if (phase === 'initials') {
      const first = initialsFields.find(f => !isFieldFilled(f));
      openInitialsModal(first?.id || null);
      return;
    }
    if (phase === 'submit') handleSubmit();
  };

  const primaryLabel = () => {
    if (phase === 'fields')    return allFilled ? 'Continue to E-Signature Consent →' : 'Complete Required Fields First';
    if (phase === 'consent')   return 'Continue to E-Signature Consent →';
    if (phase === 'signature') return 'Apply Your Signature';
    if (phase === 'initials')  return 'Add Your Initials';
    if (phase === 'submit')    return submitting ? 'Submitting…' : '✓ Submit Signed Document';
    return '✓ Submitted';
  };

  const primaryClass = () => {
    if (phase === 'submit') return 'btn btn-success';
    if (phase === 'done')   return 'btn btn-secondary';
    return 'btn btn-primary';
  };

  const primaryDisabled = () => {
    if (submitting) return true;
    if (phase === 'done') return true;
    return false;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!allFilled) return;
    setSubmitting(true);
    try {
      const field_values = fields
        .filter(f => Object.prototype.hasOwnProperty.call(fieldValues, f.id))
        .map(f => {
          const val = fieldValues[f.id];
          const fk  = f.field_key || String(f.id);
          if (val instanceof File)
            return { field_key: fk, value: val.name, metadata: { filename: val.name, content_type: val.type, size: val.size } };
          if (val && typeof val === 'object' && val.type) {
            const sig = signaturePayload(val, signerName);
            return { field_key: fk, value: sig?.value || '', metadata: sig?.metadata || {} };
          }
          return { field_key: fk, value: (f.field_type || f.type) === 'checkbox' ? String(Boolean(val)) : String(val ?? ''), metadata: {} };
        });

      const firstSig = Object.values(fieldValues).find(v => v && typeof v === 'object' && v.type);
      const sigPay   = signaturePayload(firstSig, signerName);
      const payload  = {
        consent_text: 'Accepted electronic signature consent.',
        field_values,
        signature: sigPay ? {
          signature_type: firstSig.type === 'typed' ? 'typed' : firstSig.type === 'drawn' ? 'drawn' : 'uploaded',
          typed_name: firstSig.type === 'typed' ? sigPay.value : signerName,
          metadata: sigPay.metadata,
        } : null,
      };

      if (Object.values(fieldValues).some(v => v instanceof File)) {
        const fd = new FormData();
        fd.append('payload', JSON.stringify(payload));
        fields.forEach(f => {
          const v = fieldValues[f.id];
          if (v instanceof File) fd.append(`attachment__${f.field_key || f.id}`, v);
        });
        await apiClient.post(EP.SIGN_SUBMIT(token), fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await apiClient.post(EP.SIGN_SUBMIT(token), payload);
      }
      setSubmitted(true);
      addAudit('Document submitted for approval');
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Decline ─────────────────────────────────────────────────────────────────
  const handleDecline = async () => {
    if (!declineReason.trim()) return;
    setDeclining(true);
    try {
      await apiClient.post(EP.SIGN_DECLINE(token), { action: 'decline', reason: declineReason });
      setDeclined(true);
      setDeclineModal(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || 'Could not decline.');
    } finally {
      setDeclining(false);
    }
  };

  // ── Download copy ────────────────────────────────────────────────────────────
  const handleDownloadCopy = async () => {
    if (!envelopeId) { toast.error('Envelope not available'); return; }
    try {
      const resp = await apiClient.get(EP.ENVELOPE_DOWNLOAD(envelopeId), { responseType: 'blob' });
      const url  = URL.createObjectURL(resp.data);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${envelopeName.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch {
      toast.error('Download not available yet');
    }
  };

  // ── Workflow steps ──────────────────────────────────────────────────────────
  const workflowSteps = useMemo(() => {
    const steps = [];
    let n = 1;
    steps.push({ num: n++, title: 'Open Document', desc: 'Review all pages of the agreement', status: 'completed' });
    steps.push({
      num: n++, title: 'Fill Required Fields',
      desc: requiredFields.length > 0
        ? `${filledCount} of ${requiredFields.length} completed${allFilled ? '' : ` — ${requiredFields.length - filledCount} remaining`}`
        : 'No required fields',
      status: allFilled ? 'completed' : 'current',
    });
    steps.push({
      num: n++, title: 'E-Signature Consent',
      desc: 'Accept the electronic signature disclosure',
      status: consentAccepted ? 'completed' : allFilled ? 'current' : 'pending',
    });
    if (sigFields.length > 0) steps.push({
      num: n++, title: 'Apply Your Signature',
      desc: 'Draw or type your signature',
      status: sigFilled ? 'completed' : consentAccepted ? 'current' : 'pending',
    });
    if (initialsFields.length > 0) steps.push({
      num: n++, title: 'Add Initials',
      desc: 'Confirm agreement with initials',
      status: initsFilled ? 'completed'
        : (consentAccepted && (sigFilled || sigFields.length === 0)) ? 'current'
        : 'pending',
    });
    steps.push({
      num: n, title: 'Submit Document',
      desc: 'Send for final processing and approval',
      status: submitted ? 'completed' : phase === 'submit' ? 'current' : 'pending',
    });
    return steps;
  }, [allFilled, consentAccepted, sigFilled, initsFilled, submitted, filledCount, requiredFields.length, sigFields.length, initialsFields.length, phase]);

  // ── Parties ─────────────────────────────────────────────────────────────────
  const parties = useMemo(() => {
    const recipients = session?.envelope_detail?.recipients || [];
    if (recipients.length > 0) {
      return recipients.map(r => ({
        name:   r.name  || 'Unknown',
        role:   r.role  || 'Signer',
        status: r.status === 'signed' || r.signed_at ? 'Signed'
          : r.id === session?.recipient_detail?.id ? (submitted ? 'Submitted' : 'In Progress')
          : 'Pending',
        color: r.status === 'signed' || r.signed_at ? 'success'
          : r.id === session?.recipient_detail?.id ? 'warning'
          : 'gray',
      }));
    }
    return signerName ? [{
      name: signerName,
      role: signerRole || 'Signer',
      status: submitted ? 'Submitted' : 'In Progress',
      color: submitted ? 'success' : 'warning',
    }] : [];
  }, [session, signerName, signerRole, submitted]);

  // ── Alert ────────────────────────────────────────────────────────────────────
  const alert = (() => {
    if (phase === 'fields' && !allFilled)
      return { type: 'warning', msg: `${requiredFields.length - filledCount} required field${requiredFields.length - filledCount === 1 ? '' : 's'} remaining.` };
    if (phase === 'consent')
      return { type: 'info', msg: 'All fields complete. Accept the e-signature consent to continue.' };
    if (phase === 'signature')
      return { type: 'info', msg: 'Consent accepted. Apply your signature to continue.' };
    if (phase === 'initials')
      return { type: 'info', msg: 'Signature applied. Add your initials to confirm.' };
    if (phase === 'submit')
      return { type: 'success', msg: 'Signing package is ready. Submit to complete.' };
    return null;
  })();
  const alertColors = {
    warning: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', icon: '⚠' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: 'ℹ' },
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46', icon: '✓' },
  };

  // ── Render: loading / error / status screens ────────────────────────────────
  if (isLoading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 16 }}>
      <Spinner center />
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Loading signing session…</div>
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '3rem' }}>⛔</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>Invalid or expired signing link</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>{error.response?.data?.detail || error.message || 'This signing link is not valid.'}</div>
    </div>
  );

  if (declined) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '3rem' }}>✗</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--danger)' }}>Signing Declined</div>
      <div style={{ fontSize: 14, color: 'var(--text-muted)', maxWidth: 400, textAlign: 'center' }}>You have declined to sign this document. The sender will be notified.</div>
    </div>
  );

  if (submitted || session?.is_completed || session?.status === 'submitted' || session?.envelope_detail?.status === 'completed') return (
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
    </div>
  );

  // ── Main render ─────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f1f5f9' }}>

      {/* ── Header ── */}
      <div style={{ background: 'white', borderBottom: '1px solid var(--border)', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 17, color: 'var(--primary, #2563eb)', letterSpacing: '-0.02em' }}>HanMak</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Signing</span>
        </div>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{envelopeName}</div>
          {signerName && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Signing as: <strong>{signerName}</strong>
              {signerRole ? ` · ${signerRole}` : ''}
              {requiredFields.length - filledCount > 0
                ? ` · ${requiredFields.length - filledCount} field${requiredFields.length - filledCount === 1 ? '' : 's'} remaining`
                : ' · All fields complete'}
            </div>
          )}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 10, background: '#fef9c3', color: '#854d0e', flexShrink: 0 }}>In Progress</span>
        <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={handleDownloadCopy}>Download Copy</button>
        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)', flexShrink: 0 }} onClick={() => setDeclineModal(true)}>Decline</button>
      </div>

      {/* ── 2-panel layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', flex: 1, overflow: 'hidden', height: 'calc(100vh - 56px)' }}>

        {/* ── Left: Document ── */}
        <div style={{ background: '#dbe3ef', overflowY: 'auto', overflowX: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '28px 32px', gap: 20 }}>
          {pages.length === 0 && (
            <div style={{ width: 680, minHeight: 400, background: 'white', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, padding: 32 }}>
              <div style={{ fontSize: '2.5rem' }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Document preview not available</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 360 }}>Fill in the required fields in the right panel and submit your signature.</div>
            </div>
          )}
          {pages.map((page, pi) => (
            <DocumentPage
              key={pi}
              page={page}
              pageIndex={pi}
              pageTotal={pages.length}
              fields={fields}
              fieldValues={fieldValues}
              activeFieldId={activeFieldId}
              onFieldClick={(fid) => {
                setActiveFieldId(fid);
                const f  = fields.find(f => f.id === fid);
                const ft = f?.field_type || f?.type;
                if (ft === 'signature') openSignatureModal(fid);
                else if (ft === 'initials') openInitialsModal(fid);
                else document.getElementById(`field-input-${fid}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
            />
          ))}
          {pages.length > 1 && (
            <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>
              {pages.length} pages total
            </div>
          )}
        </div>

        {/* ── Right: Workflow panel ── */}
        <div style={{ background: 'white', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Progress header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Signing Progress</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary, #2563eb)' }}>{overallPct}%</span>
            </div>
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${overallPct}%`, background: 'var(--primary, #2563eb)', borderRadius: 3, transition: 'width 0.35s' }} />
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>

            {/* Workflow steps */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Workflow Steps</div>
              {workflowSteps.map(s => <WorkflowStep key={s.num} {...s} />)}
            </div>

            {/* Required fields */}
            {fields.filter(f => !staticTypes.has(f.field_type || f.type)).length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
                  Required Fields
                  <span style={{ marginLeft: 6, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                    ({filledCount}/{requiredFields.length})
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {fields
                    .filter(f => !staticTypes.has(f.field_type || f.type))
                    .map(field => (
                      <FieldInput
                        key={field.id}
                        field={field}
                        value={fieldValues[field.id]}
                        isActive={activeFieldId === field.id}
                        onClick={() => {
                          setActiveFieldId(field.id);
                          const ft = field.field_type || field.type;
                          if (ft === 'signature') openSignatureModal(field.id);
                          else if (ft === 'initials') openInitialsModal(field.id);
                        }}
                        onChange={val => setFieldValue(field.id, val)}
                        onOpenSig={() => openSignatureModal(field.id)}
                        onOpenInitials={() => openInitialsModal(field.id)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Parties */}
            {parties.length > 0 && (
              <div style={{ marginBottom: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Parties</div>
                {parties.map((p, i) => <PartyRow key={i} {...p} />)}
              </div>
            )}

            {/* Audit trail */}
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Audit Trail</div>
              {auditEvents.slice(0, 8).map((e, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 7, paddingLeft: 10, borderLeft: '2px solid var(--border)' }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.event}</span><br />
                  {e.user && `${e.user} · `}{e.time}
                </div>
              ))}
            </div>
          </div>

          {/* Footer: alert + action button */}
          <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--bg-surface, #f8fafc)' }}>
            {alert && (() => {
              const ac = alertColors[alert.type];
              return (
                <div style={{ background: ac.bg, border: `1px solid ${ac.border}`, color: ac.text, borderRadius: 6, padding: '7px 11px', fontSize: 12, marginBottom: 10, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ flexShrink: 0 }}>{ac.icon}</span> {alert.msg}
                </div>
              );
            })()}
            <button
              className={primaryClass()}
              style={{ width: '100%', justifyContent: 'center', fontSize: 13, fontWeight: 600 }}
              disabled={primaryDisabled()}
              onClick={handlePrimaryAction}
            >
              {primaryLabel()}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 7, textAlign: 'center' }}>
              By submitting, you agree to the Electronic Signature Terms.
            </div>
          </div>
        </div>
      </div>

      {/* ── Signature Modal ── */}
      {signatureModalOpen && (
        <Modal onClose={() => setSignatureModalOpen(false)} maxWidth={620}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>✍ Apply Your Signature</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Draw, type, or upload your signature</div>
            </div>
            <ModalClose onClick={() => setSignatureModalOpen(false)} />
          </div>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[['draw', '✏ Draw'], ['type', 'Aa Type'], ['upload', '📎 Upload']].map(([tab, label]) => (
              <button key={tab} onClick={() => setSignatureTab(tab)} style={{ flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: signatureTab === tab ? 700 : 400, color: signatureTab === tab ? 'var(--primary,#2563eb)' : 'var(--text-muted)', borderBottom: `2.5px solid ${signatureTab === tab ? 'var(--primary,#2563eb)' : 'transparent'}`, transition: 'all 0.15s' }}>
                {label}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {signatureTab === 'draw' && (
              <div style={{ padding: 20 }}>
                <div style={{ background: '#f8fafc', border: '2px dashed var(--border)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                  <div style={{ background: '#1e40af', color: 'white', fontSize: 10, fontWeight: 600, padding: '4px 12px', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Draw your signature in the area below
                  </div>
                  <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: 180, cursor: 'crosshair', background: 'white', touchAction: 'none' }}
                    onMouseDown={onCanvasDown} onMouseMove={onCanvasMove} onMouseUp={onCanvasUp} onMouseLeave={onCanvasUp}
                    onTouchStart={e => { e.preventDefault(); onCanvasDown(e); }}
                    onTouchMove={e => { e.preventDefault(); onCanvasMove(e); }}
                    onTouchEnd={onCanvasUp}
                  />
                  <div style={{ position: 'absolute', bottom: 36, left: '20%', right: '20%', borderBottom: '1.5px solid #94a3b8', pointerEvents: 'none' }} />
                  <div style={{ textAlign: 'center', padding: '4px 0 6px', fontSize: 10, color: 'var(--text-muted)' }}>Sign above the line</div>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Color:</span>
                  {SIG_COLORS.map(c => (
                    <button key={c.value} onClick={() => { setPenColor(c.value); if (ctxRef.current) ctxRef.current.strokeStyle = c.value; }}
                      style={{ width: 22, height: 22, background: c.value, border: `2.5px solid ${penColor === c.value ? '#60a5fa' : 'transparent'}`, borderRadius: '50%', cursor: 'pointer', padding: 0 }} />
                  ))}
                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    <button className="btn btn-ghost btn-sm" onClick={undoStroke}>↩ Undo</button>
                    <button className="btn btn-ghost btn-sm" onClick={clearCanvas}>🗑 Clear</button>
                  </div>
                </div>
              </div>
            )}
            {signatureTab === 'type' && (
              <div style={{ padding: 20 }}>
                <div className="form-group">
                  <label className="form-label">Type your full legal name</label>
                  <input className="form-input" type="text" value={typedName} placeholder={signerName || 'Your Name'} onChange={e => setTypedName(e.target.value)} style={{ fontSize: 14 }} />
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Choose a signature style:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {CURSIVE_FONTS.map(font => (
                    <div key={font.name} onClick={() => setTypedFont(font.name)} style={{ padding: 14, border: `2px solid ${typedFont === font.name ? 'var(--primary,#2563eb)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: typedFont === font.name ? '#eff6ff' : 'transparent', transition: 'all 0.15s' }}>
                      <div style={{ fontFamily: `'${font.name}', cursive`, fontSize: 24, color: typedColor, lineHeight: 1.2 }}>{typedName || 'Signature'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{font.label}</div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Signature color:</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    {SIG_COLORS.map(c => (
                      <button key={c.value} onClick={() => setTypedColor(c.value)} title={c.label}
                        style={{ width: 28, height: 28, background: c.value, border: `3px solid ${typedColor === c.value ? '#60a5fa' : 'transparent'}`, borderRadius: '50%', cursor: 'pointer', padding: 0 }} />
                    ))}
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontFamily: `'${typedFont}', cursive`, fontSize: 36, color: typedColor }}>{typedName || 'Preview'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Preview of your signature</div>
                  </div>
                </div>
              </div>
            )}
            {signatureTab === 'upload' && (
              <div style={{ padding: 20 }}>
                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32, border: '2px dashed var(--border)', borderRadius: 10, cursor: 'pointer', background: '#f8fafc', minHeight: 140 }}>
                  {uploadPreview
                    ? <img src={uploadPreview} alt="sig preview" style={{ maxHeight: 100, maxWidth: '100%', objectFit: 'contain' }} />
                    : (<><div style={{ fontSize: '2rem' }}>📎</div><div style={{ fontWeight: 600 }}>Upload signature image</div><div style={{ fontSize: 12, color: 'var(--text-muted)' }}>PNG or JPG with transparent background</div></>)}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = ev => setUploadPreview(ev.target.result); r.readAsDataURL(f); } }} />
                </label>
                {uploadPreview && <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setUploadPreview(null)}>Remove</button>}
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-muted)', background: '#eff6ff', borderRadius: 6, padding: '8px 12px' }}>ℹ Upload a PNG with a transparent background for best results.</div>
              </div>
            )}
          </div>
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, background: 'var(--bg-surface,#f8fafc)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1 }}>By applying your signature you agree to the Electronic Signature Terms.</div>
            <button className="btn btn-ghost" onClick={() => setSignatureModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={applySignature} disabled={(signatureTab === 'type' && !typedName.trim()) || (signatureTab === 'upload' && !uploadPreview)}>
              ✓ Apply Signature
            </button>
          </div>
        </Modal>
      )}

      {/* ── Initials Modal ── */}
      {initialsModalOpen && (
        <Modal onClose={() => setInitialsModalOpen(false)} maxWidth={420}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>✦ Add Initials</div>
            <ModalClose onClick={() => setInitialsModalOpen(false)} />
          </div>
          <div style={{ padding: 20 }}>
            <div className="form-group">
              <label className="form-label">Your initials</label>
              <input className="form-input" type="text" value={initialsText} placeholder="e.g. S.J." maxLength={6} onChange={e => setInitialsText(e.target.value)} style={{ fontSize: 22, textAlign: 'center', letterSpacing: '0.2em' }} />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Style:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              {CURSIVE_FONTS.slice(0, 4).map(font => (
                <div key={font.name} onClick={() => setInitialsFont(font.name)} style={{ padding: 12, border: `2px solid ${initialsFont === font.name ? 'var(--primary,#2563eb)' : 'var(--border)'}`, borderRadius: 7, cursor: 'pointer', textAlign: 'center', background: initialsFont === font.name ? '#eff6ff' : 'transparent' }}>
                  <div style={{ fontFamily: `'${font.name}', cursive`, fontSize: 28, color: initialsColor }}>{initialsText || 'I.'}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>{font.label}</div>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', padding: 16, background: '#f8fafc', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontFamily: `'${initialsFont}', cursive`, fontSize: 44, color: initialsColor }}>{initialsText || 'I.'}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>Preview</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Color:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {SIG_COLORS.map(c => (
                <button key={c.value} onClick={() => setInitialsColor(c.value)} title={c.label}
                  style={{ width: 26, height: 26, background: c.value, border: `3px solid ${initialsColor === c.value ? '#60a5fa' : 'transparent'}`, borderRadius: '50%', cursor: 'pointer', padding: 0 }} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setInitialsModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!initialsText.trim()} onClick={applyInitials}>✓ Apply Initials</button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Consent Modal ── */}
      {consentModal && (
        <Modal onClose={() => setConsentModal(false)} maxWidth={500}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>Electronic Signature Consent</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Please read and accept before signing</div>
            </div>
            <ModalClose onClick={() => setConsentModal(false)} />
          </div>
          <div style={{ padding: 20 }}>
            <div style={{ background: 'var(--bg-surface,#f8fafc)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, maxHeight: 200, overflowY: 'auto', fontSize: 12, lineHeight: 1.8, color: 'var(--text-muted)', marginBottom: 16 }}>
              <strong style={{ color: 'var(--text-primary)' }}>ELECTRONIC RECORD AND SIGNATURE DISCLOSURE</strong><br /><br />
              By using electronic signatures, you are consenting to use electronic means to execute this document.
              Your electronic signature is legally binding and equivalent to your handwritten signature.<br /><br />
              You have the right to receive a paper copy of this document. You may withdraw consent at any time.
              Your consent applies to this transaction only.<br /><br />
              By clicking &ldquo;I Agree &amp; Continue,&rdquo; you: (1) agree to sign electronically; (2) confirm you can access this document;
              (3) agree to the terms of HanMak Electronic Signature Policy.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={consentCheck1} onChange={e => setConsentCheck1(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>I agree to use electronic records and signatures for this document</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={consentCheck2} onChange={e => setConsentCheck2(e.target.checked)} style={{ marginTop: 2, flexShrink: 0 }} />
              <span>I confirm my identity as <strong>{signerName || 'the signer'}</strong></span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => setConsentModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!consentCheck1 || !consentCheck2} onClick={handleConsentAccept}>
                I Agree &amp; Continue to Sign →
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Decline Modal ── */}
      {declineModal && (
        <Modal onClose={() => setDeclineModal(false)} maxWidth={420}>
          <div style={{ padding: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Decline to Sign</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>Please provide a reason for declining.</div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-input" rows={4} placeholder="Explain why you cannot sign this document…" value={declineReason} onChange={e => setDeclineReason(e.target.value)} style={{ resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setDeclineModal(false)}>Cancel</button>
              <button className="btn btn-danger" disabled={!declineReason.trim() || declining} onClick={handleDecline}>
                {declining ? 'Declining…' : 'Decline to Sign'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ children, onClose, maxWidth = 500 }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', maxHeight: '90vh', overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

function ModalClose({ onClick }) {
  return (
    <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 6px', lineHeight: 1 }} onClick={onClick}>×</button>
  );
}

// ─── DocumentPage ──────────────────────────────────────────────────────────────

function DocumentPage({ page, pageIndex, pageTotal, fields, fieldValues, activeFieldId, onFieldClick }) {
  const imgUrl  = page.image_url || page.url || '';
  const imgW    = Number(page.width)  || DOC_WIDTH;
  const imgH    = Number(page.height) || 1471;
  // Always render at DOC_WIDTH so field pixel coordinates map 1:1
  const scale   = DOC_WIDTH / imgW;
  const dispW   = Math.round(imgW * scale);
  const dispH   = Math.round(imgH * scale);

  const pageFields = fields.filter(f =>
    f.page != null
      ? Number(f.page) - 1 === pageIndex
      : (f.page_index === pageIndex || f.pageIndex === pageIndex),
  );

  return (
    <div>
      <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginBottom: 5 }}>
        Page {pageIndex + 1}{pageTotal > 1 ? ` of ${pageTotal}` : ''}
      </div>
      <div style={{ position: 'relative', width: dispW, height: dispH, background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', borderRadius: 2, overflow: 'hidden' }}>
        {imgUrl && (
          <img
            src={imgUrl}
            alt={`Page ${pageIndex + 1}`}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }}
          />
        )}
        {pageFields.map(field => (
          <FieldOverlay
            key={field.id}
            field={field}
            dispW={dispW}
            dispH={dispH}
            value={fieldValues[field.id]}
            isActive={activeFieldId === field.id}
            onClick={() => onFieldClick(field.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ─── FieldOverlay ──────────────────────────────────────────────────────────────

function FieldOverlay({ field, dispW, dispH, value, isActive, onClick }) {
  const ft     = field.field_type || field.type || 'text';
  const isSig  = ft === 'signature';
  const isInit = ft === 'initials';
  const isStatic = ['label', 'divider', 'pagebreak'].includes(ft);
  const filled = value != null && value !== '' && value !== false;

  // Use stored page dimensions as coordinate basis (defaults match DOC_WIDTH)
  const basisW = Number(field.page_width)  || DOC_WIDTH;
  const basisH = Number(field.page_height) || 1471;
  const scaleX = dispW / basisW;
  const scaleY = dispH / basisH;
  const x = (field.x  || 0) * scaleX;
  const y = (field.y  || 0) * scaleY;
  const w = (field.width  || field.w || 160) * scaleX;
  const h = (field.height || field.h || 32)  * scaleY;

  const color = filled ? '#16a34a' : isActive ? '#2563eb' : (isSig || isInit) ? '#f59e0b' : '#3b82f6';

  let content = null;
  if (filled && (isSig || isInit)) {
    if (value.type === 'typed') {
      content = (
        <span style={{ fontFamily: `'${value.font || 'Dancing Script'}', cursive`, fontSize: Math.min(h * 0.6, 28), color: value.color || '#1e40af', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '100%' }}>
          {value.name}
        </span>
      );
    } else if (value.dataUrl) {
      content = <img src={value.dataUrl} alt="sig" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
    }
  } else if (filled && !isSig && !isInit) {
    content = <span style={{ fontSize: Math.min(11, h * 0.5), color: '#065f46', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{fieldValueDisplay(value)}</span>;
  } else if (!isStatic) {
    content = (
      <span style={{ fontSize: Math.min(10, h * 0.45), fontWeight: 600, color, whiteSpace: 'nowrap' }}>
        {isSig ? '✍ Click to sign' : isInit ? '✦ Initials' : `▶ ${field.label || ft}`}
      </span>
    );
  }

  if (isStatic) return null;

  return (
    <div
      onClick={onClick}
      style={{
        position: 'absolute',
        left: x, top: y, width: w, height: h,
        background: filled ? `${color}10` : isActive ? `${color}18` : `${color}14`,
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
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {content}
    </div>
  );
}

// ─── FieldInput (right panel) ──────────────────────────────────────────────────

function FieldInput({ field, value, isActive, onClick, onChange, onOpenSig, onOpenInitials }) {
  const ft       = field.field_type || field.type || 'text';
  const isSig    = ft === 'signature';
  const isInit   = ft === 'initials';
  const filled   = value != null && value !== '' && value !== false;
  const label    = field.label || ft;
  const required = field.required !== false;

  return (
    <div id={`field-input-${field.id}`}
      onClick={onClick}
      style={{ border: `1.5px solid ${isActive ? 'var(--primary,#2563eb)' : filled ? '#16a34a' : 'var(--border)'}`, borderRadius: 8, padding: '10px 12px', background: isActive ? '#eff6ff' : filled ? '#f0fdf4' : 'white', cursor: (isSig || isInit) ? 'pointer' : 'default', transition: 'border-color 0.15s, background 0.15s' }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
        {filled && <span style={{ color: '#16a34a', marginLeft: 6 }}>✓</span>}
      </label>

      {(isSig || isInit) && (
        <div>
          {filled ? (
            <div style={{ minHeight: 38, display: 'flex', alignItems: 'center', gap: 8 }}>
              {value.type === 'typed' && (
                <span style={{ fontFamily: `'${value.font || 'Dancing Script'}', cursive`, fontSize: 22, color: value.color || '#1e40af' }}>{value.name}</span>
              )}
              {(value.type === 'drawn' || value.type === 'uploaded') && value.dataUrl && (
                <img src={value.dataUrl} alt="sig" style={{ maxHeight: 38, maxWidth: '75%', objectFit: 'contain' }} />
              )}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', fontSize: 11 }}
                onClick={e => { e.stopPropagation(); isSig ? onOpenSig() : onOpenInitials(); }}>
                Change
              </button>
            </div>
          ) : (
            <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
              onClick={e => { e.stopPropagation(); isSig ? onOpenSig() : onOpenInitials(); }}>
              {isSig ? '✍ Click to Sign' : '✦ Add Initials'}
            </button>
          )}
        </div>
      )}

      {ft === 'text' && (
        <input id={`fi-${field.id}`} className="form-input" type="text" placeholder={`Enter ${label}…`} value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
      {ft === 'textarea' && (
        <textarea className="form-input" rows={3} placeholder={`Enter ${label}…`} value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13, resize: 'vertical' }} />
      )}
      {ft === 'number' && (
        <input className="form-input" type="number" placeholder="0" value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
      {ft === 'email' && (
        <input className="form-input" type="email" placeholder="email@example.com" value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
      {ft === 'date' && (
        <input className="form-input" type="date" value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }} />
      )}
      {ft === 'checkbox' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }} onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
          {label}
        </label>
      )}
      {(ft === 'select' || ft === 'dropdown') && (
        <select className="form-input" value={value || ''} onClick={e => e.stopPropagation()} onChange={e => onChange(e.target.value)} style={{ fontSize: 13 }}>
          <option value="">Select an option…</option>
          {(field.options || []).map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
        </select>
      )}
      {ft === 'radio' && (
        <div onClick={e => e.stopPropagation()}>
          {(field.options || []).map((opt, i) => (
            <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 4, cursor: 'pointer' }}>
              <input type="radio" name={`radio-${field.id}`} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
              {opt}
            </label>
          ))}
        </div>
      )}
      {ft === 'attachment' && (
        <div onClick={e => e.stopPropagation()}>
          <input type="file" style={{ fontSize: 12 }} onChange={e => { const f = e.target.files[0]; if (f) onChange(f); }} />
          {value && <div style={{ fontSize: 11, color: '#16a34a', marginTop: 4 }}>✓ {fieldValueDisplay(value)}</div>}
        </div>
      )}
    </div>
  );
}
