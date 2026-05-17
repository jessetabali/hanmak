import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARTY_COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2',
];

const FIELD_DEFAULTS = {
  signature:  { w: 200, h: 64 },
  initials:   { w: 80,  h: 42 },
  text:       { w: 160, h: 28 },
  date:       { w: 140, h: 28 },
  checkbox:   { w: 140, h: 28 },
  dropdown:   { w: 160, h: 28 },
  attachment: { w: 210, h: 42 },
  textarea:   { w: 200, h: 60 },
  number:     { w: 100, h: 28 },
  email:      { w: 180, h: 28 },
};

const FIELD_LABELS = {
  signature:  'Signature',
  initials:   'Initials',
  text:       'Text Field',
  date:       'Date',
  checkbox:   'Checkbox',
  dropdown:   'Dropdown',
  attachment: 'Attachment Upload',
  textarea:   'Text Area',
  number:     'Number',
  email:      'Email',
};

const FIELD_GROUPS = [
  {
    label: 'Text & Input',
    color: '#2563eb',
    tools: [
      { icon: 'T',  type: 'text',     label: 'Text Field' },
      { icon: '¶',  type: 'textarea', label: 'Textarea' },
      { icon: '#',  type: 'number',   label: 'Number' },
      { icon: '@',  type: 'email',    label: 'Email' },
      { icon: '📅', type: 'date',     label: 'Date' },
    ],
  },
  {
    label: 'Selection',
    color: '#7c3aed',
    tools: [
      { icon: '▼',  type: 'dropdown',   label: 'Dropdown' },
      { icon: '☑',  type: 'checkbox',   label: 'Checkbox' },
      { icon: '📎', type: 'attachment', label: 'Attachment' },
    ],
  },
  {
    label: 'Signing',
    color: '#16a34a',
    tools: [
      { icon: '✍', type: 'signature', label: 'Signature' },
      { icon: '✦', type: 'initials',  label: 'Initials' },
    ],
  },
];

const DOC_WIDTH = 1040;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function partyColor(parties, partyId) {
  const idx = parties.findIndex((p) => p.id === partyId);
  return PARTY_COLORS[idx >= 0 ? idx % PARTY_COLORS.length : 0];
}

function fieldApiType(type) {
  if (['textarea'].includes(type)) return 'text';
  if (['dropdown'].includes(type)) return 'select';
  return type;
}

function fieldKey(field, index) {
  return `${field.type}-${field.label || 'field'}-${index + 1}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `field-${index + 1}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // ── State ──────────────────────────────────────────────────────────────────
  const [parties, setParties] = useState([
    { id: 'party-1', name: 'Party 1', color: PARTY_COLORS[0] },
    { id: 'party-2', name: 'Party 2', color: PARTY_COLORS[1] },
  ]);
  const [fields, setFields] = useState([]);
  const [activePartyIdx, setActivePartyIdx] = useState(0);
  const [activeTool, setActiveTool] = useState(null);
  const [selectedFieldIdx, setSelectedFieldIdx] = useState(null);
  const [pageImages, setPageImages] = useState([]); // [{url, width, height}]
  const [saving, setSaving] = useState(false);
  const [loadingPages, setLoadingPages] = useState(false);
  const [templateName, setTemplateName] = useState('New Template');
  const [addPartyName, setAddPartyName] = useState('');
  const [showAddParty, setShowAddParty] = useState(false);
  const [editField, setEditField] = useState(null); // snapshot for inspector

  // Drag state kept in ref to avoid re-renders
  const dragRef = useRef({ active: false, fieldIdx: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const pageRefs = useRef([]);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: templateData } = useApiQuery(
    ['template', templateId],
    EP.TEMPLATE(templateId),
    {},
    { enabled: !!templateId },
  );

  const { data: versionsData } = useApiQuery(
    ['template-versions', templateId],
    EP.TEMPLATE_VERSIONS,
    { template: templateId },
    { enabled: !!templateId },
  );

  const { data: documentsData } = useApiQuery(
    ['documents', templateId],
    EP.DOCUMENTS,
    {},
    { enabled: !!templateId },
  );

  // ── Load template data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (templateData) {
      setTemplateName(templateData.name || 'New Template');
    }
  }, [templateData]);

  // ── Load fields from template version ─────────────────────────────────────
  useEffect(() => {
    if (!versionsData) return;
    const versions = versionsData.results || versionsData;
    const latest = versions[0];
    if (!latest?.field_schema?.fields?.length) return;
    const schema = latest.field_schema;
    const loaded = schema.fields.map((f, i) => ({
      id: `f${i + 1}`,
      type: f.original_type || f.field_type || 'text',
      x: f.x ?? (f.x_pct != null ? f.x_pct * DOC_WIDTH : 40),
      y: f.y ?? (f.y_pct != null ? f.y_pct * (f.page_height || 1471) : 40),
      w: f.width ?? f.w ?? 160,
      h: f.height ?? f.h ?? 32,
      pageIndex: Math.max(0, (f.page || 1) - 1),
      pageWidth: f.page_width || DOC_WIDTH,
      pageHeight: f.page_height || 1471,
      label: f.label || 'Field',
      party: f.party_key || 'party-1',
      required: f.required !== false,
      options: f.options || [],
    }));
    setFields(loaded);
  }, [versionsData]);

  // ── Render document pages on mount ────────────────────────────────────────
  useEffect(() => {
    if (!documentsData) return;
    const docs = documentsData.results || documentsData;
    const doc = docs[0];
    if (!doc) return;
    // If document already has rendered pages, use them directly
    if (doc.pages?.length && doc.pages.some((p) => p.image_url)) {
      const imgs = doc.pages
        .slice()
        .sort((a, b) => a.page_number - b.page_number)
        .map((p) => ({ url: p.image_url, width: p.width || DOC_WIDTH, height: p.height || 1471 }));
      setPageImages(imgs);
      return;
    }
    // Otherwise call prepare + render_pages
    const docId = doc.id;
    setLoadingPages(true);
    apiClient
      .post(EP.DOCUMENT_PREPARE(docId), { page_count: doc.page_count || 1, width: DOC_WIDTH })
      .then(() => apiClient.post(EP.DOCUMENT_RENDER_PAGES(docId), { page_count: doc.page_count || 1, width: DOC_WIDTH }))
      .then((res) => {
        const data = res.data;
        if (data?.pages?.length) {
          const imgs = data.pages
            .slice()
            .sort((a, b) => a.page_number - b.page_number)
            .map((p) => ({ url: p.image_url, width: p.width || DOC_WIDTH, height: p.height || 1471 }));
          setPageImages(imgs);
        } else if (data?.image_url) {
          setPageImages([{ url: data.image_url, width: DOC_WIDTH, height: 1471 }]);
        }
      })
      .catch((err) => {
        toast.error('Could not render document pages: ' + (err.response?.data?.detail || err.message));
      })
      .finally(() => setLoadingPages(false));
  }, [documentsData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save mutation ──────────────────────────────────────────────────────────
  const saveMutation = useApiMutation(
    (payload) => apiClient.post(EP.TEMPLATE_SETUP(templateId), payload),
    {
      invalidateKeys: ['templates', 'template-versions'],
      onSuccess: () => {
        toast.success('Template saved');
        navigate('/templates');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    },
  );

  // ── Field placement: click on page image ──────────────────────────────────
  const handlePageClick = useCallback(
    (e, pageIndex) => {
      if (!activeTool) return;
      if (dragRef.current.active) return; // ignore click at end of drag
      const rect = e.currentTarget.getBoundingClientRect();
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      const imgWidth = pageImages[pageIndex]?.width || DOC_WIDTH;
      const imgHeight = pageImages[pageIndex]?.height || 1471;
      // Scale to 1040 coordinate space
      const scale = DOC_WIDTH / imgWidth;
      const x = rawX / scale;
      const y = rawY / scale;
      const def = FIELD_DEFAULTS[activeTool] || { w: 160, h: 28 };
      const newField = {
        id: `f${Date.now()}`,
        type: activeTool,
        x: Math.max(0, Math.min(Math.round(x), DOC_WIDTH - def.w)),
        y: Math.max(0, Math.round(y)),
        w: def.w,
        h: def.h,
        pageIndex,
        pageWidth: imgWidth,
        pageHeight: imgHeight,
        label: FIELD_LABELS[activeTool] || activeTool,
        party: parties[activePartyIdx]?.id || 'party-1',
        required: true,
        options: [],
      };
      setFields((prev) => {
        const next = [...prev, newField];
        setSelectedFieldIdx(next.length - 1);
        setEditField({ ...newField });
        return next;
      });
    },
    [activeTool, pageImages, parties, activePartyIdx],
  );

  // ── Drag move/resize (field overlays) ─────────────────────────────────────
  const startDragField = useCallback((e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    const f = fields[idx];
    dragRef.current = {
      active: true,
      fieldIdx: idx,
      startX: e.clientX,
      startY: e.clientY,
      origX: f.x,
      origY: f.y,
      mode: 'move',
    };

    const onMove = (me) => {
      const dr = dragRef.current;
      if (!dr.active) return;
      const pageEl = pageRefs.current[f.pageIndex];
      if (!pageEl) return;
      const imgWidth = pageImages[f.pageIndex]?.width || DOC_WIDTH;
      const scale = DOC_WIDTH / imgWidth;
      const dx = (me.clientX - dr.startX) / scale;
      const dy = (me.clientY - dr.startY) / scale;
      const newX = Math.max(0, Math.min(Math.round(dr.origX + dx), DOC_WIDTH - f.w));
      const newY = Math.max(0, Math.round(dr.origY + dy));
      setFields((prev) => {
        const next = [...prev];
        next[dr.fieldIdx] = { ...next[dr.fieldIdx], x: newX, y: newY };
        return next;
      });
    };

    const onUp = () => {
      dragRef.current.active = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [fields, pageImages]);

  // ── Select field ──────────────────────────────────────────────────────────
  const selectField = useCallback((idx) => {
    setSelectedFieldIdx(idx);
    setEditField(idx !== null ? { ...fields[idx] } : null);
  }, [fields]);

  // ── Delete field ──────────────────────────────────────────────────────────
  const deleteField = useCallback((idx) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
    setSelectedFieldIdx(null);
    setEditField(null);
  }, []);

  // ── Update selected field from inspector ──────────────────────────────────
  const updateField = useCallback((patch) => {
    if (selectedFieldIdx === null) return;
    setFields((prev) => {
      const next = [...prev];
      next[selectedFieldIdx] = { ...next[selectedFieldIdx], ...patch };
      return next;
    });
    setEditField((prev) => ({ ...prev, ...patch }));
  }, [selectedFieldIdx]);

  // ── Add party ─────────────────────────────────────────────────────────────
  const addParty = useCallback(() => {
    const name = addPartyName.trim();
    if (!name) return;
    const id = `party-${parties.length + 1}`;
    const color = PARTY_COLORS[parties.length % PARTY_COLORS.length];
    setParties((prev) => [...prev, { id, name, color }]);
    setAddPartyName('');
    setShowAddParty(false);
  }, [addPartyName, parties.length]);

  // ── Serialize fields for API ───────────────────────────────────────────────
  const serializeFields = useCallback(() => {
    return fields.map((field, index) => {
      const imgW = pageImages[field.pageIndex]?.width || DOC_WIDTH;
      const imgH = pageImages[field.pageIndex]?.height || 1471;
      return {
        local_id: field.id,
        field_key: fieldKey(field, index),
        field_type: fieldApiType(field.type),
        original_type: field.type,
        label: field.label,
        required: !!field.required,
        party_key: field.party || 'party-1',
        page: (field.pageIndex || 0) + 1,
        x: Math.round(field.x),
        y: Math.round(field.y),
        width: Math.round(field.w),
        height: Math.round(field.h),
        page_width: Math.round(imgW),
        page_height: Math.round(imgH),
        x_pct: imgW ? +((field.x / imgW) * (imgW / DOC_WIDTH)).toFixed(6) : 0,
        y_pct: imgH ? +(field.y / imgH).toFixed(6) : 0,
        width_pct: imgW ? +((field.w / imgW) * (imgW / DOC_WIDTH)).toFixed(6) : 0,
        height_pct: imgH ? +(field.h / imgH).toFixed(6) : 0,
        coordinate_basis: 'page-pixels',
        options: field.options || [],
      };
    });
  }, [fields, pageImages]);

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!fields.length) {
      toast.error('Add at least one field before saving');
      return;
    }
    setSaving(true);
    try {
      const serialized = serializeFields();
      const partyPayload = parties.map((p, i) => ({
        role_key: p.id,
        label: p.name,
        routing_order: i + 1,
        color: p.color,
      }));
      await saveMutation.mutateAsync({
        name: templateName,
        parties: partyPayload,
        form_schema: {
          source: 'form-builder',
          page_count: pageImages.length || 1,
          document_width: DOC_WIDTH,
          fields: serialized,
        },
      });
    } finally {
      setSaving(false);
    }
  }, [fields, parties, templateName, pageImages, serializeFields, saveMutation, toast]);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  return (
    <div
      style={{
        margin: '-28px',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 56px)',
        overflow: 'hidden',
      }}
    >
      {/* ── Top bar ── */}
      <div
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/templates')}>
            ← Templates
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>›</span>
          <input
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text-primary)',
              border: 'none',
              background: 'transparent',
              outline: 'none',
              width: 220,
            }}
          />
          <span className="badge badge-warning">Draft</span>
        </div>

        {/* Party tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Assign to:
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {parties.map((p, i) => (
              <button
                key={p.id}
                className="btn btn-sm"
                onClick={() => setActivePartyIdx(i)}
                style={{
                  color: p.color,
                  borderColor: activePartyIdx === i ? p.color : 'var(--border)',
                  background: activePartyIdx === i ? `${p.color}18` : 'transparent',
                  fontSize: 12,
                }}
              >
                {p.name}
              </button>
            ))}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowAddParty((v) => !v)}
              style={{ fontSize: 12 }}
            >
              + Add
            </button>
          </div>
          {showAddParty && (
            <div style={{ display: 'flex', gap: 4 }}>
              <input
                className="form-input"
                placeholder="Party name"
                value={addPartyName}
                onChange={(e) => setAddPartyName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addParty()}
                style={{ fontSize: 12, padding: '4px 8px', width: 120 }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={addParty}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAddParty(false)}>✕</button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || saveMutation.isPending}
          >
            {saving || saveMutation.isPending ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* ── 3-column layout ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 270px', flex: 1, overflow: 'hidden' }}>

        {/* LEFT: Field type palette */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}
          >
            Field Types
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {FIELD_GROUPS.map((group) => (
              <div key={group.label}>
                <div
                  style={{
                    padding: '6px 14px 4px',
                    fontSize: 10,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {group.label}
                </div>
                {group.tools.map((tool) => (
                  <div
                    key={tool.type}
                    onClick={() => setActiveTool((t) => (t === tool.type ? null : tool.type))}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 14px',
                      cursor: 'pointer',
                      fontSize: 12.5,
                      color: activeTool === tool.type ? group.color : 'var(--text-secondary)',
                      background: activeTool === tool.type ? `${group.color}12` : 'transparent',
                      borderLeft: activeTool === tool.type ? `3px solid ${group.color}` : '3px solid transparent',
                      userSelect: 'none',
                      transition: 'background 0.1s',
                    }}
                  >
                    <span style={{ fontSize: 14, width: 20, textAlign: 'center', color: group.color }}>
                      {tool.icon}
                    </span>
                    <span>{tool.label}</span>
                    {activeTool === tool.type && (
                      <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, color: group.color }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Active tool hint */}
          {activeTool && (
            <div
              style={{
                padding: '10px 14px',
                borderTop: '1px solid var(--border)',
                fontSize: 11,
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
              }}
            >
              <strong style={{ color: 'var(--text-primary)' }}>
                {FIELD_LABELS[activeTool] || activeTool}
              </strong>{' '}
              active — click on the document to place
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTool(null)}
                style={{ display: 'block', marginTop: 6, width: '100%', fontSize: 11 }}
              >
                ✕ Cancel
              </button>
            </div>
          )}
        </div>

        {/* CENTER: Document canvas */}
        <div
          style={{
            background: '#d1d9e6',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 24,
            gap: 20,
            cursor: activeTool ? 'crosshair' : 'default',
          }}
          onClick={() => {
            // Deselect field if clicking canvas background
            if (!activeTool) {
              setSelectedFieldIdx(null);
              setEditField(null);
            }
          }}
        >
          {loadingPages && <Spinner center />}

          {!loadingPages && pageImages.length === 0 && (
            <div
              style={{
                width: DOC_WIDTH,
                minHeight: 480,
                background: 'white',
                borderRadius: 4,
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                border: '2px dashed var(--border)',
              }}
            >
              <div style={{ fontSize: '2.5rem' }}>📄</div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                  No document loaded
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  This template has no document yet. Fields can still be placed on the blank canvas.
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  Tip: Upload a document from the Documents library before building.
                </div>
              </div>
              {/* Blank canvas page so fields can still be placed */}
              <BlankPage
                width={DOC_WIDTH}
                height={1471}
                pageIndex={0}
                fields={fields}
                parties={parties}
                selectedFieldIdx={selectedFieldIdx}
                activeTool={activeTool}
                pageRefs={pageRefs}
                onPageClick={handlePageClick}
                onSelectField={selectField}
                onDeleteField={deleteField}
                onStartDrag={startDragField}
              />
            </div>
          )}

          {pageImages.map((pg, pageIndex) => (
            <div key={pageIndex} style={{ position: 'relative' }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#64748b',
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                Page {pageIndex + 1}
              </div>
              <DocumentPage
                pageIndex={pageIndex}
                imageUrl={pg.url}
                width={pg.width || DOC_WIDTH}
                height={pg.height || 1471}
                fields={fields}
                parties={parties}
                selectedFieldIdx={selectedFieldIdx}
                activeTool={activeTool}
                pageRefs={pageRefs}
                onPageClick={handlePageClick}
                onSelectField={selectField}
                onDeleteField={deleteField}
                onStartDrag={startDragField}
              />
            </div>
          ))}
        </div>

        {/* RIGHT: Inspector */}
        <div
          style={{
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
            }}
          >
            Inspector
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {selectedField && editField ? (
              <FieldInspector
                field={editField}
                fields={fields}
                selectedFieldIdx={selectedFieldIdx}
                parties={parties}
                onChange={updateField}
                onDelete={() => deleteField(selectedFieldIdx)}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>☝️</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {activeTool
                    ? `Click the document to place a ${FIELD_LABELS[activeTool] || activeTool} field`
                    : 'Select a field type, then click the document to place it'}
                </div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Click any placed field to configure it</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DocumentPage subcomponent ────────────────────────────────────────────────

function DocumentPage({
  pageIndex, imageUrl, width, height,
  fields, parties, selectedFieldIdx, activeTool,
  pageRefs, onPageClick, onSelectField, onDeleteField, onStartDrag,
}) {
  const scale = DOC_WIDTH / width; // pixels per coordinate unit
  const displayW = width * scale;   // = DOC_WIDTH
  const displayH = height * scale;

  return (
    <div
      ref={(el) => { pageRefs.current[pageIndex] = el; }}
      style={{
        position: 'relative',
        width: displayW,
        height: displayH,
        background: 'white',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        flexShrink: 0,
      }}
      onClick={(e) => onPageClick(e, pageIndex)}
    >
      {imageUrl && (
        <img
          src={imageUrl}
          alt={`Page ${pageIndex + 1}`}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}
      {fields.map((field, idx) =>
        field.pageIndex === pageIndex ? (
          <FieldOverlay
            key={field.id}
            field={field}
            idx={idx}
            scale={scale}
            isSelected={selectedFieldIdx === idx}
            parties={parties}
            onSelect={(e) => { e.stopPropagation(); onSelectField(idx); }}
            onDelete={(e) => { e.stopPropagation(); onDeleteField(idx); }}
            onStartDrag={(e) => onStartDrag(e, idx)}
          />
        ) : null,
      )}
    </div>
  );
}

// ─── BlankPage (no image) ─────────────────────────────────────────────────────

function BlankPage({
  width, height, pageIndex,
  fields, parties, selectedFieldIdx, activeTool,
  pageRefs, onPageClick, onSelectField, onDeleteField, onStartDrag,
}) {
  const scale = DOC_WIDTH / width;
  const displayW = width * scale;
  const displayH = height * scale;

  return (
    <div
      ref={(el) => { pageRefs.current[pageIndex] = el; }}
      style={{
        position: 'relative',
        width: displayW,
        height: displayH,
        background: '#f8fafc',
        border: '1px solid var(--border)',
        flexShrink: 0,
      }}
      onClick={(e) => onPageClick(e, pageIndex)}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: 14,
          pointerEvents: 'none',
        }}
      >
        {!fields.some((f) => f.pageIndex === pageIndex) && 'Click to place fields'}
      </div>
      {fields.map((field, idx) =>
        field.pageIndex === pageIndex ? (
          <FieldOverlay
            key={field.id}
            field={field}
            idx={idx}
            scale={scale}
            isSelected={selectedFieldIdx === idx}
            parties={parties}
            onSelect={(e) => { e.stopPropagation(); onSelectField(idx); }}
            onDelete={(e) => { e.stopPropagation(); onDeleteField(idx); }}
            onStartDrag={(e) => onStartDrag(e, idx)}
          />
        ) : null,
      )}
    </div>
  );
}

// ─── FieldOverlay subcomponent ────────────────────────────────────────────────

function FieldOverlay({ field, idx, scale, isSelected, parties, onSelect, onDelete, onStartDrag }) {
  const color = partyColor(parties, field.party);
  const left = field.x * scale;
  const top = field.y * scale;
  const w = field.w * scale;
  const h = field.h * scale;

  return (
    <div
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onSelect(e);
        onStartDrag(e, idx);
      }}
      onClick={onSelect}
      style={{
        position: 'absolute',
        left,
        top,
        width: w,
        height: h,
        background: `${color}22`,
        border: `${isSelected ? '2.5px' : '1.5px'} solid ${color}`,
        outline: isSelected ? `2px solid ${color}` : 'none',
        outlineOffset: 1,
        borderRadius: 3,
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 6px',
        fontSize: 11,
        fontWeight: 500,
        color,
        zIndex: isSelected ? 20 : 10,
        userSelect: 'none',
        cursor: 'move',
      }}
    >
      <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1, pointerEvents: 'none', fontSize: 10 }}>
        {field.label}
      </span>
      <span style={{ fontSize: 9, opacity: 0.65, flexShrink: 0, pointerEvents: 'none', marginLeft: 2 }}>
        {(field.party || '').replace('party-', 'P')}
      </span>
      <button
        onClick={onDelete}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          top: -8,
          right: -8,
          width: 16,
          height: 16,
          background: color,
          color: 'white',
          border: 'none',
          borderRadius: '50%',
          fontSize: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 30,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── FieldInspector subcomponent ──────────────────────────────────────────────

function FieldInspector({ field, fields, selectedFieldIdx, parties, onChange, onDelete }) {
  const color = partyColor(parties, field.party);
  const isSelect = ['dropdown', 'select'].includes(field.type);
  const isSign = field.type === 'signature';
  const options = Array.isArray(field.options) && field.options.length
    ? field.options
    : isSelect ? ['Option 1', 'Option 2', 'Option 3'] : [];

  const [localOptions, setLocalOptions] = useState(options);

  useEffect(() => {
    setLocalOptions(Array.isArray(field.options) && field.options.length ? field.options : (isSelect ? ['Option 1', 'Option 2', 'Option 3'] : []));
  }, [selectedFieldIdx]); // reset when field changes

  const syncOptions = (newOpts) => {
    setLocalOptions(newOpts);
    onChange({ options: newOpts.filter(Boolean) });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{field.label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>
          {field.type}
        </span>
      </div>

      <div className="form-group">
        <label className="form-label">Field Label</label>
        <input
          className="form-input"
          style={{ fontSize: 13 }}
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label className="form-label">Assign to Party</label>
        <select
          className="form-input"
          style={{ fontSize: 13 }}
          value={field.party}
          onChange={(e) => onChange({ party: e.target.value })}
        >
          {parties.map((p, i) => (
            <option key={p.id} value={p.id}>
              {p.name}{i === 0 ? ' (Sender)' : ''}
            </option>
          ))}
        </select>
      </div>

      {isSelect && (
        <div className="form-group">
          <label className="form-label">Options</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
            {localOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input
                  className="form-input"
                  value={opt}
                  style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                  onChange={(e) => {
                    const next = [...localOptions];
                    next[i] = e.target.value;
                    syncOptions(next);
                  }}
                />
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ padding: '4px 6px', color: 'var(--danger)' }}
                  onClick={() => syncOptions(localOptions.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', fontSize: 12 }}
            onClick={() => syncOptions([...localOptions, ''])}
          >
            + Add Option
          </button>
        </div>
      )}

      {isSign && (
        <div className="form-group">
          <label className="form-label">Allowed Methods</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Draw (canvas)', 'draw'], ['Type signature', 'type'], ['Upload image', 'upload']].map(([lbl, method]) => (
              <label key={method} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!field.options?.length || field.options.includes(method)}
                  onChange={(e) => {
                    const current = field.options?.length ? [...field.options] : ['draw', 'type', 'upload'];
                    const next = e.target.checked
                      ? [...new Set([...current, method])]
                      : current.filter((m) => m !== method);
                    onChange({ options: next });
                  }}
                />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          Required field
        </label>
      </div>

      {/* Position & Size */}
      <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Position &amp; Size
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['X (px)', 'x', field.x], ['Y (px)', 'y', field.y], ['Width', 'w', field.w], ['Height', 'h', field.h]].map(([lbl, prop, val]) => (
            <div key={prop}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{lbl}</label>
              <input
                className="form-input"
                type="number"
                value={Math.round(val)}
                style={{ fontSize: 12, padding: '5px 8px' }}
                onChange={(e) => onChange({ [prop]: Math.max(prop === 'w' ? 40 : prop === 'h' ? 18 : 0, +e.target.value) })}
              />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Page</label>
          <input
            className="form-input"
            type="number"
            value={(field.pageIndex || 0) + 1}
            min={1}
            style={{ fontSize: 12, padding: '5px 8px', width: 70 }}
            onChange={(e) => onChange({ pageIndex: Math.max(0, +e.target.value - 1) })}
          />
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          className="btn btn-sm"
          style={{ width: '100%', background: '#fee2e2', color: 'var(--danger)', border: '1px solid #fca5a5' }}
          onClick={onDelete}
        >
          🗑 Delete Field
        </button>
      </div>
    </div>
  );
}
