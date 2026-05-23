import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';
import * as pdfjsLib from 'pdfjs-dist';

// Configure the PDF.js worker (bundled alongside the library)
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).href;

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
  radio:      { w: 160, h: 80 },
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
  radio:      'Radio Group',
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
      { icon: '◉',  type: 'radio',      label: 'Radio Group' },
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
const HUMAN_WORKFLOW_STAGE_TYPES = new Set(['signing', 'approval', 'review']);

// ─── Client-side PDF rendering ────────────────────────────────────────────────

async function renderPdfFromBytes(arrayBuffer) {
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const scale = DOC_WIDTH / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(scaledViewport.width);
    canvas.height = Math.round(scaledViewport.height);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;
    pages.push({ url: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
  }
  return pages;
}

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

function normalizeWorkflowStage(stage, index) {
  const stageType = stage.stage_type || stage.type || 'approval';
  const key = stage.key || `stage_${index + 1}`;
  return {
    key,
    label: stage.label || key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    stage_type: stageType,
    order: stage.order || index + 1,
    party_key: HUMAN_WORKFLOW_STAGE_TYPES.has(stageType) ? (stage.party_key || key) : '',
    config: stage.config || {},
  };
}

function buildWorkflowSchema(workflow) {
  if (!workflow) return {};
  return {
    workflow_definition_id: workflow.id,
    workflow_name: workflow.name,
    stages: (workflow.stages || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(normalizeWorkflowStage),
  };
}

function partiesFromWorkflowSchema(workflowSchema) {
  const stages = workflowSchema?.stages || [];
  return stages
    .filter((stage) => HUMAN_WORKFLOW_STAGE_TYPES.has(stage.stage_type) && stage.party_key)
    .map((stage, index) => ({
      id: stage.party_key,
      name: stage.label,
      color: PARTY_COLORS[index % PARTY_COLORS.length],
    }));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const docParam = searchParams.get('doc'); // specific document ID passed from template creation
  const workflowParam = searchParams.get('workflow'); // optional workflow ID passed from template creation
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
  const [uploading, setUploading] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [templateName, setTemplateName] = useState('New Template');
  const [addPartyName, setAddPartyName] = useState('');
  const [showAddParty, setShowAddParty] = useState(false);
  const [editingPartyId, setEditingPartyId] = useState(null);
  const [editField, setEditField] = useState(null); // snapshot for inspector
  const [workflowSchema, setWorkflowSchema] = useState({});

  // Drag state kept in ref to avoid re-renders
  const dragRef = useRef({ active: false, fieldIdx: null, startX: 0, startY: 0, origX: 0, origY: 0 });
  const pageRefs = useRef([]);
  const loadedDocIdRef = useRef(null); // ID of the document currently loaded on the canvas
  const fileInputRef = useRef(null);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: templateData } = useApiQuery(
    ['template', templateId],
    templateId ? EP.TEMPLATE(templateId) : null,
    {},
    { enabled: !!templateId },
  );

  const { data: versionsData } = useApiQuery(
    ['template-versions', templateId],
    templateId ? EP.TEMPLATE_VERSIONS : null,
    { template: templateId },
    { enabled: !!templateId },
  );

  const { data: workflowsData } = useApiQuery(
    ['workflows-for-template-builder'],
    EP.WORKFLOWS,
    { status: 'active', page_size: 100 },
    { enabled: !!workflowParam },
  );

  // ── Derive the document ID from the loaded version (for existing templates) ──
  // This must come after versionsData is declared so hooks run in stable order.
  const versionsArray = versionsData?.results ?? (Array.isArray(versionsData) ? versionsData : []);
  const versionDocId = !docParam ? (versionsArray[0]?.document ?? null) : null;
  // "versionsLoaded" means the query has returned something (even an empty list).
  // We delay the document-library fallback until we know whether a version doc exists.
  const versionsLoaded = versionsData !== undefined;

  // Priority 1 — URL param ?doc=X (used when navigating from template creation)
  const { data: specificDocData } = useApiQuery(
    ['document', docParam],
    docParam ? EP.DOCUMENT(docParam) : null,
    {},
    { enabled: !!docParam },
  );
  // Priority 2 — document attached to the latest template version
  const { data: versionDocData } = useApiQuery(
    ['document-from-version', versionDocId],
    versionDocId ? EP.DOCUMENT(versionDocId) : null,
    {},
    { enabled: !!versionDocId },
  );
  // Priority 3 — first doc in the library (only for brand-new templates with no version)
  const { data: documentsData } = useApiQuery(
    ['documents', templateId],
    EP.DOCUMENTS,
    {},
    { enabled: !!templateId && !docParam && versionsLoaded && versionDocId === null },
  );

  // ── Load template data ─────────────────────────────────────────────────────
  useEffect(() => {
    if (templateData) {
      setTemplateName(templateData.name || 'New Template');
    }
  }, [templateData]);

  useEffect(() => {
    if (!workflowParam || !workflowsData) return;
    const workflows = workflowsData.results || workflowsData || [];
    const selectedWorkflow = workflows.find((workflow) => String(workflow.id) === String(workflowParam) && workflow.status === 'active');
    if (!selectedWorkflow) return;
    const schema = buildWorkflowSchema(selectedWorkflow);
    setWorkflowSchema(schema);
    const workflowParties = partiesFromWorkflowSchema(schema);
    if (workflowParties.length > 0) {
      setParties(workflowParties);
      setActivePartyIdx(0);
    }
  }, [workflowParam, workflowsData]);

  // ── Load fields and parties from template version ──────────────────────────
  useEffect(() => {
    if (!versionsData) return;
    const versions = versionsData.results || versionsData;
    const latest = versions[0];
    if (!latest) return;

    if (latest.workflow_schema?.workflow_definition_id) {
      setWorkflowSchema(latest.workflow_schema);
    }

    // Restore saved party names from the stored TemplateParty records
    if (Array.isArray(latest.parties) && latest.parties.length > 0) {
      setParties(
        latest.parties.map((p, i) => ({
          id: p.role_key,
          name: p.label || p.role_key.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          color: PARTY_COLORS[i % PARTY_COLORS.length],
        })),
      );
    }

    if (!latest.field_schema?.fields?.length) return;
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
    // Priority 1: URL ?doc param; Priority 2: version's document; Priority 3: library fallback
    const doc = specificDocData || versionDocData || ((() => {
      const docs = documentsData?.results ?? (Array.isArray(documentsData) ? documentsData : null);
      return docs?.[0] ?? null;
    })());
    if (!doc) return;
    // Avoid re-rendering when nothing changed
    if (loadedDocIdRef.current === doc.id && pageImages.length > 0) return;
    loadedDocIdRef.current = doc.id;

    const docId = doc.id;

    // ── Primary path: fetch the PDF file and render client-side via PDF.js ──
    // This produces pixel-accurate previews regardless of backend renderer.
    const fileUrl = doc.file_url || doc.file || null;
    if (fileUrl) {
      setLoadingPages(true);
      (async () => {
        try {
          const res = await apiClient.get(fileUrl, { responseType: 'arraybuffer' });
          const pages = await renderPdfFromBytes(res.data);
          setPageImages(pages);
          // Call prepare-for-builder AFTER rendering so we know the exact page
          // count. This registers all pages in the backend for the signing view.
          apiClient
            .post(EP.DOCUMENT_PREPARE(docId), { page_count: pages.length, width: DOC_WIDTH })
            .catch(() => {/* best-effort */});
        } catch (err) {
          toast.error('Could not render document: ' + (err.message || 'unknown error'));
          // PDF.js failed — still tell the backend to prepare pages. Don't send
          // page_count: 1 when we don't know the real count; let pypdf detect it.
          apiClient
            .post(EP.DOCUMENT_PREPARE(docId), {
              ...(doc.page_count > 0 ? { page_count: doc.page_count } : {}),
              width: DOC_WIDTH,
            })
            .catch(() => {});
        } finally {
          setLoadingPages(false);
        }
      })();
      return;
    }

    // ── Fallback: no file_url — call prepare-for-builder for server images ──
    // Only send page_count when we already know the real value from the DB.
    // Sending `|| 1` when page_count is 0 would poison the stored count for
    // multi-page PDFs; let the backend auto-detect via pypdf instead.
    setLoadingPages(true);

    const applyPages = (pagesArr) => {
      if (!pagesArr?.length) return;
      const imgs = pagesArr
        .slice()
        .sort((a, b) => a.page_number - b.page_number)
        .map((p) => ({ url: p.image_url, width: p.width || DOC_WIDTH, height: p.height || 1471 }));
      setPageImages(imgs);
    };

    apiClient
      .post(EP.DOCUMENT_PREPARE(docId), {
        ...(doc.page_count > 0 ? { page_count: doc.page_count } : {}),
        width: DOC_WIDTH,
      })
      .then((prepRes) => {
        const prepData = prepRes.data;
        const fromPrepare = prepData?.rendered_pages?.length
          ? prepData.rendered_pages
          : prepData?.pages?.length
            ? prepData.pages
            : null;
        if (fromPrepare) {
          applyPages(fromPrepare);
          return null;
        }
        const pc = prepData?.page_count || doc.page_count || 1;
        return apiClient.post(EP.DOCUMENT_RENDER_PAGES(docId), { page_count: pc, width: DOC_WIDTH });
      })
      .then((res) => {
        if (!res) return;
        const data = res.data;
        const pagesArr = Array.isArray(data)
          ? data
          : data?.pages ?? data?.rendered_pages ?? [];
        applyPages(pagesArr);
      })
      .catch((err) => {
        toast.error('Could not render document pages: ' + (err.response?.data?.detail || err.message));
      })
      .finally(() => setLoadingPages(false));
  }, [documentsData, specificDocData, versionDocData]);

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
  const startDragField = useCallback((e, idx, mode = 'move') => {
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
      origW: f.w,
      origH: f.h,
      mode,
    };

    const onMove = (me) => {
      const dr = dragRef.current;
      if (!dr.active) return;
      const imgWidth = pageImages[f.pageIndex]?.width || DOC_WIDTH;
      const scale = DOC_WIDTH / imgWidth;
      const dx = (me.clientX - dr.startX) / scale;
      const dy = (me.clientY - dr.startY) / scale;

      setFields((prev) => {
        const next = [...prev];
        const cur = next[dr.fieldIdx];
        if (dr.mode === 'move') {
          const newX = Math.max(0, Math.min(Math.round(dr.origX + dx), DOC_WIDTH - cur.w));
          const newY = Math.max(0, Math.round(dr.origY + dy));
          next[dr.fieldIdx] = { ...cur, x: newX, y: newY };
        } else if (dr.mode === 'resize-se') {
          next[dr.fieldIdx] = { ...cur, w: Math.max(40, Math.round(dr.origW + dx)), h: Math.max(18, Math.round(dr.origH + dy)) };
        } else if (dr.mode === 'resize-sw') {
          const newW = Math.max(40, Math.round(dr.origW - dx));
          next[dr.fieldIdx] = { ...cur, x: Math.max(0, Math.round(dr.origX + dr.origW - newW)), w: newW, h: Math.max(18, Math.round(dr.origH + dy)) };
        } else if (dr.mode === 'resize-ne') {
          const newH = Math.max(18, Math.round(dr.origH - dy));
          next[dr.fieldIdx] = { ...cur, y: Math.max(0, Math.round(dr.origY + dr.origH - newH)), w: Math.max(40, Math.round(dr.origW + dx)), h: newH };
        } else if (dr.mode === 'resize-nw') {
          const newW = Math.max(40, Math.round(dr.origW - dx));
          const newH = Math.max(18, Math.round(dr.origH - dy));
          next[dr.fieldIdx] = { ...cur, x: Math.max(0, Math.round(dr.origX + dr.origW - newW)), y: Math.max(0, Math.round(dr.origY + dr.origH - newH)), w: newW, h: newH };
        }
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

  // ── Rename party ───────────────────────────────────────────────────────────
  const renameParty = useCallback((id, newName) => {
    const trimmed = newName.trim();
    if (trimmed) setParties((prev) => prev.map((p) => (p.id === id ? { ...p, name: trimmed } : p)));
    setEditingPartyId(null);
  }, []);

  // ── PDF upload directly from the builder ─────────────────────────────────
  const handleUploadPdf = useCallback(async (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported');
      return;
    }
    const orgId = Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'));
    setUploading(true);
    setLoadingPages(true);

    try {
      // ── Phase 1: client-side PDF rendering via PDF.js ──────────────────
      const arrayBuffer = await file.arrayBuffer();
      const pages = await renderPdfFromBytes(arrayBuffer);
      const numPages = pages.length;

      // Show pages immediately — user can start placing fields right away
      setPageImages(pages);
      setUploading(false);
      setLoadingPages(false);
      toast.success(`Loaded "${file.name}" — ${numPages} page${numPages !== 1 ? 's' : ''}`);

      // ── Phase 2: upload to backend in the background ───────────────────
      // This registers the document in the DB so it can be saved with the
      // template. Failures are reported via toast but don't block the user.
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('title', file.name.replace(/\.pdf$/i, ''));
        form.append('organization', orgId);
        const uploadRes = await apiClient.post(EP.DOCUMENTS, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        const doc = uploadRes.data;
        loadedDocIdRef.current = doc.id;

        // Trigger prepare-for-builder so the backend also generates server-side
        // images (used during signing). We don't need the response for the preview.
        apiClient.post(EP.DOCUMENT_PREPARE(doc.id), {
          page_count: doc.page_count || numPages,
          width: DOC_WIDTH,
        }).catch(() => {/* non-critical */});
      } catch (uploadErr) {
        toast.error('Upload to server failed — template save may not work. ' +
          (uploadErr.response?.data?.detail || uploadErr.message || ''));
      }
    } catch (err) {
      toast.error(err.message || 'Failed to read PDF');
      setUploading(false);
      setLoadingPages(false);
    }
  }, [toast]);

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
    if (!loadedDocIdRef.current) {
      toast.error('No document loaded — upload a PDF first via the Documents page');
      return;
    }
    if (workflowParam && !workflowSchema.workflow_definition_id) {
      toast.error('Workflow is still loading or is not active. Choose an active workflow first.');
      return;
    }
    setSaving(true);
    try {
      // Persist any name change first (non-critical, ignore failure)
      if (templateName.trim()) {
        await apiClient.patch(EP.TEMPLATE(templateId), { name: templateName.trim() }).catch(() => {});
      }
      const serialized = serializeFields();
      await saveMutation.mutateAsync({
        document: loadedDocIdRef.current,
        fields: serialized,
        changelog: 'Updated via Form Builder',
        // Pass party labels so custom names (e.g. "Buyer") are persisted
        parties: parties.map((p) => ({ key: p.id, label: p.name })),
        workflow_schema: workflowSchema.workflow_definition_id ? workflowSchema : {},
      });
      // saveMutation.onSuccess handles toast.success and navigate
    } catch {
      // saveMutation.onError already showed an error toast
    } finally {
      setSaving(false);
    }
  }, [fields, parties, templateName, pageImages, serializeFields, saveMutation, templateId, toast, workflowParam, workflowSchema]);

  // ── Render ────────────────────────────────────────────────────────────────
  const selectedField = selectedFieldIdx !== null ? fields[selectedFieldIdx] : null;

  // Gap #4 — guard: builder requires an existing template ID. Keep this after
  // hooks so the component always calls hooks in the same order.
  if (!templateId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>🛠</div>
        <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>No template selected</div>
        <p style={{ color: 'var(--text-muted)', maxWidth: 360, margin: 0, fontSize: '0.875rem' }}>
          The Form Builder requires an existing template. Create a new template from the Templates page first, then open it here.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/templates')}>
          Go to Templates
        </button>
      </div>
    );
  }

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
          {workflowSchema.workflow_definition_id && (
            <span className="badge badge-info" title="This template uses workflow stages as parties">
              {workflowSchema.workflow_name || 'Workflow'}
            </span>
          )}
        </div>

        {/* Party tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Assign to:
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {parties.map((p, i) => (
              editingPartyId === p.id ? (
                <input
                  key={p.id}
                  className="form-input"
                  defaultValue={p.name}
                  autoFocus
                  style={{ fontSize: 12, padding: '3px 8px', width: 110, borderColor: p.color }}
                  onBlur={(e) => renameParty(p.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') renameParty(p.id, e.target.value);
                    if (e.key === 'Escape') setEditingPartyId(null);
                  }}
                />
              ) : (
                <button
                  key={p.id}
                  className="btn btn-sm"
                  onClick={() => setActivePartyIdx(i)}
                  onDoubleClick={() => setEditingPartyId(p.id)}
                  title="Double-click to rename"
                  style={{
                    color: p.color,
                    borderColor: activePartyIdx === i ? p.color : 'var(--border)',
                    background: activePartyIdx === i ? `${p.color}18` : 'transparent',
                    fontSize: 12,
                  }}
                >
                  {p.name}
                </button>
              )
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

        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {pageImages.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Replace the current document with a new PDF"
              style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}
            >
              ⬆ Replace PDF
            </button>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={saving || saveMutation.isPending}
          >
            {saving || saveMutation.isPending ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>

      {/* Hidden file input — always mounted so both the upload zone and "Replace PDF" button can trigger it */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUploadPdf(file);
          e.target.value = '';
        }}
      />

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

          {!loadingPages && !uploading && pageImages.length === 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDropActive(true); }}
              onDragLeave={() => setDropActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDropActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleUploadPdf(file);
              }}
              style={{
                width: DOC_WIDTH,
                minHeight: 520,
                background: dropActive ? 'rgba(37,99,235,0.04)' : 'white',
                borderRadius: 8,
                boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.25rem',
                border: dropActive ? '2px dashed #2563eb' : '2px dashed #cbd5e1',
                transition: 'border-color 0.15s, background 0.15s',
                padding: '2.5rem 2rem',
                cursor: 'default',
              }}
            >
              {/* Icon */}
              <div style={{
                width: 72,
                height: 72,
                borderRadius: '50%',
                background: '#eff6ff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}>
                📄
              </div>

              {/* Heading */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: '1.0625rem', color: 'var(--text-primary)', marginBottom: 6 }}>
                  Upload a PDF to get started
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: 360, lineHeight: 1.5 }}>
                  Drop a PDF here, or click the button below. The document will appear as the canvas background
                  so you can drag and drop fields exactly where they need to go.
                </div>
              </div>

              {/* Primary action */}
              <button
                className="btn btn-primary"
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                style={{ fontSize: '0.875rem', padding: '0.5rem 1.5rem', gap: 8, display: 'flex', alignItems: 'center' }}
              >
                <span style={{ fontSize: '1rem' }}>⬆</span>
                Choose PDF file
              </button>

              {/* Divider + secondary */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 360 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={(e) => { e.stopPropagation(); navigate('/documents'); }}
                  style={{ fontSize: '0.8rem' }}
                >
                  Browse Documents library
                </button>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
                  to reuse an existing file
                </span>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 4 }}>
                PDF files only · Max 50 MB
              </div>
            </div>
          )}

          {uploading && (
            <div style={{
              width: DOC_WIDTH,
              minHeight: 520,
              background: 'white',
              borderRadius: 8,
              boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
            }}>
              <Spinner center />
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                Uploading and rendering pages…
              </div>
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
                onStartResize={startDragField}
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
  pageRefs, onPageClick, onSelectField, onDeleteField, onStartDrag, onStartResize,
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
            onStartDrag={(e, mode) => onStartDrag(e, idx, mode)}
            onStartResize={(e, resizeMode) => onStartResize(e, idx, resizeMode)}
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
  pageRefs, onPageClick, onSelectField, onDeleteField, onStartDrag, onStartResize,
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
            onStartDrag={(e, mode) => onStartDrag(e, idx, mode)}
            onStartResize={(e, resizeMode) => onStartResize(e, idx, resizeMode)}
          />
        ) : null,
      )}
    </div>
  );
}

// ─── FieldOverlay subcomponent ────────────────────────────────────────────────

function FieldOverlay({ field, idx, scale, isSelected, parties, onSelect, onDelete, onStartDrag, onStartResize }) {
  const color = partyColor(parties, field.party);
  const left = field.x * scale;
  const top = field.y * scale;
  const w = field.w * scale;
  const h = field.h * scale;

  const HANDLE_SIZE = 8;
  const handleBase = {
    position: 'absolute',
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    background: color,
    border: '1.5px solid white',
    borderRadius: 2,
    zIndex: 35,
    boxSizing: 'border-box',
  };
  const resizeHandles = isSelected ? [
    { mode: 'resize-nw', style: { top: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'nw-resize' } },
    { mode: 'resize-ne', style: { top: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'ne-resize' } },
    { mode: 'resize-sw', style: { bottom: -HANDLE_SIZE / 2, left: -HANDLE_SIZE / 2, cursor: 'sw-resize' } },
    { mode: 'resize-se', style: { bottom: -HANDLE_SIZE / 2, right: -HANDLE_SIZE / 2, cursor: 'se-resize' } },
  ] : [];

  return (
    <div
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        onSelect(e);
        onStartDrag(e);
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
      {resizeHandles.map(({ mode, style }) => (
        <div
          key={mode}
          style={{ ...handleBase, ...style }}
          onMouseDown={(e) => {
            e.stopPropagation();
            onStartResize(e, mode);
          }}
        />
      ))}
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
  const isSelect = ['dropdown', 'select', 'radio'].includes(field.type);
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
