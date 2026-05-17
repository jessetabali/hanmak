registerPage('documents', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Document Library</h1>
    <p class="page-subtitle">Signed documents, attachments, and generated files</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-primary" onclick="openDocumentUploadLive()">${icon('upload')} Upload</button>
  </div>
</div>

<div style="display:grid;grid-template-columns:220px 1fr;gap:1.5rem">
  <div class="card" id="doc-filter-list" style="padding:1rem;height:fit-content">
    <div style="font-weight:600;font-size:0.8125rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem">Filter by Status</div>
    ${[['All Documents','folder',''],['Ready','check-circle','ready'],['Processing','clock','processing'],['Uploaded','upload','uploaded']].map(([name,ic,status])=>
      `<div style="display:flex;align-items:center;gap:0.5rem;padding:0.5rem 0.625rem;border-radius:6px;cursor:pointer;font-size:0.8125rem;margin-bottom:2px"
        onclick="document.querySelectorAll('#doc-filter-list div').forEach(d=>{d.style.background='';d.style.color=''});this.style.background='var(--primary-light)';this.style.color='var(--primary)';_loadDocuments('${status}')">
        ${icon(ic)} <span style="flex:1">${name}</span>
      </div>`
    ).join('')}
  </div>

  <div>
    <div id="document-library-stats" class="stats-grid" style="--cols:5;margin-bottom:1rem"></div>
    <div class="card" style="margin-bottom:1rem">
      <div class="table-toolbar">
        <div class="flex gap-2">
          <input id="doc-search" class="form-input" placeholder="Search documents…" style="width:280px" oninput="_docSearchDebounce()">
          <select id="doc-sort" class="form-input" style="width:150px" onchange="_loadDocuments()">
            <option value="-created_at">Date: Newest</option>
            <option value="created_at">Date: Oldest</option>
            <option value="title">Name A–Z</option>
            <option value="-file_size">Size: Largest</option>
          </select>
        </div>
      </div>
    </div>
    <div id="documents-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem">
      <div style="padding:2rem;text-align:center;color:var(--text-muted);grid-column:1/-1">Loading documents…</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 0;font-size:0.8125rem;color:var(--text-muted)">
      <span id="documents-count">—</span>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm" onclick="_loadDocumentsPage(-1)">Prev</button>
        <button class="btn btn-ghost btn-sm" onclick="_loadDocumentsPage(1)">Next</button>
      </div>
    </div>
  </div>
</div>
`);

// ── Live wiring ──────────────────────────────────────────────────────────────

let _docPage = 1;
let _docStatusFilter = '';
let _docSearchTimer = null;
let _latestDocuments = [];

function _docSearchDebounce() {
  clearTimeout(_docSearchTimer);
  _docSearchTimer = setTimeout(() => _loadDocuments(_docStatusFilter), 400);
}

function _loadDocumentsPage(delta) {
  _docPage = Math.max(1, _docPage + delta);
  _loadDocuments(_docStatusFilter);
}

async function _loadDocuments(statusFilter) {
  if (statusFilter !== undefined) { _docStatusFilter = statusFilter; _docPage = 1; }
  const grid = document.getElementById('documents-grid');
  const countEl = document.getElementById('documents-count');
  if (!grid) return;
  grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);grid-column:1/-1">Loading…</div>';
  try {
    const orgId = await firstOrganizationId();
    const search = document.getElementById('doc-search')?.value || '';
    const ordering = document.getElementById('doc-sort')?.value || '-created_at';
    const params = new URLSearchParams({organization: orgId, page: _docPage, page_size: 18, ordering});
    if (search) params.set('search', search);
    if (_docStatusFilter) params.set('status', _docStatusFilter);
    const [data, summary] = await Promise.all([
      hanmakApi(`/documents/?${params}`),
      hanmakApi(`/documents/summary/?organization=${orgId}`),
    ]);
    const docs = data.results || data;
    _latestDocuments = docs;
    renderDocumentLibraryStats(summary);
    const total = data.count || docs.length;
    if (countEl) countEl.textContent = `Showing ${docs.length} of ${total} documents`;
    if (!docs.length) {
      grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted);grid-column:1/-1">No documents found.</div>';
      return;
    }
    const statusColors = {ready:'success',processing:'warning',uploaded:'secondary',failed:'danger'};
    grid.innerHTML = docs.map(d => {
      const ext = (d.mime_type || '').includes('pdf') ? 'PDF' : (d.title||'').split('.').pop().toUpperCase() || 'FILE';
      const size = d.file_size ? (d.file_size >= 1048576 ? (d.file_size/1048576).toFixed(1)+' MB' : (d.file_size/1024).toFixed(0)+' KB') : '—';
      const date = d.created_at ? new Date(d.created_at).toLocaleDateString() : '—';
      const statusBadge = `<span class="badge badge-${statusColors[d.status]||'secondary'}">${d.status || '—'}</span>`;
      const fileUrl = d.file_url || '';
      return `<div class="card" style="cursor:pointer;transition:box-shadow 0.15s" onmouseenter="this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.boxShadow=''">
        <div style="padding:1rem;border-bottom:1px solid var(--border);display:flex;justify-content:center;align-items:center;height:100px;background:var(--bg-secondary)">
          <div style="text-align:center">
            <div style="font-size:2.5rem;color:${ext==='PDF'?'#e53935':'#1565c0'};margin-bottom:0.25rem">${icon('file-text')}</div>
            <span class="badge badge-${ext==='PDF'?'danger':'primary'}" style="font-size:0.65rem">${ext}</span>
          </div>
        </div>
        <div style="padding:0.875rem">
          <div style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;word-break:break-word;line-height:1.3">${d.title}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">${size} · ${date}</div>
          <div style="display:flex;justify-content:space-between;align-items:center">
            ${statusBadge}
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" style="padding:4px" onclick="event.stopPropagation();openDocumentInBuilderLive(${d.id})" title="Open in builder">${icon('edit')}</button>
              ${fileUrl ? `<a class="btn btn-ghost btn-sm" style="padding:4px" href="${fileUrl}" target="_blank" title="Download">${icon('download')}</a>` : `<button class="btn btn-ghost btn-sm" style="padding:4px" onclick="showToast('No file attached','info')">${icon('download')}</button>`}
              <button class="btn btn-ghost btn-sm" style="padding:4px" onclick="openDocMenuLive(${d.id},event)">⋯</button>
            </div>
          </div>
          ${d.page_count ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:0.375rem">${icon('file-text')} ${d.page_count} page${d.page_count>1?'s':''}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    grid.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger);grid-column:1/-1">Failed to load documents.</div>';
  }
}

function renderDocumentLibraryStats(summary = {}) {
  const target = document.getElementById('document-library-stats');
  if (!target) return;
  const size = Number(summary.file_size || 0);
  const prettySize = size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : `${Math.round(size / 1024)} KB`;
  target.innerHTML = [
    ['Documents', summary.total || 0],
    ['Ready', summary.ready || 0],
    ['Uploaded', summary.uploaded || 0],
    ['Pages', summary.pages || 0],
    ['Storage', prettySize],
  ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
}

function openDocumentUploadLive() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Upload Document</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Title</label><input id="doc-upload-title" class="form-input" placeholder="Agreement.pdf"></div>
      <div class="form-group"><label class="form-label">File</label><input id="doc-upload-file" class="form-input" type="file" accept=".pdf,.doc,.docx,image/*"></div>
      <label style="display:flex;gap:0.5rem;align-items:center;font-size:0.875rem"><input id="doc-upload-process" type="checkbox" checked> Process and scan after upload</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitDocumentUploadLive()">${icon('upload')} Upload</button>
    </div>
  `);
}

async function submitDocumentUploadLive() {
  const file = document.getElementById('doc-upload-file')?.files?.[0];
  if (!file) return showToast('Choose a file first', 'error');
  try {
    const organization = await firstOrganizationId();
    const formData = new FormData();
    formData.append('organization', organization);
    formData.append('title', document.getElementById('doc-upload-title')?.value.trim() || file.name.replace(/\.[^.]+$/, ''));
    formData.append('mime_type', file.type || 'application/octet-stream');
    formData.append('file', file, file.name);
    const documentRecord = await hanmakApi('/documents/', {method:'POST', body: formData});
    if (document.getElementById('doc-upload-process')?.checked) {
      await hanmakApi(`/documents/${documentRecord.id}/process/`, {method:'POST', body: JSON.stringify({page_count: 1})});
      await hanmakApi(`/documents/${documentRecord.id}/scan/`, {method:'POST', body: JSON.stringify({})});
      await hanmakApi(`/documents/${documentRecord.id}/render_pages/`, {method:'POST', body: JSON.stringify({width: 1040})});
    }
    closeModal();
    showToast('Document uploaded', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Upload failed: ${error.message}`, 'error', 7000);
  }
}

function openDocMenuLive(id, e) {
  e?.stopPropagation();
  const doc = _latestDocuments.find(item => item.id === id);
  if (!doc) return showToast('Document not found in current page', 'error');
  openModal(`
    <div class="modal-header"><h3 class="modal-title" style="font-size:0.9375rem">${escapeHtml(doc.title)}</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="flex flex-col gap-2">
        ${doc.file_url ? `<a class="btn btn-ghost" style="justify-content:flex-start" href="${doc.file_url}" target="_blank">${icon('eye')} Preview / Download</a>` : ''}
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="openDocumentInBuilderLive(${doc.id})">${icon('edit')} Open in Form Builder</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="renameDocumentLive(${doc.id}, '${escapeHtml(doc.title).replaceAll("'", "\\'")}')">${icon('edit')} Rename</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="duplicateDocumentLive(${doc.id}, '${escapeHtml(doc.title).replaceAll("'", "\\'")}')">${icon('copy')} Duplicate</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="processDocumentLibraryLive(${doc.id})">${icon('refresh')} Process</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="scanDocumentLibraryLive(${doc.id})">${icon('shield')} Scan</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="renderDocumentPagesLive(${doc.id})">${icon('image')} Render PNG Pages</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;color:var(--danger)" onclick="deleteDocumentLive(${doc.id}, '${escapeHtml(doc.title).replaceAll("'", "\\'")}')">${icon('trash')} Delete</button>
      </div>
    </div>
  `);
}

async function openDocumentInBuilderLive(id) {
  closeModal();
  try {
    await hanmakApi(`/documents/${id}/prepare-for-builder/`, {method:'POST', body: JSON.stringify({width: 1040})});
    localStorage.setItem('HANMAK_BUILDER_DOCUMENT_ID', String(id));
    showToast('Document prepared for Form Builder', 'success');
    navigate('form-builder');
  } catch (error) {
    showToast(`Could not prepare document: ${error.message}`, 'error', 7000);
  }
}

async function duplicateDocumentLive(id, currentTitle) {
  const title = prompt('Duplicate title', `${currentTitle} Copy`);
  if (title === null) return;
  try {
    await hanmakApi(`/documents/${id}/duplicate/`, {method:'POST', body: JSON.stringify({title: title || `${currentTitle} Copy`})});
    closeModal();
    showToast('Document duplicated', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Duplicate failed: ${error.message}`, 'error', 7000);
  }
}

async function renameDocumentLive(id, currentTitle) {
  const title = prompt('Document title', currentTitle);
  if (!title) return;
  try {
    await hanmakApi(`/documents/${id}/`, {method:'PATCH', body: JSON.stringify({title})});
    closeModal();
    showToast('Document renamed', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Rename failed: ${error.message}`, 'error', 7000);
  }
}

async function processDocumentLibraryLive(id) {
  try {
    await hanmakApi(`/documents/${id}/process/`, {method:'POST', body: JSON.stringify({page_count: 1})});
    closeModal();
    showToast('Document processed', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Process failed: ${error.message}`, 'error', 7000);
  }
}

async function scanDocumentLibraryLive(id) {
  try {
    await hanmakApi(`/documents/${id}/scan/`, {method:'POST', body: JSON.stringify({})});
    closeModal();
    showToast('Document scan recorded', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Scan failed: ${error.message}`, 'error', 7000);
  }
}

async function renderDocumentPagesLive(id) {
  try {
    await hanmakApi(`/documents/${id}/render_pages/`, {method:'POST', body: JSON.stringify({width: 1040})});
    closeModal();
    showToast('Document page PNGs rendered', 'success');
    _loadDocuments(_docStatusFilter);
  } catch (error) {
    showToast(`Render failed: ${error.message}`, 'error', 7000);
  }
}

async function deleteDocumentLive(id, title) {
  confirm(`Delete "${title}"? This is blocked automatically if the document is under legal hold.`, async () => {
    try {
      await hanmakApi(`/documents/${id}/`, {method:'DELETE'});
      closeModal();
      showToast('Document deleted', 'success');
      _loadDocuments(_docStatusFilter);
    } catch (error) {
      showToast(error.message || 'Delete failed. This document may be protected by legal hold or permissions.', 'error', 7000);
    }
  });
}

async function documents_init() {
  await ensureHanmakApi();
  _docPage = 1;
  _docStatusFilter = '';
  _loadDocuments('');
}
