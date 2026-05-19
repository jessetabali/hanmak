import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARTY_COLORS = ['#4f8ef7', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

const FIELD_DEFAULTS = {
  text: { w: 160, h: 28 }, textarea: { w: 200, h: 60 }, number: { w: 100, h: 28 },
  email: { w: 180, h: 28 }, date: { w: 140, h: 28 }, select: { w: 160, h: 28 },
  radio: { w: 160, h: 72 }, checkbox: { w: 140, h: 28 }, 'multi-select': { w: 160, h: 60 },
  attachment: { w: 210, h: 42 }, signature: { w: 200, h: 64 }, initials: { w: 80, h: 42 },
  approval: { w: 120, h: 42 }, label: { w: 200, h: 24 }, divider: { w: 300, h: 8 },
  pagebreak: { w: 300, h: 20 },
};

const FIELD_LABELS = {
  text: 'Text Field', textarea: 'Text Area', number: 'Number', email: 'Email',
  date: 'Date', select: 'Dropdown', radio: 'Radio Group', checkbox: 'Checkbox',
  'multi-select': 'Multi-Select', attachment: 'Attachment Upload', signature: 'Signature',
  initials: 'Initials', approval: 'Approval Stamp', label: 'Info Label',
  divider: 'Divider', pagebreak: 'Page Break',
};

const FIELD_COLORS = {
  text: '#4f8ef7', textarea: '#4f8ef7', number: '#4f8ef7', email: '#4f8ef7', date: '#4f8ef7',
  select: '#8b5cf6', radio: '#8b5cf6', checkbox: '#8b5cf6', 'multi-select': '#8b5cf6',
  attachment: '#8b5cf6', signature: '#10b981', initials: '#10b981', approval: '#10b981',
  label: '#f59e0b', divider: '#f59e0b', pagebreak: '#f59e0b',
};

const FIELD_GROUPS = [
  {
    label: 'Text & Input',
    tools: [
      { icon: 'T', type: 'text', label: 'Text Field' },
      { icon: '¶', type: 'textarea', label: 'Textarea' },
      { icon: '#', type: 'number', label: 'Number' },
      { icon: '@', type: 'email', label: 'Email' },
      { icon: '📅', type: 'date', label: 'Date' },
    ],
  },
  {
    label: 'Selection',
    tools: [
      { icon: '▼', type: 'select', label: 'Dropdown / Select' },
      { icon: '●', type: 'radio', label: 'Radio Group' },
      { icon: '☑', type: 'checkbox', label: 'Checkbox' },
      { icon: '⊞', type: 'multi-select', label: 'Multi-Select' },
      { icon: '📎', type: 'attachment', label: 'Attachment Upload' },
    ],
  },
  {
    label: 'Signing',
    tools: [
      { icon: '✍', type: 'signature', label: 'Signature' },
      { icon: '✦', type: 'initials', label: 'Initials' },
      { icon: '✓', type: 'approval', label: 'Approval Stamp' },
    ],
  },
  {
    label: 'Static',
    tools: [
      { icon: 'i', type: 'label', label: 'Info Label' },
      { icon: '—', type: 'divider', label: 'Divider' },
      { icon: '§', type: 'pagebreak', label: 'Page Break' },
    ],
  },
];

const DOC_WIDTH = 1040;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fieldApiType(type) {
  const supported = ['text', 'textarea', 'number', 'email', 'date', 'select', 'checkbox', 'signature', 'initials', 'attachment'];
  if (supported.includes(type)) return type;
  if (type === 'radio' || type === 'multi-select') return 'select';
  if (type === 'approval') return 'checkbox';
  return 'text';
}

function fieldKey(field, index) {
  return `${field.type}-${field.label || 'field'}-${index + 1}`
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || `field-${index + 1}`;
}

// Lazy-load PDF.js and Mammoth from npm packages (no CDN required)
let _pdfjsLib = null;
async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib;
  const [lib, { default: workerSrc }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  lib.GlobalWorkerOptions.workerSrc = workerSrc;
  _pdfjsLib = lib;
  return lib;
}

let _mammoth = null;
async function getMammoth() {
  if (_mammoth) return _mammoth;
  const mod = await import('mammoth/mammoth.browser.js');
  _mammoth = mod.default || mod;
  return _mammoth;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function FormBuilder() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  // Mutable refs — updated during drag/resize without triggering re-renders
  const fbFieldsRef = useRef({});
  const fbFieldCounterRef = useRef(0);
  const fbPageHeightsRef = useRef([]);
  const fbPageSizesRef = useRef([]);
  const fbPagePreviewsRef = useRef([]);
  const fbSourceFileRef = useRef(null);
  const fbSourceFilenameRef = useRef('');
  const fbSourceDocumentIdRef = useRef(null);
  const fbEditingTemplateRef = useRef(null);
  const fbEditingVersionRef = useRef(null);
  const fbDragTypeRef = useRef(null);

  // State for React rendering
  const [pages, setPages] = useState([]);
  const [fields, setFields] = useState({});
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [parties, setParties] = useState(['party-1', 'party-2', 'party-3']);
  const [currentParty, setCurrentParty] = useState('party-1');
  const [templateName, setTemplateName] = useState('New Template');
  const [statusBadge, setStatusBadge] = useState({ text: 'Draft', cls: 'badge-warning' });
  const [processing, setProcessing] = useState({ show: false, title: '', sub: '', pct: 0 });
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const canvasWrapRef = useRef(null);
  const fileInputRef = useRef(null);

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const getPageSize = (pageIndex) => fbPageSizesRef.current[pageIndex] || { w: DOC_WIDTH, h: 1471 };

  const clampToPage = (pg, x, y, w, h) => {
    const size = getPageSize(pg);
    const fw = Math.max(40, Number(w || 160));
    const fh = Math.max(18, Number(h || 32));
    return {
      x: Math.max(0, Math.min(Math.round(x), Math.max(0, size.w - fw))),
      y: Math.max(0, Math.min(Math.round(y), Math.max(0, size.h - fh))),
      w: Math.min(fw, size.w), h: Math.min(fh, size.h), page: pg,
    };
  };

  const showProc = (show, title = '', sub = '', pct = 0) => setProcessing({ show, title, sub, pct });

  // ── Mount pages ───────────────────────────────────────────────────────────────
  const mountPages = useCallback((pagesData, filename) => {
    const heights = [], sizes = [], previews = [];
    let totalH = 0;
    pagesData.forEach((pg, i) => {
      heights.push(totalH);
      sizes.push({ w: pg.w || DOC_WIDTH, h: pg.h || 1471 });
      previews.push({ type: 'image', src: pg.dataUrl || '', w: pg.w || DOC_WIDTH, h: pg.h || 1471 });
      totalH += (pg.h || 1471) + (i < pagesData.length - 1 ? 20 : 0);
    });
    fbPageHeightsRef.current = heights;
    fbPageSizesRef.current = sizes;
    fbPagePreviewsRef.current = previews;
    setPages(pagesData);
    if (filename) setTemplateName(filename.replace(/\.[^.]+$/, ''));
    toast.success(`${pagesData.length} page${pagesData.length > 1 ? 's' : ''} loaded — drag fields onto the document`);
  }, [toast]);

  // ── PDF rendering ─────────────────────────────────────────────────────────────
  const renderPDF = useCallback(async (file) => {
    showProc(true, 'Loading PDF engine…', 'Initializing PDF.js', 5);
    const pdfjsLib = await getPdfjs();
    showProc(true, 'Parsing PDF…', 'Reading document structure', 10);
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const total = pdf.numPages;
    const pageImages = [];
    for (let i = 1; i <= total; i++) {
      showProc(true, `Rendering page ${i} of ${total}…`, 'Converting to image', 10 + Math.round((i / total) * 85));
      const page = await pdf.getPage(i);
      const baseVp = page.getViewport({ scale: 1 });
      const scale = DOC_WIDTH / baseVp.width;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, intent: 'display' }).promise;
      pageImages.push({ dataUrl: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height });
    }
    showProc(true, 'Building canvas…', 'Assembling pages', 97);
    mountPages(pageImages, file.name);
    showProc(false);
  }, [mountPages]);

  const renderDocx = useCallback(async (file) => {
    showProc(true, 'Loading DOCX engine…', 'Initializing Mammoth.js', 5);
    const mammoth = await getMammoth();
    showProc(true, 'Converting DOCX…', 'Extracting content', 40);
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    showProc(true, 'Rendering…', 'Building canvas', 80);
    const W = DOC_WIDTH, H = 1471;
    fbPageHeightsRef.current = [0];
    fbPageSizesRef.current = [{ w: W, h: H }];
    fbPagePreviewsRef.current = [{ type: 'html', html: result.value, w: W, h: H }];
    setPages([{ dataUrl: '', w: W, h: H, html: result.value }]);
    setTemplateName(file.name.replace(/\.[^.]+$/, ''));
    showProc(false);
    toast.success('DOCX loaded — drag fields onto the document');
  }, [toast]);

  const processFile = useCallback(async (file) => {
    fbSourceFileRef.current = file;
    fbSourceFilenameRef.current = file.name;
    fbSourceDocumentIdRef.current = null;
    const ext = file.name.split('.').pop().toLowerCase();
    showProc(true, 'Loading file…', `Reading ${file.name}`, 0);
    try {
      if (ext === 'pdf') await renderPDF(file);
      else if (ext === 'docx' || ext === 'doc') await renderDocx(file);
      else { toast.error('Please upload a PDF or DOCX file'); showProc(false); }
    } catch (err) {
      console.error(err);
      toast.error('Error processing file: ' + err.message);
      showProc(false);
    }
  }, [renderPDF, renderDocx, toast]);

  // ── Load existing template on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    (async () => {
      try {
        const template = await apiClient.get(EP.TEMPLATE(templateId)).then(r => r.data);
        if (cancelled) return;
        fbEditingTemplateRef.current = template;
        setTemplateName(template.name || 'New Template');

        const versionsRes = await apiClient.get(EP.TEMPLATE_VERSIONS, { params: { template: templateId } }).then(r => r.data);
        if (cancelled) return;
        const versions = versionsRes.results || versionsRes;
        const latest = Array.isArray(versions) ? versions[0] : null;
        fbEditingVersionRef.current = latest;
        if (latest) setStatusBadge({ text: `v${latest.version_number || 1}`, cls: 'badge-warning' });

        // Load parties (deduplicate — multiple saves produce multiple party rows)
        if (latest?.id) {
          try {
            const pr = await apiClient.get(EP.TEMPLATE_PARTIES, { params: { template_version: latest.id } }).then(r => r.data);
            if (cancelled) return;
            const pl = pr.results || pr;
            if (Array.isArray(pl) && pl.length) {
              const unique = [...new Set(pl.map(p => p.role_key))];
              if (unique.length) setParties(unique);
            }
          } catch { /* keep defaults */ }
        }

        // Load document
        const documentId = latest?.document || latest?.field_schema?.document_id;
        if (documentId) {
          fbSourceDocumentIdRef.current = documentId;
          try {
            const doc = await apiClient.get(EP.DOCUMENT(documentId)).then(r => r.data);
            if (cancelled) return;
            if (doc.pages?.length && doc.pages.some(p => p.image_url)) {
              const sorted = doc.pages.slice().sort((a, b) => a.page_number - b.page_number);
              mountPages(sorted.map(p => ({ dataUrl: p.image_url || '', w: p.width || DOC_WIDTH, h: p.height || 1471 })), null);
              setTemplateName(template.name || 'New Template');
            } else if (doc.file_url) {
              showProc(true, 'Loading document…', 'Fetching file', 10);
              const resp = await fetch(doc.file_url);
              const blob = await resp.blob();
              const fname = (doc.title || template.name || 'document') + '.pdf';
              const file = new File([blob], fname, { type: doc.mime_type || 'application/pdf' });
              // Don't store in sourceFile — use existing doc ID on save
              const savedSrc = fbSourceDocumentIdRef.current;
              await renderPDF(file);
              fbSourceFileRef.current = null;
              fbSourceDocumentIdRef.current = savedSrc;
              setTemplateName(template.name || 'New Template');
            }
          } catch (err) {
            if (!cancelled) toast.error('Could not render document: ' + err.message);
          }
        }

        // Load fields from version
        if (latest?.field_schema?.fields?.length) {
          const newFields = {};
          latest.field_schema.fields.forEach((f) => {
            const id = 'f' + (++fbFieldCounterRef.current);
            const pg = Math.max(0, (f.page || 1) - 1);
            const ps = fbPageSizesRef.current[pg] || { w: DOC_WIDTH, h: 1471 };
            newFields[id] = {
              id, type: f.original_type || f.field_type || 'text',
              x: f.x_pct !== undefined ? f.x_pct * ps.w : (f.x || 0),
              y: f.y_pct !== undefined ? f.y_pct * ps.h : (f.y || 0),
              w: f.width_pct !== undefined ? f.width_pct * ps.w : (f.width || f.w || 160),
              h: f.height_pct !== undefined ? f.height_pct * ps.h : (f.height || f.h || 32),
              page: pg,
              label: f.label || 'Field',
              party: f.party_key || 'party-1',
              required: f.required !== false,
              options: f.options || [],
            };
          });
          fbFieldsRef.current = newFields;
          if (!cancelled) setFields({ ...newFields });
          const firstId = Object.keys(newFields)[0];
          if (firstId && !cancelled) setSelectedFieldId(firstId);
        }

        if (!cancelled) toast.success(`Loaded ${template.name} for editing`);
      } catch (err) {
        if (!cancelled) toast.error('Could not load template: ' + err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Field operations ──────────────────────────────────────────────────────────
  const addField = useCallback((type, x, y, page) => {
    const id = 'f' + (++fbFieldCounterRef.current);
    const def = FIELD_DEFAULTS[type] || { w: 160, h: 28 };
    const pg = Math.max(0, Math.min(page || 0, Math.max(0, fbPageSizesRef.current.length - 1)));
    const size = fbPageSizesRef.current[pg] || { w: DOC_WIDTH, h: 1471 };
    const field = {
      id, type, page: pg,
      x: Math.max(0, Math.min(Math.round(x), Math.max(0, size.w - def.w))),
      y: Math.max(0, Math.min(Math.round(y), Math.max(0, size.h - def.h))),
      w: Math.min(def.w, size.w), h: Math.min(def.h, size.h),
      label: FIELD_LABELS[type] || type,
      party: currentParty,
      required: true, options: [],
    };
    fbFieldsRef.current[id] = field;
    setFields(prev => ({ ...prev, [id]: field }));
    setSelectedFieldId(id);
    return id;
  }, [currentParty]);

  const updateField = useCallback((id, patch) => {
    if (!fbFieldsRef.current[id]) return;
    const updated = { ...fbFieldsRef.current[id], ...patch };
    fbFieldsRef.current[id] = updated;
    setFields(prev => ({ ...prev, [id]: updated }));
  }, []);

  const deleteField = useCallback((id) => {
    delete fbFieldsRef.current[id];
    setFields(prev => { const n = { ...prev }; delete n[id]; return n; });
    setSelectedFieldId(prev => prev === id ? null : prev);
  }, []);

  const duplicateField = useCallback((id) => {
    const f = fbFieldsRef.current[id];
    if (!f) return;
    const nid = 'f' + (++fbFieldCounterRef.current);
    const size = fbPageSizesRef.current[f.page || 0] || { w: DOC_WIDTH, h: 1471 };
    const nf = { ...f, id: nid,
      x: Math.min(f.x + 20, Math.max(0, size.w - f.w)),
      y: Math.min(f.y + 20, Math.max(0, size.h - f.h)),
    };
    fbFieldsRef.current[nid] = nf;
    setFields(prev => ({ ...prev, [nid]: nf }));
    setSelectedFieldId(nid);
    toast.success('Field duplicated');
  }, [toast]);

  // ── Palette drag ──────────────────────────────────────────────────────────────
  const handlePaletteDragStart = useCallback((e, type) => {
    fbDragTypeRef.current = type;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', type);
  }, []);

  const handlePageDragOver = useCallback((e) => {
    if (fbDragTypeRef.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
  }, []);

  const handlePageDrop = useCallback((e, pageIndex) => {
    e.preventDefault();
    const type = fbDragTypeRef.current;
    fbDragTypeRef.current = null;
    if (!type) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addField(type, Math.round(e.clientX - rect.left), Math.round(e.clientY - rect.top), pageIndex);
  }, [addField]);

  const handlePaletteClick = useCallback((type) => {
    if (pages.length === 0) { toast.info('Upload a document first'); return; }
    const countOnFirst = Object.values(fbFieldsRef.current).filter(f => f.page === 0).length;
    addField(type, 40, 40 + countOnFirst * 44, 0);
  }, [pages.length, addField, toast]);

  // ── Field move ────────────────────────────────────────────────────────────────
  const startFieldMove = useCallback((e, id) => {
    e.preventDefault();
    const f = fbFieldsRef.current[id];
    if (!f) return;
    const sx = e.clientX, sy = e.clientY, ox = f.x, oy = f.y;
    const move = (ev) => {
      const size = fbPageSizesRef.current[f.page || 0] || { w: DOC_WIDTH, h: 1471 };
      const nx = Math.max(0, Math.min(Math.round(ox + ev.clientX - sx), Math.max(0, size.w - f.w)));
      const ny = Math.max(0, Math.min(Math.round(oy + ev.clientY - sy), Math.max(0, size.h - f.h)));
      fbFieldsRef.current[id] = { ...fbFieldsRef.current[id], x: nx, y: ny };
      const el = document.getElementById('fbf-' + id);
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
    };
    const up = () => {
      const f2 = fbFieldsRef.current[id];
      if (f2) setFields(prev => ({ ...prev, [id]: { ...f2 } }));
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  // ── Field resize ──────────────────────────────────────────────────────────────
  const startFieldResize = useCallback((e, id, dir) => {
    e.preventDefault(); e.stopPropagation();
    const f = fbFieldsRef.current[id];
    if (!f) return;
    const sx = e.clientX, sy = e.clientY;
    const ow = f.w, oh = f.h, ox = f.x, oy = f.y;
    const minW = 40, minH = 18;
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let nw = ow, nh = oh, nx = ox, ny = oy;
      if (dir.includes('e')) nw = Math.max(minW, ow + dx);
      if (dir.includes('s')) nh = Math.max(minH, oh + dy);
      if (dir.includes('w')) { nw = Math.max(minW, ow - dx); nx = ox + ow - nw; }
      if (dir.includes('n')) { nh = Math.max(minH, oh - dy); ny = oy + oh - nh; }
      const size = fbPageSizesRef.current[f.page || 0] || { w: DOC_WIDTH, h: 1471 };
      nx = Math.max(0, Math.min(Math.round(nx), Math.max(0, size.w - minW)));
      ny = Math.max(0, Math.min(Math.round(ny), Math.max(0, size.h - minH)));
      nw = Math.min(nw, size.w - nx); nh = Math.min(nh, size.h - ny);
      fbFieldsRef.current[id] = { ...fbFieldsRef.current[id], x: nx, y: ny, w: nw, h: nh };
      const el = document.getElementById('fbf-' + id);
      if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; el.style.width = nw + 'px'; el.style.height = nh + 'px'; }
    };
    const up = () => {
      const f2 = fbFieldsRef.current[id];
      if (f2) setFields(prev => ({ ...prev, [id]: { ...f2 } }));
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }, []);

  // ── Scroll to page ────────────────────────────────────────────────────────────
  const scrollToPage = useCallback((i) => {
    const wrap = canvasWrapRef.current;
    if (!wrap) return;
    const heights = fbPageHeightsRef.current;
    wrap.scrollTop = (heights[i] || 0) + 24;
  }, []);

  // ── Serialize fields ──────────────────────────────────────────────────────────
  const serializeFields = useCallback(() => {
    return Object.values(fbFieldsRef.current).map((field, index) => {
      const ps = fbPageSizesRef.current[field.page || 0] || { w: DOC_WIDTH, h: 1471 };
      const x = Math.round(field.x || 0), y = Math.round(field.y || 0);
      const w = Math.round(field.w || 160), h = Math.round(field.h || 32);
      return {
        local_id: field.id,
        field_key: fieldKey(field, index),
        field_type: fieldApiType(field.type),
        original_type: field.type,
        label: field.label, required: !!field.required,
        party_key: field.party || 'party-1',
        page: (field.page || 0) + 1,
        x, y, width: w, height: h,
        page_width: Math.round(ps.w || DOC_WIDTH),
        page_height: Math.round(ps.h || 1471),
        coordinate_basis: 'page-pixels',
        x_pct: ps.w ? +(x / ps.w).toFixed(6) : 0,
        y_pct: ps.h ? +(y / ps.h).toFixed(6) : 0,
        width_pct: ps.w ? +(w / ps.w).toFixed(6) : 0,
        height_pct: ps.h ? +(h / ps.h).toFixed(6) : 0,
        options: field.options || [],
      };
    });
  }, []);

  // ── Export JSON ───────────────────────────────────────────────────────────────
  const exportJson = useCallback(() => {
    const payload = {
      name: templateName, source: 'form-builder', page_count: pages.length,
      document_width: DOC_WIDTH, source_document_id: fbSourceDocumentIdRef.current,
      source_filename: fbSourceFilenameRef.current, parties, fields: serializeFields(),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${templateName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'template'}-form-builder.json`;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
    toast.success('Form builder JSON exported');
  }, [templateName, pages.length, parties, serializeFields, toast]);

  // ── Add party ─────────────────────────────────────────────────────────────────
  const addParty = useCallback(() => {
    const next = `party-${parties.length + 1}`;
    if (parties.includes(next)) return;
    setParties(prev => [...prev, next]);
    toast.success(`${next} added`);
  }, [parties, toast]);

  // ── Save ──────────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (pages.length === 0) { toast.error('Upload a document before saving'); return; }
    const serializedFields = serializeFields();
    if (!serializedFields.length) { toast.error('Add at least one field before saving'); return; }

    const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
    setSaving(true);

    try {
      let docId = fbSourceDocumentIdRef.current;
      const file = fbSourceFileRef.current;

      if (!docId && !file) { toast.error('No document — upload a PDF first'); return; }

      if (file && !docId) {
        showProc(true, 'Uploading document…', 'Sending to server', 10);
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', (fbSourceFilenameRef.current || templateName).replace(/\.[^.]+$/, ''));
        fd.append('mime_type', file.type || 'application/pdf');
        if (orgId) fd.append('organization', orgId);
        const docRes = await apiClient.post(EP.DOCUMENTS, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        docId = docRes.data.id;
        fbSourceDocumentIdRef.current = docId;
        fbSourceFileRef.current = null;
        showProc(true, 'Processing…', 'Extracting pages', 30);
        try { await apiClient.post(EP.DOCUMENT_PROCESS(docId), {}); } catch { /* ok */ }
        showProc(true, 'Rendering pages…', 'Generating images', 50);
        await apiClient.post(EP.DOCUMENT_RENDER_PAGES(docId), { page_count: Math.max(1, pages.length), width: DOC_WIDTH });
        try { await apiClient.post(EP.DOCUMENT_SCAN(docId), {}); } catch { /* ok */ }
      }

      showProc(true, 'Saving template…', 'Updating name', 60);
      await apiClient.patch(EP.TEMPLATE(templateId), { name: templateName, status: 'active' });

      showProc(true, 'Creating version…', 'Saving field schema', 70);
      const editVer = fbEditingVersionRef.current;
      const nextVersion = editVer ? Number(editVer.version_number || 1) + 1 : 1;
      const versionRes = await apiClient.post(EP.TEMPLATE_VERSIONS, {
        template: templateId, version_number: nextVersion, document: docId,
        field_schema: { source: 'form-builder', page_count: pages.length, document_width: DOC_WIDTH, document_id: docId, fields: serializedFields },
        workflow_schema: { stages: [{ key: 'signer', label: 'Signer', type: 'signing', order: 1 }, { key: 'approver', label: 'Approver', type: 'approval', order: 2 }] },
        changelog: editVer ? `Builder edit saved as v${nextVersion}` : 'Initial form builder save',
        is_published: true,
      });
      const versionId = versionRes.data.id;

      await apiClient.patch(EP.TEMPLATE(templateId), { version: nextVersion });

      showProc(true, 'Creating parties…', 'Setting up roles', 80);
      const usedPartyKeys = [...new Set(serializedFields.map(f => f.party_key || 'party-1'))];
      const createdParties = {};
      for (let i = 0; i < usedPartyKeys.length; i++) {
        const pk = usedPartyKeys[i];
        const idx = parties.indexOf(pk);
        const pr = await apiClient.post(EP.TEMPLATE_PARTIES, {
          role_key: pk, label: pk.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          routing_order: idx >= 0 ? idx + 1 : i + 1, template_version: versionId,
        });
        createdParties[pk] = pr.data;
      }

      showProc(true, 'Creating fields…', `Saving ${serializedFields.length} field(s)`, 90);
      for (const f of serializedFields) {
        await apiClient.post(EP.FORM_FIELDS, {
          template: templateId, template_version: versionId,
          party: createdParties[f.party_key]?.id || null,
          field_key: f.field_key, field_type: f.field_type, label: f.label,
          required: f.required, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height,
          page_width: f.page_width, page_height: f.page_height, options: f.options,
        });
      }

      showProc(false);
      setStatusBadge({ text: 'Saved', cls: 'badge-success' });
      toast.success(`Template saved as v${nextVersion} with ${serializedFields.length} field(s)`);
      fbEditingVersionRef.current = null;
      navigate('/templates');
    } catch (err) {
      showProc(false);
      toast.error('Save failed: ' + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  }, [templateId, templateName, pages, parties, serializeFields, navigate, toast]);

  // ── Render ────────────────────────────────────────────────────────────────────
  const selectedField = selectedFieldId ? fields[selectedFieldId] : null;

  if (!templateId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '2.5rem' }}>🛠</div>
        <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>No template selected</div>
        <p style={{ color: 'var(--text-muted)', maxWidth: 360, margin: 0, fontSize: '0.875rem' }}>
          Create a new template from the Templates page, then open it here.
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/templates')}>Go to Templates</button>
      </div>
    );
  }

  return (
    <div style={{ margin: '-28px', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>

      {/* Processing overlay */}
      {processing.show && <ProcessingOverlay {...processing} />}

      {/* Preview modal */}
      {showPreview && (
        <PreviewModal
          pages={pages}
          fields={Object.values(fbFieldsRef.current)}
          pageSizes={fbPageSizesRef.current}
          pagePreviews={fbPagePreviewsRef.current}
          templateName={templateName}
          onClose={() => setShowPreview(false)}
          onSave={() => { setShowPreview(false); handleSave(); }}
        />
      )}

      {/* Toolbar */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/templates')}>← Templates</button>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
          <input
            value={templateName}
            onChange={e => setTemplateName(e.target.value)}
            onClick={e => e.target.select()}
            style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', border: 'none', background: 'transparent', outline: 'none', width: 220 }}
          />
          <span className={`badge ${statusBadge.cls}`}>{statusBadge.text}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assign to:</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {parties.map((pk, i) => (
              <button key={pk} className="btn btn-sm" onClick={() => setCurrentParty(pk)} style={{ color: PARTY_COLORS[i % PARTY_COLORS.length], borderColor: currentParty === pk ? PARTY_COLORS[i % PARTY_COLORS.length] : 'var(--border)', background: currentParty === pk ? `${PARTY_COLORS[i % PARTY_COLORS.length]}18` : 'transparent', fontSize: 12 }}>
                {pk.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            ))}
            <button className="btn btn-ghost btn-sm" onClick={addParty} style={{ fontSize: 12 }}>+ Add</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { if (pages.length === 0) { toast.info('Upload a document before previewing'); return; } setShowPreview(true); }}>Preview</button>
          <button className="btn btn-ghost btn-sm" onClick={exportJson} title="Export JSON">⬇</button>
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Template'}</button>
        </div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) { processFile(f); e.target.value = ''; } }} />
      </div>

      {/* 3-panel layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr 270px', flex: 1, overflow: 'hidden' }}>

        {/* LEFT: Palette + page thumbs */}
        <div style={{ background: 'var(--bg-card)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Field Types</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
            {FIELD_GROUPS.map(group => (
              <div key={group.label}>
                <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{group.label}</div>
                {group.tools.map(tool => {
                  const color = FIELD_COLORS[tool.type] || '#4f8ef7';
                  return (
                    <div
                      key={tool.type}
                      draggable
                      onDragStart={e => handlePaletteDragStart(e, tool.type)}
                      onClick={() => handlePaletteClick(tool.type)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', cursor: 'grab', fontSize: 12.5, color: 'var(--text-secondary)', userSelect: 'none', transition: 'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-secondary)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <span style={{ fontSize: 14, width: 20, textAlign: 'center', color }}>{tool.icon}</span>
                      <span>{tool.label}</span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Page thumbnails */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Pages</div>
            {pages.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Upload a document to see pages</div>
            ) : (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {pages.map((pg, i) => (
                  <button key={i} onClick={() => scrollToPage(i)} title={`Go to page ${i + 1}`}
                    style={{ width: 36, height: 46, borderRadius: 4, border: '1.5px solid var(--border)', background: pg.dataUrl ? 'transparent' : 'var(--bg-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', overflow: 'hidden', padding: 0 }}>
                    {pg.dataUrl ? <img src={pg.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Canvas */}
        <div
          ref={canvasWrapRef}
          style={{ background: '#d1d9e6', overflow: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, gap: 0, position: 'relative' }}
          onDragOver={e => { if (fbDragTypeRef.current) e.preventDefault(); }}
        >
          {/* Upload zone */}
          {pages.length === 0 && <UploadZone onFile={processFile} fileInputRef={fileInputRef} />}

          {/* Pages */}
          {pages.map((pg, pageIndex) => {
            const size = fbPageSizesRef.current[pageIndex] || { w: DOC_WIDTH, h: 1471 };
            return (
              <div key={pageIndex} style={{ marginBottom: pageIndex < pages.length - 1 ? 20 : 0 }}>
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginBottom: 4 }}>Page {pageIndex + 1}</div>
                <div
                  style={{ position: 'relative', width: size.w, height: size.h, background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.12)', flexShrink: 0 }}
                  onDragOver={handlePageDragOver}
                  onDrop={e => handlePageDrop(e, pageIndex)}
                  onClick={e => { if (e.target === e.currentTarget) setSelectedFieldId(null); }}
                >
                  {pg.dataUrl && (
                    <img src={pg.dataUrl} alt={`Page ${pageIndex + 1}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none', userSelect: 'none' }} />
                  )}
                  {pg.html && (
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: 'white' }}>
                      <div style={{ padding: 40, fontSize: 11, lineHeight: 1.8, color: '#334155', fontFamily: 'Georgia, serif' }} dangerouslySetInnerHTML={{ __html: pg.html }} />
                    </div>
                  )}
                  {Object.values(fields).filter(f => (f.page || 0) === pageIndex).map(field => (
                    <FieldOverlay
                      key={field.id}
                      field={field}
                      isSelected={selectedFieldId === field.id}
                      onClick={() => setSelectedFieldId(field.id)}
                      onStartMove={e => startFieldMove(e, field.id)}
                      onStartResize={(e, dir) => startFieldResize(e, field.id, dir)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* RIGHT: Inspector */}
        <div style={{ background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Inspector</div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {selectedField ? (
              <FieldInspector
                field={selectedField}
                parties={parties}
                pageCount={pages.length}
                onChange={(patch) => updateField(selectedFieldId, patch)}
                onDelete={() => deleteField(selectedFieldId)}
                onDuplicate={() => duplicateField(selectedFieldId)}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>☝️</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' }}>Upload a document then drag fields onto it</div>
                <div style={{ fontSize: 12, marginTop: 6 }}>Click any field to configure it</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ProcessingOverlay ────────────────────────────────────────────────────────

function ProcessingOverlay({ title, sub, pct }) {
  return (
    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '2rem 3rem', textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 200, minWidth: 280 }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚙️</div>
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.375rem' }}>{title}</div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>{sub}</div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({ onFile, fileInputRef }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      style={{ width: DOC_WIDTH, minHeight: 480, background: 'white', borderRadius: 4, boxShadow: '0 4px 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', cursor: 'pointer', border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`, transition: 'border-color 0.15s' }}
      onClick={() => fileInputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <div style={{ width: 56, height: 56, background: '#dbeafe', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontSize: '1.5rem' }}>⬆</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>Upload your document</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Drag &amp; drop a PDF or Word file, or click to browse</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>PDF, DOCX · up to 50 MB per file</div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>📄 Choose File</button>
    </div>
  );
}

// ─── FieldOverlay ─────────────────────────────────────────────────────────────

const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function rhStyle(dir) {
  const half = '-5px', mid = 'calc(50% - 5px)';
  const pos = {
    se: { right: half, bottom: half, cursor: 'se-resize' },
    sw: { left: half, bottom: half, cursor: 'sw-resize' },
    ne: { right: half, top: half, cursor: 'ne-resize' },
    nw: { left: half, top: half, cursor: 'nw-resize' },
    e: { right: half, top: mid, cursor: 'e-resize' },
    w: { left: half, top: mid, cursor: 'w-resize' },
    s: { bottom: half, left: mid, cursor: 's-resize' },
    n: { top: half, left: mid, cursor: 'n-resize' },
  };
  return { position: 'absolute', width: 10, height: 10, background: 'white', border: '1.5px solid #4f8ef7', borderRadius: 2, zIndex: 20, transition: 'opacity 0.12s', ...pos[dir] };
}

function FieldOverlay({ field, isSelected, onClick, onStartMove, onStartResize }) {
  const [hovered, setHovered] = useState(false);
  const color = FIELD_COLORS[field.type] || '#4f8ef7';
  const isSign = ['signature', 'initials', 'approval'].includes(field.type);
  const showHandles = isSelected || hovered;

  return (
    <div
      id={`fbf-${field.id}`}
      style={{
        position: 'absolute', left: field.x, top: field.y, width: field.w, height: field.h,
        background: `${color}${isSign ? '22' : '18'}`,
        border: `${isSign ? '2px' : '1.5px'} solid ${color}`,
        outline: isSelected ? '2.5px solid var(--primary)' : 'none', outlineOffset: 1,
        borderRadius: 3, boxSizing: 'border-box', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 6px', fontSize: 11, fontWeight: 500, color,
        zIndex: isSelected ? 20 : 10, userSelect: 'none', cursor: 'move',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={e => { if (e.target.dataset.rh) return; e.preventDefault(); onClick(); onStartMove(e); }}
      onClick={e => { if (!e.target.dataset.rh) onClick(); }}
    >
      <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', flex: 1, pointerEvents: 'none' }}>{field.label}</span>
      <span style={{ fontSize: 9, opacity: 0.65, flexShrink: 0, pointerEvents: 'none' }}>{(field.party || '').replace('party-', 'P')}</span>
      {RESIZE_DIRS.map(dir => (
        <div key={dir} data-rh="1" style={{ ...rhStyle(dir), opacity: showHandles ? 1 : 0 }}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onStartResize(e, dir); }} />
      ))}
    </div>
  );
}

// ─── FieldInspector ───────────────────────────────────────────────────────────

function FieldInspector({ field, parties, pageCount, onChange, onDelete, onDuplicate }) {
  const color = FIELD_COLORS[field.type] || '#4f8ef7';
  const isSelect = ['select', 'multi-select', 'radio'].includes(field.type);
  const isSign = field.type === 'signature';
  const noPlaceholder = ['signature', 'initials', 'approval', 'divider', 'pagebreak'].includes(field.type);

  const [localOptions, setLocalOptions] = useState(
    Array.isArray(field.options) && field.options.length ? field.options : (isSelect ? ['Option 1', 'Option 2', 'Option 3'] : [])
  );

  useEffect(() => {
    setLocalOptions(Array.isArray(field.options) && field.options.length ? field.options : (isSelect ? ['Option 1', 'Option 2', 'Option 3'] : []));
  }, [field.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncOptions = (opts) => { setLocalOptions(opts); onChange({ options: opts.filter(Boolean) }); };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontWeight: 700, fontSize: 13, flex: 1 }}>{field.label}</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>{field.type}</span>
      </div>

      <div className="form-group">
        <label className="form-label">Field Label</label>
        <input className="form-input" style={{ fontSize: 13 }} value={field.label} onChange={e => onChange({ label: e.target.value })} />
      </div>

      <div className="form-group">
        <label className="form-label">Assign to Party</label>
        <select className="form-input" style={{ fontSize: 13 }} value={field.party} onChange={e => onChange({ party: e.target.value })}>
          {parties.map((pk, i) => <option key={pk} value={pk}>{pk.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}{i === 0 ? ' (Sender)' : ''}</option>)}
        </select>
      </div>

      {isSelect && (
        <div className="form-group">
          <label className="form-label">Options</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
            {localOptions.map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <input className="form-input" value={opt} style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
                  onChange={e => { const n = [...localOptions]; n[i] = e.target.value; syncOptions(n); }} />
                <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', color: 'var(--danger)' }} onClick={() => syncOptions(localOptions.filter((_, j) => j !== i))}>×</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', fontSize: 12 }} onClick={() => syncOptions([...localOptions, ''])}>+ Add Option</button>
        </div>
      )}

      {!noPlaceholder && !isSelect && (
        <div className="form-group">
          <label className="form-label">Placeholder</label>
          <input className="form-input" style={{ fontSize: 13 }} placeholder="Hint text…" />
        </div>
      )}

      {isSign && (
        <div className="form-group">
          <label className="form-label">Allowed Methods</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[['Draw (canvas)', 'draw'], ['Type signature', 'type'], ['Upload image', 'upload']].map(([lbl, method]) => (
              <label key={method} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox"
                  checked={!field.options?.length || field.options.includes(method)}
                  onChange={e => {
                    const cur = field.options?.length ? [...field.options] : ['draw', 'type', 'upload'];
                    const next = e.target.checked ? [...new Set([...cur, method])] : cur.filter(m => m !== method);
                    onChange({ options: next });
                  }} />
                {lbl}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={!!field.required} onChange={e => onChange({ required: e.target.checked })} />
          Required field
        </label>
      </div>

      {/* Position & Size */}
      <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Position &amp; Size <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>(or drag &amp; resize)</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[['X (px)', 'x', field.x], ['Y (px)', 'y', field.y], ['Width', 'w', field.w], ['Height', 'h', field.h]].map(([lbl, prop, val]) => (
            <div key={prop}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>{lbl}</label>
              <input className="form-input" type="number" value={Math.round(val)} style={{ fontSize: 12, padding: '5px 8px' }}
                onChange={e => onChange({ [prop]: Math.max(prop === 'w' ? 40 : prop === 'h' ? 18 : 0, +e.target.value) })} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 3 }}>Page</label>
          <input className="form-input" type="number" value={(field.page || 0) + 1} min={1} max={Math.max(1, pageCount)} style={{ fontSize: 12, padding: '5px 8px', width: 70 }}
            onChange={e => onChange({ page: Math.max(0, +e.target.value - 1) })} />
        </div>
      </div>

      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%' }} onClick={onDuplicate}>⧉ Duplicate Field</button>
        <button className="btn btn-sm" style={{ width: '100%', background: '#fee2e2', color: 'var(--danger)', border: '1px solid #fca5a5' }} onClick={onDelete}>🗑 Delete Field</button>
      </div>
    </div>
  );
}

// ─── PreviewModal ─────────────────────────────────────────────────────────────

function PreviewModal({ pages, fields, pageSizes, pagePreviews, templateName, onClose, onSave }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, width: '90vw', maxWidth: 1100, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Signer Preview</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{templateName} · {fields.length} field{fields.length !== 1 ? 's' : ''}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 18, padding: '2px 8px' }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: '#dbe3ef', padding: 24 }}>
          <div style={{ width: DOC_WIDTH, maxWidth: DOC_WIDTH, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {pages.map((_, pageIndex) => {
              const size = (pageSizes && pageSizes[pageIndex]) || { w: DOC_WIDTH, h: 1471 };
              const preview = (pagePreviews && pagePreviews[pageIndex]) || {};
              const pageFields = fields.filter(f => (f.page || 0) === pageIndex);
              return (
                <div key={pageIndex} style={{ position: 'relative', width: size.w, height: size.h, background: 'white', boxShadow: '0 4px 24px rgba(0,0,0,0.16)', borderRadius: 2 }}>
                  <div style={{ position: 'absolute', left: 0, top: -20, fontSize: 11, color: '#64748b', fontWeight: 700 }}>Page {pageIndex + 1}</div>
                  {preview.type === 'image' && preview.src && (
                    <img src={preview.src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }} />
                  )}
                  {preview.type === 'html' && preview.html && (
                    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: 'white' }}>
                      <div style={{ padding: 60, fontSize: 11, lineHeight: 1.9, color: '#334155', fontFamily: 'Georgia, serif' }} dangerouslySetInnerHTML={{ __html: preview.html }} />
                    </div>
                  )}
                  {pageFields.map((field, fi) => <PreviewField key={fi} field={field} />)}
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onSave}>💾 Save Template</button>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ field }) {
  const color = FIELD_COLORS[field.type] || '#4f8ef7';
  const base = { position: 'absolute', left: Math.round(field.x || 0), top: Math.round(field.y || 0), width: Math.max(56, Math.round(field.w || 160)), height: Math.max(24, Math.round(field.h || 32)), zIndex: 5 };
  const inputStyle = { width: '100%', height: '100%', boxSizing: 'border-box', border: `1.5px solid ${color}`, background: 'rgba(255,255,255,0.96)', borderRadius: 4, fontSize: 12, padding: '4px 7px' };
  const labelHtml = <div style={{ position: 'absolute', left: 0, top: -18, fontSize: 10, fontWeight: 700, color, whiteSpace: 'nowrap' }}>{field.label}{field.required ? ' *' : ''}</div>;
  if (field.type === 'signature' || field.type === 'initials' || field.type === 'approval') {
    return <div style={base}>{labelHtml}<button disabled style={{ ...inputStyle, fontFamily: 'cursive', fontSize: 16, color: '#1e40af', textAlign: 'left', cursor: 'default' }}>Click to sign</button></div>;
  }
  if (field.type === 'checkbox') {
    return <label style={{ ...base, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 7px', boxSizing: 'border-box', border: `1.5px solid ${color}`, background: 'rgba(255,255,255,0.96)', borderRadius: 4, fontSize: 11, fontWeight: 600 }}><input type="checkbox" disabled /><span>{field.label}{field.required ? ' *' : ''}</span></label>;
  }
  if (field.type === 'select' || field.type === 'radio' || field.type === 'multi-select') {
    const opts = Array.isArray(field.options) && field.options.length ? field.options : ['Option 1', 'Option 2'];
    return <div style={base}>{labelHtml}<select disabled style={inputStyle}><option>Select…</option>{opts.map((o, i) => <option key={i}>{o}</option>)}</select></div>;
  }
  if (field.type === 'date') return <div style={base}>{labelHtml}<input type="date" disabled style={inputStyle} /></div>;
  if (field.type === 'attachment') return <div style={base}>{labelHtml}<input type="file" disabled style={{ ...inputStyle, padding: 7 }} /></div>;
  if (field.type === 'divider') return <div style={{ ...base, borderTop: `2px solid ${color}`, height: 2 }} />;
  if (field.type === 'label') return <div style={{ ...base, display: 'flex', alignItems: 'center', padding: '0 4px', fontSize: 12, fontWeight: 600, color }}>{field.label}</div>;
  if (field.type === 'pagebreak') return <div style={{ ...base, borderTop: `2px dashed ${color}`, height: 2 }} />;
  const inputType = ['email', 'number'].includes(field.type) ? field.type : 'text';
  return <div style={base}>{labelHtml}<input type={inputType} disabled placeholder={field.label} style={inputStyle} /></div>;
}
