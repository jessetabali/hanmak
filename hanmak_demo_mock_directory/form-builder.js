/* ===== Form Builder Page ===== */
registerPage('form-builder', () => `
<div style="margin:-28px;display:flex;flex-direction:column;height:calc(100vh - 56px);">

  <!-- Toolbar -->
  <div style="background:var(--bg-card);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:12px;flex-shrink:0;z-index:10;">
    <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
      <button class="btn btn-ghost btn-sm" onclick="navigate('templates')">${icon('chevron-left')} Templates</button>
      <button class="btn btn-ghost btn-sm" onclick="navigate('documents')">${icon('file-text')} Library</button>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      <input id="fb-template-name" value="New Template" style="font-size:13px;font-weight:600;color:var(--text-primary);border:none;background:transparent;outline:none;width:220px;" onclick="this.select()">
      <span class="badge badge-warning" id="fb-status-badge">Draft</span>
    </div>
    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
      <span style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Assign to:</span>
      <div id="party-tabs" style="display:flex;gap:4px;">
        <button class="party-tab active" style="color:#4f8ef7;border-color:#4f8ef7;background:rgba(79,142,247,0.1);" onclick="selectParty(this,'party-1')">Party 1</button>
        <button class="party-tab" style="color:#8b5cf6;" onclick="selectParty(this,'party-2')">Party 2</button>
        <button class="party-tab" style="color:#10b981;" onclick="selectParty(this,'party-3')">Party 3</button>
        <button class="party-tab" style="color:var(--text-muted);" onclick="addParty()">+ Add</button>
      </div>
    </div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button class="btn btn-ghost btn-sm" onclick="fbPreviewTemplate()">Preview</button>
      <button class="btn btn-ghost btn-sm" onclick="exportFbTemplateJson()">${icon('download')}</button>
      <button class="btn btn-primary btn-sm" onclick="saveFbTemplate()">Save Template</button>
    </div>
  </div>

  <!-- 3-panel layout -->
  <div style="display:grid;grid-template-columns:210px 1fr 270px;flex:1;overflow:hidden;">

    <!-- LEFT: Field Types -->
    <div style="background:var(--bg-card);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;">Field Types</div>
      <div style="flex:1;overflow-y:auto;padding:8px 0;">
        <div class="fb-tool-category">Text &amp; Input</div>
        ${fbTool('T','Text Field','text','#4f8ef7')}
        ${fbTool('¶','Textarea','textarea','#4f8ef7')}
        ${fbTool('#','Number','number','#4f8ef7')}
        ${fbTool('@','Email','email','#4f8ef7')}
        ${fbTool('📅','Date','date','#4f8ef7')}
        <div class="fb-tool-category" style="margin-top:4px;">Selection</div>
        ${fbTool('▼','Dropdown / Select','select','#8b5cf6')}
        ${fbTool('●','Radio Group','radio','#8b5cf6')}
        ${fbTool('☑','Checkbox','checkbox','#8b5cf6')}
        ${fbTool('⊞','Multi-Select','multi-select','#8b5cf6')}
        ${fbTool('📎','Attachment Upload','attachment','#8b5cf6')}
        <div class="fb-tool-category" style="margin-top:4px;">Signing</div>
        ${fbTool('✍','Signature','signature','#10b981')}
        ${fbTool('✦','Initials','initials','#10b981')}
        ${fbTool('✓','Approval Stamp','approval','#10b981')}
        <div class="fb-tool-category" style="margin-top:4px;">Static</div>
        ${fbTool('i','Info Label','label','#f59e0b')}
        ${fbTool('—','Divider','divider','#f59e0b')}
        ${fbTool('§','Page Break','pagebreak','#f59e0b')}
      </div>
      <div style="border-top:1px solid var(--border);padding:10px 12px;">
        <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">Pages</div>
        <div id="fb-page-thumbs" style="display:flex;gap:4px;flex-wrap:wrap;"></div>
        <div id="fb-page-empty" style="font-size:11px;color:var(--text-muted)">Upload a document to see pages</div>
      </div>
    </div>

    <!-- CENTER: Canvas -->
    <div style="background:#d1d9e6;overflow:auto;display:flex;flex-direction:column;align-items:center;padding:24px;gap:0;position:relative;" id="fb-canvas-wrap"
         ondragover="fbOnDragOver(event)" ondrop="fbOnDrop(event)">

      <!-- Upload zone -->
      <div id="fb-upload-zone" style="width:1040px;min-height:480px;background:white;border-radius:4px;box-shadow:0 4px 24px rgba(0,0,0,0.12);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1rem;cursor:pointer;border:2px dashed var(--border);transition:border-color 0.15s;"
           onclick="fbTriggerUpload()"
           ondragover="event.preventDefault();event.stopPropagation();this.style.borderColor='var(--primary)'"
           ondragleave="this.style.borderColor='var(--border)'"
           ondrop="fbUploadFileDrop(event)"
           onmouseenter="this.style.borderColor='var(--primary)'" onmouseleave="this.style.borderColor='var(--border)'">
        <div style="width:56px;height:56px;background:var(--primary-light,#dbeafe);border-radius:14px;display:flex;align-items:center;justify-content:center;color:var(--primary);font-size:1.5rem">${icon('upload')}</div>
        <div style="text-align:center">
          <div style="font-weight:700;font-size:1rem;color:var(--text-primary);margin-bottom:4px">Upload your document</div>
          <div style="font-size:0.8125rem;color:var(--text-muted)">Drag &amp; drop a PDF or Word file, or click to browse</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">PDF, DOCX &middot; up to 50 MB per file</div>
        </div>
        <div style="display:flex;gap:0.5rem">
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation();fbTriggerUpload()">${icon('file-text')} Choose File</button>
          ${window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();fbLoadSampleDoc()">Use Sample NDA</button>` : ''}
        </div>
        <input type="file" id="fb-file-input" accept=".pdf,.docx,.doc" style="display:none" onchange="fbHandleFileSelect(event)">
      </div>

      <!-- Rendered pages -->
      <div id="fb-pages-container" style="display:none;position:relative;"></div>

      <!-- Processing overlay -->
      <div id="fb-processing" style="display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:2rem 3rem;text-align:center;box-shadow:var(--shadow-lg);z-index:200;min-width:280px;">
        <div style="font-size:2rem;margin-bottom:0.75rem">⚙️</div>
        <div id="fb-processing-msg" style="font-weight:600;color:var(--text-primary);margin-bottom:0.375rem">Processing…</div>
        <div id="fb-processing-sub" style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem">Please wait</div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
          <div id="fb-progress-bar" style="height:100%;width:0%;background:var(--primary);border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Inspector -->
    <div style="background:var(--bg-card);border-left:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;">Inspector</div>
      <div id="fb-inspector-content" style="flex:1;overflow-y:auto;padding:14px;">
        <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
          <div style="font-size:2.5rem;margin-bottom:10px">☝️</div>
          <div style="font-size:13px;font-weight:500;color:var(--text-secondary)">Upload a document then drag fields onto it</div>
          <div style="font-size:12px;margin-top:6px;">Click any field to configure it</div>
        </div>
      </div>
    </div>
  </div>
</div>
`);

// ── State ─────────────────────────────────────────────────────────────────────
let _fbFields        = {};
let _fbPageHeights   = [];
let _fbPageSizes     = [];
let _fbPagePreviews  = [];
let _fbPageCount     = 0;
let _fbDocWidth      = 1040;
let _fbSelectedField = null;
let _fbDragType      = null;
let _fbFieldCounter  = 0;
let _fbCurrentParty  = 'party-1';
let _fbSourceFile    = null;
let _fbSourceFilename = '';
let _fbSourceDocumentId = null;
let _fbEditingTemplate = null;
let _fbEditingVersion = null;
let _fbParties = ['party-1', 'party-2', 'party-3'];

const _fbFieldDefaults = {
  text:{w:160,h:28},textarea:{w:200,h:60},number:{w:100,h:28},
  email:{w:180,h:28},date:{w:140,h:28},select:{w:160,h:28},
  radio:{w:160,h:72},checkbox:{w:140,h:28},'multi-select':{w:160,h:60},
  attachment:{w:210,h:42},
  signature:{w:200,h:64},initials:{w:80,h:42},approval:{w:120,h:42},
  label:{w:200,h:24},divider:{w:300,h:8},pagebreak:{w:300,h:20},
};
const _fbFieldLabels = {
  text:'Text Field',textarea:'Text Area',number:'Number',email:'Email',
  date:'Date',select:'Dropdown',radio:'Radio Group',checkbox:'Checkbox',
  'multi-select':'Multi-Select',attachment:'Attachment Upload',signature:'Signature',initials:'Initials',
  approval:'Approval Stamp',label:'Info Label',divider:'Divider',pagebreak:'Page Break',
};
const _fbFieldColors = {
  text:'#4f8ef7',textarea:'#4f8ef7',number:'#4f8ef7',email:'#4f8ef7',date:'#4f8ef7',
  select:'#8b5cf6',radio:'#8b5cf6',checkbox:'#8b5cf6','multi-select':'#8b5cf6',
  attachment:'#8b5cf6',
  signature:'#10b981',initials:'#10b981',approval:'#10b981',
  label:'#f59e0b',divider:'#f59e0b',pagebreak:'#f59e0b',
};

async function form_builder_init() {
  const editId = localStorage.getItem('HANMAK_EDIT_TEMPLATE_ID');
  const documentId = localStorage.getItem('HANMAK_BUILDER_DOCUMENT_ID');
  if ((!editId && !documentId) || typeof hanmakApi !== 'function') return;
  if (editId) localStorage.removeItem('HANMAK_EDIT_TEMPLATE_ID');
  if (documentId) localStorage.removeItem('HANMAK_BUILDER_DOCUMENT_ID');
  try {
    if (typeof ensureHanmakApi === 'function' && !await ensureHanmakApi()) return;
    if (documentId && !editId) {
      const doc = await hanmakApi(`/documents/${documentId}/`);
      await fbMountLibraryDocument(doc);
      const nameInput = document.getElementById('fb-template-name');
      if (nameInput) nameInput.value = doc.title || 'New Template';
      const badge = document.getElementById('fb-status-badge');
      if (badge) { badge.textContent = 'Library Doc'; badge.className = 'badge badge-primary'; }
      showToast(`Loaded ${doc.title} from File Library`, 'success');
      return;
    }
    const template = await hanmakApi(`/templates/${editId}/`);
    _fbEditingTemplate = template;
    _fbEditingVersion = template.versions?.[0] || null;
    const nameInput = document.getElementById('fb-template-name');
    if (nameInput) nameInput.value = template.name;
    const badge = document.getElementById('fb-status-badge');
    if (badge) { badge.textContent = `Editing v${_fbEditingVersion?.version_number || template.version || 1}`; badge.className = 'badge badge-warning'; }
    await fbMountEditingTemplateDocument(template);
    setTimeout(() => fbLoadTemplateFields(template), 180);
    showToast(`Loaded ${template.name} for editing`, 'success');
  } catch (error) {
    showToast(`Could not load template: ${error.message}`, 'error', 6000);
  }
}

async function fbMountEditingTemplateDocument(template) {
  const documentId = _fbEditingVersion?.document || _fbEditingVersion?.field_schema?.document_id;
  if (!documentId) {
    if (!window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
      showToast('This template has no saved document. Upload a real document or open one from File Library before beta use.', 'error', 7000);
      return;
    }
    fbMountSampleNDA();
    showToast('This template has no saved document yet, so the sample preview was loaded.', 'info', 5000);
    return;
  }
  try {
    const savedDocument = await hanmakApi(`/documents/${documentId}/`);
    if (!savedDocument.file_url) throw new Error('Saved document has no file URL');
    const fileResponse = await fetch(savedDocument.file_url);
    if (!fileResponse.ok) throw new Error(`Could not fetch saved document (${fileResponse.status})`);
    const blob = await fileResponse.blob();
    const filename = savedDocument.title?.toLowerCase().endsWith('.pdf')
      ? savedDocument.title
      : `${savedDocument.title || template.name || 'template-document'}.pdf`;
    const file = new File([blob], filename, {type: savedDocument.mime_type || blob.type || 'application/pdf'});
    await fbProcessFile(file);
  } catch (error) {
    console.warn('Falling back to sample document while editing template', error);
    if (!window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
      showToast(`Could not render the saved document: ${error.message}`, 'error', 6000);
      return;
    }
    fbMountSampleNDA();
    showToast(`Could not render the saved document: ${error.message}`, 'error', 6000);
  }
}

function fbLoadTemplateFields(template) {
  Object.keys(_fbFields).forEach(id => document.getElementById('fbf-' + id)?.remove());
  _fbFields = {};
  _fbSelectedField = null;
  _fbFieldCounter = 0;
  const versionFields = _fbEditingVersion?.field_schema?.fields || [];
  const apiFields = template.fields || [];
  const fields = versionFields.length ? versionFields : apiFields.map(field => ({
    ...field,
    w: field.width,
    h: field.height,
    party_key: field.party_key || 'party-2',
  }));
  fields.forEach(field => {
    if (field.party_key && !_fbParties.includes(field.party_key)) _fbParties.push(field.party_key);
    const id = 'f' + (++_fbFieldCounter);
    const pageIndex = Math.max(0, Number(field.page || 1) - 1);
    const pageSize = fbPageSize(pageIndex);
    const basisWidth = Number(field.page_width || field.document_width || _fbDocWidth || pageSize.w);
    const basisHeight = Number(field.page_height || pageSize.h);
    const scaleX = basisWidth ? pageSize.w / basisWidth : 1;
    const scaleY = basisHeight ? pageSize.h / basisHeight : scaleX;
    const fieldX = field.x_pct !== undefined ? Number(field.x_pct || 0) * pageSize.w : Number(field.x || 0) * scaleX;
    const fieldY = field.y_pct !== undefined ? Number(field.y_pct || 0) * pageSize.h : Number(field.y || 0) * scaleY;
    const fieldW = field.width_pct !== undefined ? Number(field.width_pct || 0) * pageSize.w : Number(field.width || field.w || 160) * scaleX;
    const fieldH = field.height_pct !== undefined ? Number(field.height_pct || 0) * pageSize.h : Number(field.height || field.h || 32) * scaleY;
    _fbFields[id] = fbClampFieldToPage({
      id,
      type: field.field_type || field.type || 'text',
      x: fieldX,
      y: fieldY,
      w: fieldW,
      h: fieldH,
      page: pageIndex,
      label: field.label || 'Field',
      party: field.party_key || field.party || 'party-2',
      required: field.required !== false,
      options: field.options || [],
    });
    fbRenderField(id);
  });
  const first = Object.keys(_fbFields)[0];
  if (first) fbSelectField(first);
}

async function fbMountLibraryDocument(doc) {
  _fbSourceFile = null;
  _fbSourceFilename = doc.title || '';
  _fbSourceDocumentId = doc.id;
  if (doc.pages?.length && doc.pages.some(page => page.image_url)) {
    const pages = doc.pages
      .slice()
      .sort((a, b) => a.page_number - b.page_number)
      .map(page => ({
        dataUrl: page.image_url || '',
        w: page.width || _fbDocWidth,
        h: page.height || 792,
      }));
    fbMountPages(pages, doc.title || 'Library Document');
    return;
  }
  if (doc.file_url) {
    const fileResponse = await fetch(doc.file_url);
    if (!fileResponse.ok) throw new Error(`Could not fetch document (${fileResponse.status})`);
    const blob = await fileResponse.blob();
    const filename = doc.title?.toLowerCase().endsWith('.pdf') ? doc.title : `${doc.title || 'library-document'}.pdf`;
    const file = new File([blob], filename, {type: doc.mime_type || blob.type || 'application/pdf'});
    await fbProcessFile(file);
    _fbSourceDocumentId = doc.id;
    _fbSourceFile = null;
    return;
  }
  fbMountSampleNDA();
}

// ── Palette ───────────────────────────────────────────────────────────────────
function fbTool(iconChar, label, type, color) {
  return `<div draggable="true"
    style="display:flex;align-items:center;gap:8px;padding:7px 14px;cursor:grab;font-size:12.5px;color:var(--text-secondary);transition:background 0.1s;user-select:none;"
    onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''"
    ondragstart="fbPaletteDragStart(event,'${type}')"
    onclick="fbQuickAdd('${type}')">
    <span style="font-size:14px;width:20px;text-align:center;color:${color}">${iconChar}</span>
    <span>${label}</span>
  </div>`;
}

function fbPaletteDragStart(e, type) {
  _fbDragType = type;
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', type);
}

function fbOnDragOver(e) {
  if (_fbDragType) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }
}

function fbOnDrop(e) {
  e.preventDefault();
  if (!_fbDragType) return;
  if (_fbPageCount === 0) { showToast('Upload a document first', 'info'); _fbDragType = null; return; }
  const container = document.getElementById('fb-pages-container');
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const x = Math.round(e.clientX - rect.left);
  const y = Math.round(e.clientY - rect.top);
  const page = fbPageIndexFromAbsY(y);
  const yOnPage = Math.max(0, y - (_fbPageHeights[page] || 0));
  fbAddField(_fbDragType, Math.max(0, x), yOnPage, page);
  _fbDragType = null;
}

function fbQuickAdd(type) {
  if (_fbPageCount === 0) { showToast('Upload a document first', 'info'); return; }
  const countOnFirstPage = Object.values(_fbFields).filter(field => field.page === 0).length;
  const def = _fbFieldDefaults[type] || {w:160,h:28};
  const pos = fbClampToPage(0, 40, 40 + countOnFirstPage * 44, def.w, def.h);
  fbAddField(type, pos.x, pos.y, 0);
}

function fbPageSize(pageIndex) {
  return _fbPageSizes[pageIndex] || {w:_fbDocWidth, h:1471};
}

function fbPageIndexFromAbsY(absY) {
  let page = 0;
  for (let i = 0; i < _fbPageHeights.length; i++) {
    const size = fbPageSize(i);
    const start = _fbPageHeights[i] || 0;
    if (absY >= start && absY <= start + size.h) return i;
    if (absY >= start) page = i;
  }
  return Math.min(page, Math.max(0, _fbPageCount - 1));
}

function fbClampToPage(page, x, y, w, h) {
  const size = fbPageSize(page);
  const width = Math.max(40, Number(w || 160));
  const height = Math.max(18, Number(h || 32));
  return {
    x: Math.max(0, Math.min(Math.round(Number(x || 0)), Math.max(0, size.w - width))),
    y: Math.max(0, Math.min(Math.round(Number(y || 0)), Math.max(0, size.h - height))),
    w: Math.min(width, size.w),
    h: Math.min(height, size.h),
    page,
  };
}

function fbClampFieldToPage(field) {
  const page = Math.max(0, Math.min(Number(field.page || 0), Math.max(0, _fbPageCount - 1)));
  const clamped = fbClampToPage(page, field.x, field.y, field.w, field.h);
  field.page = clamped.page;
  field.x = clamped.x;
  field.y = clamped.y;
  field.w = clamped.w;
  field.h = clamped.h;
  return field;
}

// ── Add field ─────────────────────────────────────────────────────────────────
function fbAddField(type, x, y, page) {
  const id  = 'f' + (++_fbFieldCounter);
  const def = _fbFieldDefaults[type] || {w:160,h:28};
  const pos = fbClampToPage(page, x, y, def.w, def.h);
  _fbFields[id] = { id, type, x:pos.x, y:pos.y, w:pos.w, h:pos.h, page:pos.page,
    label:_fbFieldLabels[type]||type, party:_fbCurrentParty, required:true };
  fbRenderField(id);
  fbSelectField(id);
  return id;
}

// ── Render field overlay ──────────────────────────────────────────────────────
function fbRenderField(id) {
  const f = _fbFields[id];
  if (!f) return;
  const container = document.getElementById('fb-pages-container');
  if (!container) return;
  const old = document.getElementById('fbf-'+id);
  if (old) old.remove();
  const color   = _fbFieldColors[f.type] || '#4f8ef7';
  const pageTop = _fbPageHeights[f.page] || 0;
  const absY    = pageTop + f.y;
  const isSign  = ['signature','initials','approval'].includes(f.type);
  const el = document.createElement('div');
  el.id = 'fbf-' + id;
  el.setAttribute('data-fid', id);
  el.style.cssText = `
    position:absolute;left:${f.x}px;top:${absY}px;
    width:${f.w}px;height:${f.h}px;
    background:${color}${isSign?'22':'18'};
    border:${isSign?'2px':'1.5px'} solid ${color};
    border-radius:3px;box-sizing:border-box;
    display:flex;align-items:center;justify-content:space-between;
    padding:0 6px;font-size:11px;font-weight:500;color:${color};
    z-index:10;user-select:none;cursor:move;`;

  el.innerHTML = `
    <span style="overflow:hidden;white-space:nowrap;text-overflow:ellipsis;flex:1;pointer-events:none">${f.label}</span>
    <span style="font-size:9px;opacity:0.65;flex-shrink:0;pointer-events:none">${f.party.replace('party-','P')}</span>
    ${['n','s','e','w','ne','nw','se','sw'].map(d => `<div data-rh="${id}" data-dir="${d}" style="${fbRhStyle(d)}"></div>`).join('')}`;

  // Move
  el.addEventListener('mousedown', e => {
    if (e.target.dataset.rh) return;
    e.preventDefault(); fbSelectField(id); fbStartMove(e, id);
  });
  el.addEventListener('click', e => { if (!e.target.dataset.rh) fbSelectField(id); });

  container.appendChild(el);

  // Resize handles
  el.querySelectorAll('[data-rh]').forEach(h => {
    h.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); fbStartResize(e, id, h.dataset.dir); });
  });
}

function fbRhStyle(dir) {
  const half = '-5px', mid = 'calc(50% - 5px)';
  const pos = {
    se:`right:${half};bottom:${half};cursor:se-resize;`,
    sw:`left:${half};bottom:${half};cursor:sw-resize;`,
    ne:`right:${half};top:${half};cursor:ne-resize;`,
    nw:`left:${half};top:${half};cursor:nw-resize;`,
    e:`right:${half};top:${mid};cursor:e-resize;`,
    w:`left:${half};top:${mid};cursor:w-resize;`,
    s:`bottom:${half};left:${mid};cursor:s-resize;`,
    n:`top:${half};left:${mid};cursor:n-resize;`,
  };
  return `position:absolute;width:10px;height:10px;background:white;border:1.5px solid #4f8ef7;border-radius:2px;z-index:20;opacity:0;transition:opacity 0.12s;${pos[dir]||''}`;
}

// Show/hide handles on hover
document.addEventListener('mouseover', e => {
  const f = e.target.closest('[data-fid]');
  if (f) f.querySelectorAll('[data-rh]').forEach(h => h.style.opacity='1');
});
document.addEventListener('mouseout', e => {
  const f = e.target.closest('[data-fid]');
  if (f && f.id !== 'fbf-'+_fbSelectedField) f.querySelectorAll('[data-rh]').forEach(h => h.style.opacity='0');
});

// ── Move ──────────────────────────────────────────────────────────────────────
function fbStartMove(e, id) {
  const el = document.getElementById('fbf-'+id);
  const f  = _fbFields[id];
  if (!el || !f) return;
  const sx = e.clientX, sy = e.clientY;
  const ox = f.x, oy = (_fbPageHeights[f.page]||0) + f.y;
  const move = ev => {
    const absX = Math.max(0, ox + ev.clientX - sx);
    const absY = Math.max(0, oy + ev.clientY - sy);
    const pg = fbPageIndexFromAbsY(absY);
    const pos = fbClampToPage(pg, absX, absY - (_fbPageHeights[pg] || 0), f.w, f.h);
    f.x = pos.x; f.y = pos.y; f.page = pos.page;
    el.style.left = f.x+'px'; el.style.top = ((_fbPageHeights[f.page] || 0) + f.y)+'px';
    fbSyncInspectorPos(f);
  };
  const up = () => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// ── Resize ────────────────────────────────────────────────────────────────────
function fbStartResize(e, id, dir) {
  const el = document.getElementById('fbf-'+id);
  const f  = _fbFields[id];
  if (!el || !f) return;
  const sx=e.clientX, sy=e.clientY;
  const ow=f.w, oh=f.h, ox=f.x, oy=(_fbPageHeights[f.page]||0)+f.y;
  const minW=40, minH=18;
  const move = ev => {
    const dx=ev.clientX-sx, dy=ev.clientY-sy;
    let nw=ow, nh=oh, nx=ox, ny=oy;
    if (dir.includes('e'))  nw = Math.max(minW, ow+dx);
    if (dir.includes('s'))  nh = Math.max(minH, oh+dy);
    if (dir.includes('w')) { nw = Math.max(minW, ow-dx); nx = ox+ow-nw; }
    if (dir.includes('n')) { nh = Math.max(minH, oh-dy); ny = oy+oh-nh; }
    const pg = fbPageIndexFromAbsY(ny);
    const pos = fbClampToPage(pg, nx, ny - (_fbPageHeights[pg] || 0), nw, nh);
    f.w=pos.w; f.h=pos.h; f.x=pos.x; f.y=pos.y; f.page=pos.page;
    el.style.width=f.w+'px'; el.style.height=f.h+'px';
    el.style.left=f.x+'px';  el.style.top=((_fbPageHeights[f.page] || 0) + f.y)+'px';
    fbSyncInspectorSize(f);
    fbSyncInspectorPos(f);
  };
  const up = () => { document.removeEventListener('mousemove',move); document.removeEventListener('mouseup',up); };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}

// ── Select field ──────────────────────────────────────────────────────────────
function fbSelectField(id) {
  if (_fbSelectedField) {
    const prev = document.getElementById('fbf-'+_fbSelectedField);
    if (prev) { prev.style.outline=''; prev.querySelectorAll('[data-rh]').forEach(h=>h.style.opacity='0'); }
  }
  _fbSelectedField = id;
  const el = document.getElementById('fbf-'+id);
  if (el) { el.style.outline='2.5px solid var(--primary)'; el.style.outlineOffset='1px'; el.querySelectorAll('[data-rh]').forEach(h=>h.style.opacity='1'); }
  fbBuildInspector(id);
}

function fbSyncInspectorPos(f) {
  const xi=document.getElementById('insp-x'); const yi=document.getElementById('insp-y');
  if(xi) xi.value=Math.round(f.x); if(yi) yi.value=Math.round(f.y);
}
function fbSyncInspectorSize(f) {
  const wi=document.getElementById('insp-w'); const hi=document.getElementById('insp-h');
  if(wi) wi.value=Math.round(f.w); if(hi) hi.value=Math.round(f.h);
}

// ── Inspector ─────────────────────────────────────────────────────────────────
function fbBuildInspector(id) {
  const f = _fbFields[id]; if (!f) return;
  const ic = document.getElementById('fb-inspector-content'); if (!ic) return;
  const color     = _fbFieldColors[f.type]||'#4f8ef7';
  const isSelect  = ['select','multi-select'].includes(f.type);
  const isSign    = f.type==='signature';
  const options = Array.isArray(f.options) && f.options.length ? f.options : ['Option 1','Option 2','Option 3'];
  const signatureMethods = Array.isArray(f.options) && f.options.length ? f.options : ['type','draw'];
  const noPlaceholder = ['signature','initials','approval','divider','pagebreak'].includes(f.type);
  ic.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">
      <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></div>
      <span style="font-weight:700;font-size:13px;flex:1">${f.label}</span>
      <span style="font-size:10px;color:var(--text-muted);background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${f.type}</span>
    </div>

    <div class="form-group">
      <label class="form-label">Field Label</label>
      <input class="form-input" style="font-size:13px" value="${f.label}"
        oninput="_fbFields['${id}'].label=this.value;const el=document.getElementById('fbf-${id}');if(el){const sp=el.querySelector('span');if(sp)sp.textContent=this.value;}">
    </div>
    <div class="form-group">
      <label class="form-label">Assign to Party</label>
      <select class="form-input" style="font-size:13px" onchange="_fbFields['${id}'].party=this.value;fbRenderField('${id}');fbSelectField('${id}')">
        ${_fbParties.map((party, index) => `<option value="${party}" ${f.party===party?'selected':''}>${party.replace('-', ' ').replace(/\b\w/g, c => c.toUpperCase())}${index === 0 ? ' (Sender)' : ''}</option>`).join('')}
      </select>
    </div>

    ${isSelect ? `
    <div class="form-group">
      <label class="form-label">Options</label>
      <div id="select-options-list" style="display:flex;flex-direction:column;gap:5px;margin-bottom:6px">
        ${options.map(o=>`
          <div style="display:flex;gap:4px">
            <input class="form-input fb-option-input" value="${escapeHtml(o)}" style="flex:1;font-size:12px;padding:5px 8px" oninput="fbSyncFieldOptions('${id}')">
            <button class="btn btn-ghost btn-sm" style="padding:4px 6px;color:var(--danger)" onclick="this.parentElement.remove()">&times;</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="addSelectOption()" style="width:100%;font-size:12px">+ Add Option</button>
    </div>
    <div class="form-group">
      <label class="form-label">Placeholder</label>
      <input class="form-input" style="font-size:13px" value="Select an option…">
    </div>` : ''}

    ${!noPlaceholder && !isSelect ? `
    <div class="form-group">
      <label class="form-label">Placeholder</label>
      <input class="form-input" style="font-size:13px" placeholder="Hint text…">
    </div>` : ''}

    ${isSign ? `
    <div class="form-group">
      <label class="form-label">Allowed Methods</label>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${[['Draw (canvas)','draw'],['Type signature','type'],['Upload image','upload']].map(([l,method])=>`
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" class="fb-sign-method" value="${method}" ${signatureMethods.includes(method)?'checked':''} onchange="fbSyncSignatureMethods('${id}')"> ${l}</label>`).join('')}
      </div>
    </div>
    <div class="form-group">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" checked> Show e-sign consent dialog</label>
    </div>` : ''}

    <div class="form-group">
      <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
        <input type="checkbox" ${f.required?'checked':''} onchange="_fbFields['${id}'].required=this.checked">
        Required field</label>
    </div>

    <!-- Position & Size -->
    <div style="margin-top:10px;padding-top:12px;border-top:1px solid var(--border)">
      <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px">
        Position &amp; Size <span style="font-weight:400;text-transform:none;letter-spacing:0;opacity:0.7">(or drag &amp; resize)</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${[['X (px)','x','insp-x',Math.round(f.x)],['Y (px)','y','insp-y',Math.round(f.y)],
           ['Width (px)','w','insp-w',Math.round(f.w)],['Height (px)','h','insp-h',Math.round(f.h)]].map(([lbl,prop,iid,val])=>`
          <div>
            <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px">${lbl}</label>
            <input id="${iid}" class="form-input" type="number" value="${val}" style="font-size:12px;padding:5px 8px"
              onchange="fbSetFieldGeom('${id}','${prop}',+this.value)">
          </div>`).join('')}
      </div>
      <div style="margin-top:8px">
        <label style="font-size:10px;color:var(--text-muted);display:block;margin-bottom:3px">Page</label>
        <input class="form-input" type="number" value="${f.page+1}" min="1" max="${Math.max(1,_fbPageCount)}" style="font-size:12px;padding:5px 8px;width:70px"
          onchange="fbSetFieldGeom('${id}','page',+this.value)">
      </div>
    </div>

    <div style="margin-top:14px;display:flex;flex-direction:column;gap:6px">
      <button class="btn btn-ghost btn-sm" style="width:100%" onclick="fbDuplicateField('${id}')">${icon('copy')} Duplicate Field</button>
      <button class="btn btn-sm" style="width:100%;background:#fee2e2;color:var(--danger);border:1px solid #fca5a5" onclick="fbDeleteField('${id}')">${icon('trash')} Delete Field</button>
    </div>`;
}

function fbSetFieldGeom(id, prop, val) {
  const f = _fbFields[id]; if (!f) return;
  if (prop === 'page') {
    f.page = Math.max(0, Math.min(Math.round(Number(val || 1)) - 1, Math.max(0, _fbPageCount - 1)));
  } else {
    const minVal = (prop==='w')?40:(prop==='h')?18:0;
    f[prop] = Math.max(minVal, Number(val || 0));
  }
  fbClampFieldToPage(f);
  const el = document.getElementById('fbf-'+id); if (!el) return;
  el.style.left = f.x+'px';
  el.style.top  = ((_fbPageHeights[f.page]||0)+f.y)+'px';
  el.style.width  = f.w+'px';
  el.style.height = f.h+'px';
  fbBuildInspector(id);
}

function fbDuplicateField(id) {
  const f=_fbFields[id]; if(!f) return;
  const nid='f'+(++_fbFieldCounter);
  _fbFields[nid]={...f,id:nid,x:f.x+20,y:f.y+20};
  fbClampFieldToPage(_fbFields[nid]);
  fbRenderField(nid); fbSelectField(nid);
  showToast('Field duplicated','success');
}
function fbDeleteField(id) {
  const el=document.getElementById('fbf-'+id); if(el) el.remove();
  delete _fbFields[id]; _fbSelectedField=null;
  const ic=document.getElementById('fb-inspector-content');
  if(ic) ic.innerHTML=`<div style="text-align:center;padding:40px 16px;color:var(--text-muted)"><div style="font-size:2rem;margin-bottom:8px">🗑️</div><div style="font-size:13px">Field deleted</div></div>`;
}

// ── Upload & PDF rendering ────────────────────────────────────────────────────
function fbTriggerUpload() {
  const inp=document.getElementById('fb-file-input'); if(inp) inp.click();
}
function fbUploadFileDrop(e) {
  e.preventDefault(); e.stopPropagation();
  const file=e.dataTransfer.files[0]; if(file) fbProcessFile(file);
}
function fbHandleFileSelect(e) {
  const file=e.target.files[0]; if(file) fbProcessFile(file);
}

async function fbProcessFile(file) {
  _fbSourceFile = file;
  _fbSourceFilename = file.name;
  const ext=file.name.split('.').pop().toLowerCase();
  fbShowProcessing(true,'Loading file…','Reading '+file.name,0);
  try {
    if (ext==='pdf') await fbRenderPDF(file);
    else if (ext==='docx'||ext==='doc') await fbRenderDocx(file);
    else { showToast('Please upload a PDF or DOCX file','error'); fbShowProcessing(false); }
  } catch(err) {
    console.error(err);
    showToast('Error processing file: '+err.message,'error');
    fbShowProcessing(false);
  }
}

async function fbLoadScript(src) {
  return new Promise((res,rej)=>{
    if (document.querySelector('script[src="'+src+'"]')) { res(); return; }
    const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

async function fbRenderPDF(file) {
  if (!window.pdfjsLib) {
    fbShowProcessing(true,'Loading PDF engine…','Fetching PDF.js',5);
    await fbLoadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  fbShowProcessing(true,'Parsing PDF…','Reading document structure',10);
  const buf=await file.arrayBuffer();
  const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const total=pdf.numPages;
  const pages=[];
  for (let i=1;i<=total;i++) {
    fbShowProcessing(true,`Rendering page ${i} of ${total}…`,'Converting to image',10+Math.round((i/total)*85));
    const page=await pdf.getPage(i);
    const baseVp=page.getViewport({scale:1});
    const scale=_fbDocWidth/baseVp.width;
    const vp=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.round(vp.width); canvas.height=Math.round(vp.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:vp}).promise;
    pages.push({dataUrl:canvas.toDataURL('image/png'),w:canvas.width,h:canvas.height});
  }
  fbShowProcessing(true,'Building canvas…','Assembling pages',97);
  fbMountPages(pages,file.name);
  fbShowProcessing(false);
}

async function fbRenderDocx(file) {
  if (!window.mammoth) {
    fbShowProcessing(true,'Loading DOCX engine…','Fetching Mammoth.js',5);
    await fbLoadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
  }
  fbShowProcessing(true,'Converting DOCX…','Extracting document content',40);
  const buf=await file.arrayBuffer();
  const result=await mammoth.convertToHtml({arrayBuffer:buf});
  fbShowProcessing(true,'Rendering document…','Building canvas',80);
  fbMountDocxPage(result.value,_fbDocWidth,file.name);
  fbShowProcessing(false);
}

// ── Mount pages ───────────────────────────────────────────────────────────────
function fbMountPages(pages,filename) {
  const zone=document.getElementById('fb-upload-zone');
  const container=document.getElementById('fb-pages-container');
  if(!zone||!container) return;
  zone.style.display='none';
  container.innerHTML='';
  container.style.cssText='display:block;position:relative;';
  _fbPageHeights=[]; _fbPageSizes=[]; _fbPagePreviews=[]; _fbPageCount=pages.length;
  let totalH=0;
  pages.forEach((pg,i)=>{
    const pageWidth = Number(pg.w || _fbDocWidth);
    const pageHeight = Number(pg.h || 1471);
    _fbPageHeights.push(totalH);
    _fbPageSizes.push({w:pageWidth,h:pageHeight});
    _fbPagePreviews.push({type:'image', src:pg.dataUrl || '', w:pageWidth, h:pageHeight});
    const gap=i<pages.length-1?20:0;
    // Page label
    const lbl=document.createElement('div');
    lbl.style.cssText=`position:absolute;left:0;top:${totalH-18}px;font-size:11px;color:#64748b;font-weight:500;`;
    lbl.textContent='Page '+(i+1);
    container.appendChild(lbl);
    // Image
    const img=document.createElement('img');
    img.src=pg.dataUrl;
    img.style.cssText=`position:absolute;left:0;top:${totalH}px;width:${pageWidth}px;height:${pageHeight}px;display:block;pointer-events:none;user-select:none;box-shadow:0 4px 24px rgba(0,0,0,0.12);`;
    container.appendChild(img);
    totalH+=pageHeight+gap;
  });
  container.style.width=_fbDocWidth+'px';
  container.style.height=(totalH+40)+'px';
  fbUpdatePageThumbs(pages);
  fbUpdateTemplateName(filename);
  showToast(`${pages.length} page${pages.length>1?'s':''} loaded — drag fields onto the document`,'success');
}

function fbMountDocxPage(html,w,filename) {
  // Render HTML into hidden div to measure height
  const measure=document.createElement('div');
  measure.style.cssText=`position:fixed;left:-9999px;top:0;width:${w-80}px;padding:40px;box-sizing:border-box;font-size:11px;line-height:1.8;font-family:Georgia,serif;background:white`;
  measure.innerHTML=html;
  document.body.appendChild(measure);
  const h=Math.max(measure.scrollHeight+80,800);
  document.body.removeChild(measure);

  const zone=document.getElementById('fb-upload-zone');
  const container=document.getElementById('fb-pages-container');
  if(!zone||!container) return;
  zone.style.display='none';
  container.innerHTML='';
  _fbPageHeights=[0]; _fbPageSizes=[{w,h}]; _fbPagePreviews=[{type:'html', html, w, h}]; _fbPageCount=1;
  container.style.cssText=`display:block;position:relative;width:${w}px;height:${h+40}px;`;
  const page=document.createElement('div');
  page.style.cssText=`position:absolute;left:0;top:0;width:${w}px;height:${h}px;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.12);overflow:hidden;pointer-events:none;`;
  const inner=document.createElement('div');
  inner.style.cssText='padding:40px;font-size:11px;line-height:1.8;color:#334155;font-family:Georgia,serif;';
  inner.innerHTML=html;
  page.appendChild(inner);
  container.appendChild(page);
  fbUpdatePageThumbs([{dataUrl:'',w,h}]);
  fbUpdateTemplateName(filename);
  showToast('DOCX loaded — drag fields onto the document','success');
}

function fbUpdatePageThumbs(pages) {
  const thumbs=document.getElementById('fb-page-thumbs');
  const empty=document.getElementById('fb-page-empty');
  if(!thumbs) return;
  if(empty) empty.style.display='none';
  thumbs.innerHTML='';
  pages.forEach((pg,i)=>{
    const btn=document.createElement('button');
    btn.title='Go to page '+(i+1);
    btn.style.cssText=`width:36px;height:46px;border-radius:4px;border:1.5px solid ${i===0?'var(--primary)':'var(--border)'};background:${pg.dataUrl?'transparent':'var(--bg-secondary)'};cursor:pointer;font-size:11px;font-weight:600;color:${i===0?'var(--primary)':'var(--text-muted)'};overflow:hidden;padding:0;`;
    if(pg.dataUrl) btn.innerHTML=`<img src="${pg.dataUrl}" style="width:100%;height:100%;object-fit:cover">`;
    else btn.textContent=i+1;
    btn.onclick=()=>fbScrollToPage(i);
    thumbs.appendChild(btn);
  });
}

function fbScrollToPage(i) {
  const wrap=document.getElementById('fb-canvas-wrap'); if(!wrap) return;
  wrap.scrollTop=(_fbPageHeights[i]||0)+24;
}

function fbUpdateTemplateName(filename) {
  const inp=document.getElementById('fb-template-name');
  if(inp&&filename) inp.value=filename.replace(/\.[^.]+$/,'');
}

function fbShowProcessing(show,title='',sub='',pct=0) {
  const el=document.getElementById('fb-processing'); if(!el) return;
  el.style.display=show?'block':'none';
  if(show){
    const m=document.getElementById('fb-processing-msg'); if(m) m.textContent=title;
    const s=document.getElementById('fb-processing-sub'); if(s) s.textContent=sub;
    const b=document.getElementById('fb-progress-bar'); if(b) b.style.width=pct+'%';
  }
}

// ── Sample NDA ────────────────────────────────────────────────────────────────
function fbLoadSampleDoc() {
  fbShowProcessing(true,'Loading sample NDA…','Generating preview',30);
  setTimeout(()=>{
    fbShowProcessing(true,'Rendering pages…','Building canvas',75);
    setTimeout(()=>{ fbMountSampleNDA(); fbShowProcessing(false); },350);
  },250);
}

function fbMountSampleNDA() {
  _fbSourceFile = fbSamplePdfFile('NDA Agreement.pdf');
  _fbSourceFilename = 'NDA Agreement.pdf';
  const zone=document.getElementById('fb-upload-zone');
  const container=document.getElementById('fb-pages-container');
  if(!zone||!container) return;
  zone.style.display='none';
  const W=_fbDocWidth, H=Math.round(W * 842 / 595), gap=20;
  _fbPageHeights=[0,H+gap]; _fbPageSizes=[{w:W,h:H},{w:W,h:H}]; _fbPagePreviews=[]; _fbPageCount=2;
  container.innerHTML='';
  container.style.cssText=`display:block;position:relative;width:${W}px;height:${H*2+gap+40}px;`;
  [ndaPage1HTML(),ndaPage2HTML()].forEach((html,i)=>{
    _fbPagePreviews.push({type:'html', html, w:W, h:H});
    const top=i*(H+gap);
    const lbl=document.createElement('div');
    lbl.style.cssText=`position:absolute;left:0;top:${top-18}px;font-size:11px;color:#64748b;font-weight:500;`;
    lbl.textContent='Page '+(i+1);
    const page=document.createElement('div');
    page.style.cssText=`position:absolute;left:0;top:${top}px;width:${W}px;height:${H}px;background:white;box-shadow:0 4px 24px rgba(0,0,0,0.12);pointer-events:none;overflow:hidden;`;
    const inner=document.createElement('div');
    inner.style.cssText='padding:60px;font-size:11px;line-height:1.9;color:#334155;font-family:Georgia,serif;';
    inner.innerHTML=html;
    page.appendChild(inner); container.appendChild(lbl); container.appendChild(page);
  });
  fbUpdatePageThumbs([{dataUrl:'',w:W,h:H},{dataUrl:'',w:W,h:H}]);
  fbUpdateTemplateName('NDA Agreement');
  setTimeout(()=>{
    const s = W / 640;
    fbAddField('text',Math.round(58*s),Math.round(262*s),0);
    fbAddField('text',Math.round(340*s),Math.round(262*s),0);
    fbAddField('number',Math.round(272*s),Math.round(385*s),0);
    fbAddField('select',Math.round(350*s),Math.round(420*s),0);
    fbAddField('signature',Math.round(58*s),Math.round(640*s),1);
    fbAddField('date',Math.round(335*s),Math.round(655*s),1);
    fbAddField('initials',Math.round(500*s),Math.round(655*s),1);
    showToast('Sample NDA loaded with pre-placed fields. Drag to move, grab corner handles to resize.','success');
  },80);
}

function ndaPage1HTML(){return`<div style="text-align:center;margin-bottom:32px"><div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:6px">NON-DISCLOSURE AGREEMENT</div><div style="font-size:11px;color:#64748b">This Agreement is entered into as of the date signed below.</div></div><p><strong>1. PARTIES.</strong> This Agreement is entered into between <span style="display:inline-block;min-width:130px;border-bottom:1px solid #94a3b8">&nbsp;</span> ("Disclosing Party") and <span style="display:inline-block;min-width:130px;border-bottom:1px solid #94a3b8">&nbsp;</span> ("Receiving Party").</p><p><strong>2. CONFIDENTIAL INFORMATION.</strong> "Confidential Information" means any information disclosed by either party to the other, directly or indirectly, in writing, orally, or by inspection of tangible objects that is designated as "Confidential" or that reasonably should be understood to be confidential given the nature of the information and circumstances of disclosure.</p><p><strong>3. OBLIGATIONS.</strong> Each party agrees to: (a) hold the other party's Confidential Information in strict confidence; (b) not disclose such Confidential Information to any third parties without prior written consent; (c) use Confidential Information solely for the purpose of evaluating a potential business relationship.</p><p><strong>4. TERM.</strong> This Agreement shall remain in effect for <span style="display:inline-block;min-width:60px;border-bottom:1px solid #94a3b8">&nbsp;</span> years from the date of execution.</p><p><strong>5. JURISDICTION.</strong> Governed by the laws of the State of <span style="display:inline-block;min-width:110px;border-bottom:1px solid #94a3b8">&nbsp;</span>, without regard to conflict of law provisions.</p><p><strong>6. REMEDIES.</strong> Each party acknowledges that breach of this Agreement may cause irreparable harm for which monetary damages would be inadequate, and the non-breaching party shall be entitled to seek equitable relief.</p>`;}
function ndaPage2HTML(){return`<p><strong>7. RETURN OF INFORMATION.</strong> Upon request, the Receiving Party shall promptly return all Confidential Information and any copies thereof, or certify in writing that all such materials have been destroyed.</p><p><strong>8. ENTIRE AGREEMENT.</strong> This Agreement constitutes the entire agreement between the parties with respect to its subject matter and supersedes all prior negotiations, understandings, and agreements.</p><p><strong>9. AMENDMENTS.</strong> This Agreement may only be amended by a written instrument signed by both parties.</p><div style="margin-top:48px"><div style="font-size:11px;color:#64748b;margin-bottom:36px">By signing below, both parties agree to all terms of this Non-Disclosure Agreement.</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:48px"><div><div style="font-weight:600;margin-bottom:28px">Disclosing Party</div><div style="border-bottom:1px solid #334155;height:56px;margin-bottom:6px"></div><div style="font-size:10px;color:#64748b">Signature</div><div style="border-bottom:1px solid #94a3b8;height:24px;margin-top:20px;margin-bottom:6px"></div><div style="font-size:10px;color:#64748b">Date</div></div><div><div style="font-weight:600;margin-bottom:28px">Receiving Party</div><div style="border-bottom:1px solid #334155;height:56px;margin-bottom:6px"></div><div style="font-size:10px;color:#64748b">Signature</div><div style="border-bottom:1px solid #94a3b8;height:24px;margin-top:20px;margin-bottom:6px"></div><div style="font-size:10px;color:#64748b">Date</div></div></div></div>`;}

// ── Misc ──────────────────────────────────────────────────────────────────────
function addSelectOption() {
  const list=document.getElementById('select-options-list'); if(!list) return;
  const id = _fbSelectedField;
  list.insertAdjacentHTML('beforeend',`<div style="display:flex;gap:4px"><input class="form-input fb-option-input" placeholder="Option label" style="flex:1;font-size:12px;padding:5px 8px" oninput="fbSyncFieldOptions('${id}')"><button class="btn btn-ghost btn-sm" style="padding:4px 6px;color:var(--danger)" onclick="this.parentElement.remove();fbSyncFieldOptions('${id}')">&times;</button></div>`);
  fbSyncFieldOptions(id);
}
function fbSyncFieldOptions(id) {
  if (!_fbFields[id]) return;
  _fbFields[id].options = [...document.querySelectorAll('#select-options-list .fb-option-input')]
    .map(input => input.value.trim())
    .filter(Boolean);
}
function fbSyncSignatureMethods(id) {
  if (!_fbFields[id]) return;
  _fbFields[id].options = [...document.querySelectorAll('.fb-sign-method:checked')]
    .map(input => input.value)
    .filter(Boolean);
}
function selectParty(btn,partyId) {
  document.querySelectorAll('.party-tab').forEach(t=>{t.classList.remove('active');t.style.background='transparent';});
  btn.classList.add('active'); btn.style.background=btn.style.color+'18'; _fbCurrentParty=partyId;
}
function addParty() {
  const next = `party-${_fbParties.length + 1}`;
  const label = prompt('Party key', next) || next;
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || next;
  if (_fbParties.includes(key)) return showToast(`${key} already exists`, 'info');
  _fbParties.push(key);
  const tabs = document.getElementById('party-tabs');
  const addButton = tabs?.querySelector('.party-tab:last-child');
  if (tabs && addButton) {
    addButton.insertAdjacentHTML('beforebegin', `<button class="party-tab" style="color:#0f766e;" onclick="selectParty(this,'${key}')">${key.replace('-', ' ')}</button>`);
  }
  showToast(`${key} added`, 'success');
}
function selectPage(n) { fbScrollToPage(n-1); }
function fbApiFieldType(type) {
  const supported = ['text','textarea','number','email','date','select','checkbox','signature','initials'];
  if (type === 'attachment') return 'attachment';
  if (supported.includes(type)) return type;
  if (type === 'radio' || type === 'multi-select') return 'select';
  if (type === 'approval') return 'checkbox';
  return 'text';
}

function fbFieldKey(field, index) {
  return `${field.type}-${field.label || 'field'}-${index + 1}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || `field-${index + 1}`;
}

function fbSerializedFields() {
  return Object.values(_fbFields).map((field, index) => {
    fbClampFieldToPage(field);
    const pageSize = fbPageSize(field.page || 0);
    const x = Math.round(field.x || 0);
    const y = Math.round(field.y || 0);
    const width = Math.round(field.w || 160);
    const height = Math.round(field.h || 32);
    return {
      local_id: field.id,
      field_key: fbFieldKey(field, index),
      field_type: fbApiFieldType(field.type),
      original_type: field.type,
      label: field.label,
      required: !!field.required,
      party_key: field.party || 'party-1',
      page: (field.page || 0) + 1,
      x,
      y,
      width,
      height,
      page_width: Math.round(pageSize.w || _fbDocWidth),
      page_height: Math.round(pageSize.h || 1471),
      coordinate_basis: 'page-pixels',
      x_pct: pageSize.w ? +(x / pageSize.w).toFixed(6) : 0,
      y_pct: pageSize.h ? +(y / pageSize.h).toFixed(6) : 0,
      width_pct: pageSize.w ? +(width / pageSize.w).toFixed(6) : 0,
      height_pct: pageSize.h ? +(height / pageSize.h).toFixed(6) : 0,
      options: field.options || [],
    };
  });
}

function fbEscape(value) {
  if (typeof escapeHtml === 'function') return escapeHtml(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fbPreviewPageBackground(pageIndex) {
  const preview = _fbPagePreviews[pageIndex] || {};
  const size = fbPageSize(pageIndex);
  if (preview.type === 'image' && preview.src) {
    return `<img src="${fbEscape(preview.src)}" style="position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;user-select:none">`;
  }
  if (preview.type === 'html' && preview.html) {
    return `<div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;background:white">
      <div style="padding:60px;font-size:11px;line-height:1.9;color:#334155;font-family:Georgia,serif;">${preview.html}</div>
    </div>`;
  }
  return `<div style="position:absolute;inset:0;padding:58px 64px;color:#334155;font-family:Georgia,serif;font-size:12px;line-height:1.8;pointer-events:none;background:white">
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:17px;font-weight:800;color:#1e293b;text-transform:uppercase">${fbEscape(document.getElementById('fb-template-name')?.value || 'Template Preview')}</div>
      <div style="font-size:11px;color:#64748b">HanMak signer preview · ${Math.round(size.w)} x ${Math.round(size.h)}</div>
    </div>
    <p><strong>Preview.</strong> This page shows the current field placement and signer controls before saving the template.</p>
  </div>`;
}

function fbPreviewField(field) {
  const label = fbEscape(field.label || 'Field');
  const required = field.required ? ' *' : '';
  const left = Math.round(field.x || 0);
  const top = Math.round(field.y || 0);
  const width = Math.max(56, Math.round(field.width || 160));
  const height = Math.max(24, Math.round(field.height || 32));
  const baseStyle = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:5;`;
  const inputStyle = 'width:100%;height:100%;box-sizing:border-box;border:1.5px solid var(--accent);background:rgba(255,255,255,0.96);border-radius:4px;font-size:12px;padding:4px 7px;box-shadow:0 2px 8px rgba(15,23,42,0.08);';
  const labelHtml = `<div style="position:absolute;left:0;top:-18px;font-size:10px;font-weight:700;color:var(--accent);white-space:nowrap">${label}${required}</div>`;
  const options = Array.isArray(field.options) && field.options.length ? field.options : ['Option 1', 'Option 2'];
  if (field.field_type === 'signature') {
    const methods = (Array.isArray(field.options) && field.options.length ? field.options : ['type', 'draw', 'upload']).join(', ');
    return `<div style="${baseStyle}">${labelHtml}<button type="button" disabled style="${inputStyle}font-family:'Dancing Script',cursive;font-size:18px;color:#1e40af;text-align:left;">Click to sign <span style="font-family:var(--font-sans);font-size:10px;color:#64748b">(${fbEscape(methods)})</span></button></div>`;
  }
  if (field.field_type === 'initials') {
    return `<div style="${baseStyle}">${labelHtml}<input disabled value="Initials" style="${inputStyle}font-family:'Dancing Script',cursive;font-size:18px;color:#1e40af;text-align:center"></div>`;
  }
  if (field.field_type === 'checkbox') {
    return `<label style="${baseStyle}display:flex;align-items:center;gap:6px;padding:4px 7px;box-sizing:border-box;border:1.5px solid var(--accent);background:rgba(255,255,255,0.96);border-radius:4px;font-size:11px;font-weight:600;color:var(--text-primary);"><input type="checkbox" disabled><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}${required}</span></label>`;
  }
  if (field.field_type === 'date') {
    return `<div style="${baseStyle}">${labelHtml}<input type="date" disabled style="${inputStyle}"></div>`;
  }
  if (field.field_type === 'select') {
    return `<div style="${baseStyle}">${labelHtml}<select disabled style="${inputStyle}"><option>Select...</option>${options.map(option => `<option>${fbEscape(option)}</option>`).join('')}</select></div>`;
  }
  if (field.field_type === 'attachment') {
    return `<div style="${baseStyle}">${labelHtml}<input type="file" disabled style="${inputStyle}padding:7px"></div>`;
  }
  const type = ['email', 'number'].includes(field.field_type) ? field.field_type : 'text';
  return `<div style="${baseStyle}">${labelHtml}<input type="${type}" disabled placeholder="${label}" style="${inputStyle}"></div>`;
}

function fbPreviewTemplate() {
  if (_fbPageCount === 0) return showToast('Upload or load a sample document before previewing', 'info');
  const fields = fbSerializedFields();
  const templateName = document.getElementById('fb-template-name')?.value.trim() || 'Template Preview';
  openModal(`
    <div class="modal modal-xl">
      <div class="modal-header">
        <div>
          <div class="modal-title">Signer Preview</div>
          <div class="modal-subtitle">${fbEscape(templateName)} · ${fields.length} field${fields.length === 1 ? '' : 's'}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${typeof icon === 'function' ? icon('x',16) : 'x'}</button>
      </div>
      <div class="modal-body" style="background:#dbe3ef;max-height:72vh;overflow:auto;padding:24px">
        <div style="width:${_fbDocWidth}px;max-width:${_fbDocWidth}px;margin:0 auto;display:flex;flex-direction:column;gap:1.25rem">
          ${Array.from({length:_fbPageCount}, (_, pageIndex) => {
            const size = fbPageSize(pageIndex);
            const pageFields = fields.filter(field => Number(field.page || 1) === pageIndex + 1);
            return `<div style="position:relative;width:${Math.round(size.w)}px;height:${Math.round(size.h)}px;background:white;box-shadow:0 4px 24px rgba(15,23,42,0.16);border-radius:2px;overflow:visible">
              <div style="position:absolute;left:0;top:-18px;font-size:11px;color:#64748b;font-weight:700">Page ${pageIndex + 1}</div>
              ${fbPreviewPageBackground(pageIndex)}
              ${pageFields.map(field => fbPreviewField(field)).join('')}
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="closeModal();saveFbTemplate()">${typeof icon === 'function' ? icon('save') : ''} Save Template</button>
      </div>
    </div>
  `);
}

function exportFbTemplateJson() {
  const name = document.getElementById('fb-template-name')?.value.trim() || 'New Template';
  const payload = {
    name,
    source: 'form-builder',
    page_count: _fbPageCount,
    document_width: _fbDocWidth,
    source_document_id: _fbSourceDocumentId,
    source_filename: _fbSourceFilename,
    parties: _fbParties,
    fields: fbSerializedFields(),
    exported_at: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'template'}-form-builder.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Form builder JSON exported', 'success');
}

function fbSamplePdfFile(title) {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj
4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
5 0 obj<</Length 117>>stream
BT /F1 18 Tf 72 720 Td (${title.replace(/[()]/g, '')}) Tj 0 -28 Td (Generated by HanMak form builder sample.) Tj ET
endstream endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000056 00000 n
0000000108 00000 n
0000000209 00000 n
0000000278 00000 n
trailer<</Size 6/Root 1 0 R>>
startxref
445
%%EOF`;
  return new File([pdf], title, {type: 'application/pdf'});
}

async function fbSaveTemplateDocument(organization, name) {
  if (_fbSourceDocumentId && !_fbSourceFile) {
    await hanmakApi(`/documents/${_fbSourceDocumentId}/prepare-for-builder/`, {
      method: 'POST',
      body: JSON.stringify({page_count: Math.max(1, _fbPageCount || 1), width: _fbDocWidth}),
    });
    return hanmakApi(`/documents/${_fbSourceDocumentId}/`);
  }
  const file = _fbSourceFile || fbSamplePdfFile(`${name}.pdf`);
  const title = _fbSourceFilename || file.name || `${name}.pdf`;
  const formData = new FormData();
  formData.append('organization', organization);
  formData.append('title', title.replace(/\.[^.]+$/, '') || name);
  formData.append('mime_type', file.type || 'application/pdf');
  formData.append('file', file, title.endsWith('.pdf') ? title : `${title}.pdf`);
  const savedDocument = await hanmakApi('/documents/', {method: 'POST', body: formData});
  await hanmakApi(`/documents/${savedDocument.id}/process/`, {
    method: 'POST',
    body: JSON.stringify({page_count: Math.max(1, _fbPageCount || 1)}),
  });
  // Generate page images so the PDF renderer can use the image-overlay path
  // (build_image_overlay_pdf) instead of falling back to the source-stamp path,
  // which merges an oversized overlay canvas onto the source PDF without scaling.
  await hanmakApi(`/documents/${savedDocument.id}/render_pages/`, {
    method: 'POST',
    body: JSON.stringify({page_count: Math.max(1, _fbPageCount || 1), width: _fbDocWidth}),
  });
  await hanmakApi(`/documents/${savedDocument.id}/scan/`, {method: 'POST', body: JSON.stringify({})});
  return savedDocument;
}

async function saveFbTemplate() {
  try {
    if (typeof ensureHanmakApi === 'function' && !await ensureHanmakApi()) return;
    if (_fbPageCount === 0) return showToast('Upload or load a sample document before saving', 'error');
    const fields = fbSerializedFields();
    if (!fields.length) return showToast('Add at least one field before saving', 'error');

    const organization = await firstOrganizationId();
    const name = document.getElementById('fb-template-name')?.value.trim() || 'New Template';
    const templateDocument = await fbSaveTemplateDocument(organization, name);
    let template = _fbEditingTemplate;
    if (template) {
      template = await hanmakApi(`/templates/${template.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          status: 'active',
          description: template.description || `Edited from the HanMak form builder with ${fields.length} field(s).`,
        }),
      });
    } else {
      template = await hanmakApi('/templates/', {
        method: 'POST',
        body: JSON.stringify({
          organization,
          name,
          category: 'Builder',
          description: `Created from the HanMak form builder with ${fields.length} field(s).`,
          status: 'active',
        }),
      });
    }
    const nextVersion = _fbEditingVersion ? Number(_fbEditingVersion.version_number || 1) + 1 : 1;
    const version = await hanmakApi('/template-versions/', {
      method: 'POST',
      body: JSON.stringify({
        template: template.id,
        version_number: nextVersion,
        document: templateDocument.id,
        field_schema: {
          source: 'form-builder',
          page_count: _fbPageCount,
          document_width: _fbDocWidth,
          document_id: templateDocument.id,
          fields,
        },
        workflow_schema: {
          stages: [
            {key: 'signer', label: 'Signer', type: 'signing', order: 1},
            {key: 'approver', label: 'Approver', type: 'approval', order: 2},
          ],
        },
        changelog: _fbEditingVersion ? `Builder edit saved as v${nextVersion}` : 'Initial form builder save',
        is_published: true,
      }),
    });
    await hanmakApi(`/templates/${template.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({version: nextVersion, status: 'active'}),
    });

    const parties = [...new Set(fields.map(field => field.party_key || 'party-1'))].map((partyKey, index) => ({
      role_key: partyKey,
      label: partyKey.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      routing_order: index + 1,
    }));
    const createdParties = {};
    for (const party of parties) {
      createdParties[party.role_key] = await hanmakApi('/template-parties/', {
        method: 'POST',
        body: JSON.stringify({...party, template_version: version.id}),
      });
    }

    for (const field of fields) {
      await hanmakApi('/form-fields/', {
        method: 'POST',
        body: JSON.stringify({
          template: template.id,
          template_version: version.id,
          party: createdParties[field.party_key]?.id || null,
          field_key: field.field_key,
          field_type: field.field_type,
          label: field.label,
          required: field.required,
          page: field.page,
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
          page_width: field.page_width,
          page_height: field.page_height,
          options: field.options,
        }),
      });
    }

    const badge=document.getElementById('fb-status-badge');
    if(badge){badge.textContent='Saved';badge.className='badge badge-success';}
    showToast(`Template saved as version ${nextVersion} with document and ${fields.length} field(s)`, 'success');
    _fbEditingTemplate = null;
    _fbEditingVersion = null;
    navigate('templates');
  } catch (error) {
    showToast(`Template save failed: ${error.message}`, 'error', 6000);
  }
}
