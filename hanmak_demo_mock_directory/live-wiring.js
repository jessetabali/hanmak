const HANMAK_CANONICAL_PAGE_WIDTH = 1040;
const HANMAK_DEFAULT_PAGE_HEIGHT = 1471;

let publicSigningResizeHandlerAttached = false;

function apiDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

function titleCaseStatus(value) {
  return (value || '').split('_').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function authButtonHtml() {
  const signedIn = Boolean(localStorage.getItem('HANMAK_ACCESS_TOKEN'));
  const impersonating = Boolean(localStorage.getItem('HANMAK_ACTIVE_IMPERSONATION_ID'));
  if (impersonating) {
    return `<button class="btn btn-warning btn-sm" onclick="endImpersonationLive()">${icon('log-out')} End Impersonation</button>`;
  }
  return `<button class="btn ${signedIn ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="${signedIn ? 'hanmakLogout()' : 'openHanmakLoginModal()'}">
    ${signedIn ? icon('x') + ' Disconnect API' : icon('key') + ' Connect API'}
  </button>`;
}

function injectAuthButton() {
  const actions = document.querySelector('.topbar-actions');
  if (!actions || document.getElementById('hanmak-auth-btn')) return;
  const wrap = document.createElement('span');
  wrap.id = 'hanmak-auth-btn';
  wrap.innerHTML = authButtonHtml();
  actions.prepend(wrap);
}

function refreshAuthButton() {
  const wrap = document.getElementById('hanmak-auth-btn');
  if (wrap) wrap.innerHTML = authButtonHtml();
}

function openHanmakLoginModal() {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div>
          <div class="modal-title">Connect HanMak API</div>
          <div class="modal-subtitle">${HANMAK_API_BASE_URL}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Username</label><input id="api-login-user" class="form-input" value="admin"></div>
        <div class="form-group"><label class="form-label">Password</label><input id="api-login-pass" class="form-input" type="password" value="admin123"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitHanmakLogin()">${icon('key')} Connect</button>
      </div>
    </div>
  `);
}

async function submitHanmakLogin() {
  const username = document.getElementById('api-login-user').value;
  const password = document.getElementById('api-login-pass').value;
  try {
    await hanmakLogin(username, password);
    if (typeof hydrateOrganizationChrome === 'function') await hydrateOrganizationChrome();
    closeModal();
    refreshAuthButton();
    showToast('Connected to HanMak API', 'success');
    navigate(currentPage || 'dashboard');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function hanmakLogout() {
  localStorage.removeItem('HANMAK_ACCESS_TOKEN');
  localStorage.removeItem('HANMAK_REFRESH_TOKEN');
  refreshAuthButton();
  showToast('Disconnected from API', 'info');
}

async function ensureHanmakApi() {
  if (localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    if (!localStorage.getItem('HANMAK_ORGANIZATION_ID') && typeof hydrateOrganizationChrome === 'function') await hydrateOrganizationChrome();
    return true;
  }
  // No access token — try silent refresh before falling back to auto-login
  if (localStorage.getItem('HANMAK_REFRESH_TOKEN')) {
    try {
      await hanmakRefreshLogin();
      if (typeof hydrateOrganizationChrome === 'function') await hydrateOrganizationChrome();
      if (typeof refreshAuthButton === 'function') refreshAuthButton();
      return true;
    } catch {
      // Refresh token invalid/expired — clear it and fall through to auto-login
      localStorage.removeItem('HANMAK_REFRESH_TOKEN');
    }
  }
  if (window.HANMAK_FRONTEND_CONFIG?.allowDemoAutoLogin) {
    try {
      await hanmakLogin();
      if (typeof hydrateOrganizationChrome === 'function') await hydrateOrganizationChrome();
      if (typeof refreshAuthButton === 'function') refreshAuthButton();
      return true;
    } catch (error) {
      showToast('Connect the API to load live data', 'info');
      return false;
    }
  }
  showToast('Sign in to load live beta data', 'info');
  return false;
}

let envelopeFilterTimer = null;
let latestEnvelopeRows = [];
let _envelopeNext = null;
let _envelopePrev = null;

function envelopeFilterDebounce() {
  clearTimeout(envelopeFilterTimer);
  envelopeFilterTimer = setTimeout(envelopes_init, 350);
}

function selectedEnvelopeIds() {
  return [...document.querySelectorAll('.env-check:checked')]
    .map(input => Number(input.value || input.dataset.id || 0))
    .filter(Boolean);
}

function renderEnvelopeLiveRow(item) {
  const status = titleCaseStatus(item.status);
  const recipients = item.recipients || [];
  const overdue = item.due_date && !['completed','voided','declined','expired'].includes(item.status) && item.due_date < new Date().toISOString().slice(0, 10);
  return `<tr>
    <td><input type="checkbox" class="env-check" value="${item.id}" data-id="${item.id}"></td>
    <td><div style="font-weight:600;color:var(--text-primary);margin-bottom:2px">${item.name}</div><div style="font-size:0.75rem;color:var(--text-muted)">ENV-${item.id}</div></td>
    <td><span class="badge badge-${status === 'Completed' ? 'success' : status === 'Draft' ? 'secondary' : status === 'Voided' ? 'danger' : 'warning'}">${status}</span>${overdue ? '<br><span class="badge badge-danger" style="font-size:0.65rem;margin-top:3px">OVERDUE</span>' : ''}</td>
    <td><div class="flex" style="gap:0">${recipients.slice(0,3).map(r => `<span title="${r.name}" style="margin-left:-4px">${avatar(r.name,26)}</span>`).join('')}</div><div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">${recipients.length} recipient${recipients.length === 1 ? '' : 's'}</div></td>
    <td style="font-size:0.8125rem">${item.template || '-'}</td>
    <td style="font-size:0.8125rem;color:var(--text-muted)">${apiDate(item.sent_at)}</td>
    <td style="font-size:0.8125rem;color:var(--text-muted)">${item.due_date || '-'}</td>
    <td style="min-width:100px"><div style="display:flex;align-items:center;gap:0.5rem"><div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden"><div style="height:100%;width:${item.completion_percent || 0}%;background:var(--primary)"></div></div><span style="font-size:0.75rem;color:var(--text-muted);flex-shrink:0">${item.completion_percent || 0}%</span></div></td>
    <td><div class="flex gap-1">
      <button class="btn btn-ghost btn-sm" onclick="openLiveEnvelopeDrawer(${item.id})" title="View">${icon('eye')}</button>
      <button class="btn btn-ghost btn-sm" onclick="openEditEnvelopeModal(${item.id})" title="Edit">${icon('edit')}</button>
      <button class="btn btn-ghost btn-sm" onclick="sendEnvelopeLive(${item.id})" title="Send">${icon('send')}</button>
      <button class="btn btn-ghost btn-sm" onclick="remindEnvelopeLive(${item.id})" title="Remind">${icon('refresh')}</button>
      <button class="btn btn-ghost btn-sm" onclick="downloadEnvelopePdfLive(${item.id})" title="Download">${icon('download')}</button>
      <button class="btn btn-ghost btn-sm" onclick="openEnvelopeEmailLab(${item.id})" title="Emails">${icon('file')}</button>
      ${['sent','viewed','partially_signed','draft'].includes(item.status) ? `<button class="btn btn-ghost btn-sm" onclick="voidEnvelopeLive(${item.id})" title="Void" style="color:var(--warning)">${icon('x-circle')}</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="deleteEnvelopeLive(${item.id}, '${escapeHtml(item.status || '').replaceAll("'", "\\'")}')" title="Delete" style="color:var(--danger)">${icon('trash')}</button>
    </div></td>
  </tr>`;
}

async function envelopes_init(url) {
  if (!await ensureHanmakApi()) return;
  try {
    let fetchUrl;
    if (url) {
      fetchUrl = url.replace(/^https?:\/\/[^/]+/, '');
    } else {
      const params = new URLSearchParams();
      const search = document.getElementById('envelope-search')?.value || '';
      const status = document.getElementById('envelope-status-filter')?.value || '';
      const ordering = document.getElementById('envelope-sort')?.value || '-created_at';
      const dueFrom = document.getElementById('envelope-due-from')?.value || '';
      const dueTo = document.getElementById('envelope-due-to')?.value || '';
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (ordering) params.set('ordering', ordering);
      if (dueFrom) params.set('due_from', dueFrom);
      if (dueTo) params.set('due_to', dueTo);
      fetchUrl = `/envelopes/?${params}`;
    }
    const [data, summary] = await Promise.all([
      hanmakApi(fetchUrl),
      hanmakApi(`/envelopes/summary/${fetchUrl.includes('?') ? fetchUrl.slice(fetchUrl.indexOf('?')) : ''}`),
    ]);
    const rows = data.results || data;
    latestEnvelopeRows = rows;
    _envelopeNext = data.next || null;
    _envelopePrev = data.previous || null;
    const tbody = document.querySelector('#page-content table.table tbody');
    if (tbody) tbody.innerHTML = rows.length ? rows.map(renderEnvelopeLiveRow).join('') : '<tr><td colspan="9"><div class="empty-state"><div class="empty-state-title">No envelopes match your filters</div></div></td></tr>';
    const footer = document.querySelector('#page-content .card > div:last-child');
    if (footer) {
      const countSpan = footer.querySelector('span');
      if (countSpan) countSpan.textContent = `Showing ${rows.length} of ${data.count ?? rows.length} live envelopes`;
      const prevBtn = footer.querySelector('[data-env-prev]');
      const nextBtn = footer.querySelector('[data-env-next]');
      if (prevBtn) prevBtn.disabled = !_envelopePrev;
      if (nextBtn) nextBtn.disabled = !_envelopeNext;
    }
    renderEnvelopeStats(summary || rows);
  } catch (error) {
    showToast(`Envelope API error: ${error.message}`, 'error');
  }
}

async function voidEnvelopeLive(id) {
  confirm(`Void envelope #${id}? Signers will no longer be able to sign.`, async () => {
    try {
      await hanmakApi(`/envelopes/${id}/void/`, {method: 'POST', body: JSON.stringify({reason: 'Voided by admin'})});
      showToast(`Envelope #${id} voided`, 'success');
      envelopes_init();
    } catch (error) {
      showToast(error.message || 'Void failed', 'error');
    }
  });
}

async function deleteEnvelopeLive(id, status = '') {
  const statusText = status ? ` (${titleCaseStatus(status)})` : '';
  confirm(`Delete envelope #${id}${statusText}? This removes the record and related signing data unless a legal hold blocks it.`, async () => {
    try {
      await hanmakApi(`/envelopes/${id}/`, {method: 'DELETE'});
      showToast(`Envelope #${id} deleted`, 'success');
      envelopes_init();
    } catch (error) {
      showToast(error.message || 'Delete failed. This envelope may be protected by permissions or legal hold.', 'error', 7000);
    }
  });
}

async function downloadEnvelopePdfLive(id) {
  try {
    const response = await fetch(`${HANMAK_API_BASE_URL}/envelopes/${id}/download/`, {
      headers: {Authorization: `Bearer ${hanmakToken()}`},
    });
    if (!response.ok) throw new Error('Download failed');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `hanmak-envelope-${id}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
    showToast(`Envelope #${id} PDF downloaded`, 'success');
  } catch (error) {
    showToast(error.message || 'Download failed', 'error');
  }
}

async function openEditEnvelopeModal(id) {
  try {
    const item = await hanmakApi(`/envelopes/${id}/`);
    const recipients = item.recipients || [];
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Edit Envelope</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Envelope Name</label><input id="env-edit-name" class="form-input" value="${escapeHtml(item.name || '')}"></div>
        <div class="form-group"><label class="form-label">Due Date</label><input id="env-edit-due" type="date" class="form-input" value="${item.due_date || ''}"></div>
        <div class="form-group"><label class="form-label">Message</label><textarea id="env-edit-message" class="form-input" rows="3">${escapeHtml(item.message || '')}</textarea></div>
        <div style="font-weight:700;margin:1rem 0 0.5rem">Recipients</div>
        <div id="env-edit-recipients" class="flex flex-col gap-2">
          ${recipients.map((recipient, index) => `
            <div class="card" style="padding:0.75rem" data-recipient-id="${recipient.id || ''}">
              <div style="display:grid;grid-template-columns:1fr 1fr 130px 90px;gap:0.5rem">
                <input class="form-input env-edit-rec-name" value="${escapeHtml(recipient.name || '')}" placeholder="Name">
                <input class="form-input env-edit-rec-email" value="${escapeHtml(recipient.email || '')}" placeholder="Email">
                <select class="form-input env-edit-rec-role">
                  ${['signer','approver','cc','viewer'].map(role => `<option value="${role}" ${recipient.role === role ? 'selected' : ''}>${titleCaseStatus(role)}</option>`).join('')}
                </select>
                <input class="form-input env-edit-rec-order" type="number" min="1" value="${recipient.routing_order || index + 1}">
              </div>
            </div>
          `).join('') || '<div style="font-size:0.8125rem;color:var(--text-muted)">No recipients yet.</div>'}
        </div>
        <button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onclick="addEnvelopeEditRecipientRow()">${icon('plus')} Add Recipient</button>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEnvelopeEditLive(${id})">${icon('save')} Save Envelope</button>
      </div>
    `);
  } catch (error) {
    showToast(error.message || 'Could not open envelope editor', 'error');
  }
}

function addEnvelopeEditRecipientRow() {
  const list = document.getElementById('env-edit-recipients');
  if (!list) return;
  if (list.textContent.includes('No recipients yet.')) list.innerHTML = '';
  const order = list.querySelectorAll('.card').length + 1;
  list.insertAdjacentHTML('beforeend', `
    <div class="card" style="padding:0.75rem">
      <div style="display:grid;grid-template-columns:1fr 1fr 130px 90px;gap:0.5rem">
        <input class="form-input env-edit-rec-name" placeholder="Name">
        <input class="form-input env-edit-rec-email" placeholder="Email">
        <select class="form-input env-edit-rec-role">
          <option value="signer">Signer</option><option value="approver">Approver</option><option value="cc">Cc</option><option value="viewer">Viewer</option>
        </select>
        <input class="form-input env-edit-rec-order" type="number" min="1" value="${order}">
      </div>
    </div>
  `);
}

async function saveEnvelopeEditLive(id) {
  const name = document.getElementById('env-edit-name')?.value.trim();
  if (!name) return showToast('Envelope name is required', 'error');
  const recipients = [...document.querySelectorAll('#env-edit-recipients .card')].map(row => ({
    name: row.querySelector('.env-edit-rec-name')?.value.trim() || '',
    email: row.querySelector('.env-edit-rec-email')?.value.trim() || '',
    role: row.querySelector('.env-edit-rec-role')?.value || 'signer',
    routing_order: Number(row.querySelector('.env-edit-rec-order')?.value || 1),
  })).filter(recipient => recipient.name || recipient.email);
  if (!recipients.length) return showToast('Add at least one recipient', 'error');
  const missingEmail = recipients.find(recipient => !recipient.email);
  if (missingEmail) return showToast(`Email is required for ${missingEmail.name || 'each recipient'}`, 'error');
  try {
    await hanmakApi(`/envelopes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        due_date: document.getElementById('env-edit-due')?.value || null,
        message: document.getElementById('env-edit-message')?.value || '',
        recipients,
      }),
    });
    closeModal();
    showToast('Envelope saved', 'success');
    envelopes_init();
  } catch (error) {
    showToast(error.message || 'Envelope save failed', 'error');
  }
}

function exportEnvelopeListLive() {
  const rows = latestEnvelopeRows || [];
  const csv = ['id,name,status,due_date,completion_percent', ...rows.map(row => [
    row.id,
    `"${String(row.name || '').replace(/"/g, '""')}"`,
    row.status,
    row.due_date || '',
    row.completion_percent || 0,
  ].join(','))].join('\n');
  downloadTextFile(`hanmak-envelopes-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
  navigator.clipboard?.writeText(csv).catch(() => {});
  showToast(`${rows.length} envelope row(s) exported as CSV`, 'success');
}

function openEnvelopeBulkActions() {
  const ids = selectedEnvelopeIds();
  if (!ids.length) return showToast('Select at least one envelope first.', 'info');
  const selectedRows = latestEnvelopeRows.filter(row => ids.includes(Number(row.id)));
  const draftCount = selectedRows.filter(row => row.status === 'draft').length;
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Bulk Envelope Actions</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <p style="font-size:0.875rem;color:var(--text-muted);margin-bottom:1rem">${ids.length} envelope(s) selected · ${draftCount} draft(s).</p>
      <div class="flex flex-col gap-2">
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="runEnvelopeBulkAction('send')">${icon('send')} Send draft envelopes</button>
        <button class="btn btn-ghost" style="justify-content:flex-start" onclick="runEnvelopeBulkAction('void')">${icon('x-circle')} Void active envelopes</button>
        <button class="btn btn-ghost" style="justify-content:flex-start;color:var(--danger)" onclick="runEnvelopeBulkAction('delete_drafts')">${icon('trash')} Delete selected drafts</button>
        <button class="btn btn-danger" style="justify-content:flex-start" onclick="runEnvelopeBulkAction('delete')">${icon('trash')} Delete selected envelopes</button>
      </div>
    </div>
  `);
}

async function runEnvelopeBulkAction(action) {
  const ids = selectedEnvelopeIds();
  if (!ids.length) return showToast('Select at least one envelope first.', 'info');
  if (action === 'delete_drafts') {
    const draftCount = latestEnvelopeRows.filter(row => ids.includes(Number(row.id)) && row.status === 'draft').length;
    if (!draftCount) return showToast('None of the selected envelopes are drafts. Use "Delete selected envelopes" to delete non-drafts.', 'info', 6000);
  }
  if (action === 'delete') {
    confirm(`Delete ${ids.length} selected envelope(s)? This removes related signing data unless legal hold blocks it.`, () => runEnvelopeBulkActionConfirmed(action, ids));
    return;
  }
  runEnvelopeBulkActionConfirmed(action, ids);
}

async function runEnvelopeBulkActionConfirmed(action, ids) {
  closeModal();
  try {
    const data = await hanmakApi('/envelopes/bulk-action/', {
      method: 'POST',
      body: JSON.stringify({ids, action}),
    });
    const count = data.updated ?? data.deleted ?? 0;
    const label = action === 'delete_drafts' ? 'delete drafts' : action.replace('_', ' ');
    showToast(`Bulk ${label} complete: ${count}`, count ? 'success' : 'info', 6000);
    envelopes_init();
  } catch (error) {
    showToast(error.message || 'Bulk action failed. Check permissions or legal holds.', 'error', 7000);
  }
}

function renderEnvelopeStats(summaryOrRows) {
  const isRows = Array.isArray(summaryOrRows);
  const rows = isRows ? summaryOrRows : [];
  const total = isRows ? rows.length : summaryOrRows.total || 0;
  const draft = isRows ? rows.filter(e => e.status === 'draft').length : summaryOrRows.draft || 0;
  const completed = isRows ? rows.filter(e => e.status === 'completed').length : summaryOrRows.completed || 0;
  const inProgress = isRows ? rows.filter(e => ['sent', 'viewed', 'partially_signed'].includes(e.status)).length : summaryOrRows.in_progress || 0;
  const closed = isRows ? rows.filter(e => ['voided', 'expired', 'declined'].includes(e.status)).length : summaryOrRows.closed || 0;
  const stats = document.querySelector('#page-content .stats-grid');
  if (!stats) return;
  stats.innerHTML = [
    ['Total', total, 'var(--primary)'],
    ['Draft', draft, 'var(--text-muted)'],
    ['In Progress', inProgress, 'var(--warning)'],
    ['Completed', completed, 'var(--success)'],
    ['Voided/Expired', closed, 'var(--danger)'],
  ].map(([label, value, color]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div></div>`).join('');
}

async function openLiveEnvelopeDrawer(id) {
  try {
    const item = await hanmakApi(`/envelopes/${id}/`);
    openDrawer(`
      <div class="drawer-header"><h3 class="drawer-title">${item.name}</h3><button class="modal-close" onclick="closeDrawer()">x</button></div>
      <div class="drawer-body">
        <div class="card" style="padding:1rem;margin-bottom:1rem">
          ${[['Status', titleCaseStatus(item.status)], ['Created', apiDate(item.created_at)], ['Sent', apiDate(item.sent_at)], ['Due', item.due_date || '-'], ['Completion', `${item.completion_percent || 0}%`], ['Sender', item.sender_username || '-']].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${k}</span><strong>${v}</strong></div>`).join('')}
        </div>
        <div style="font-weight:600;margin-bottom:0.75rem">Recipients</div>
        ${(item.recipients || []).map(r => `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid var(--border)">${avatar(r.name,36)}<div style="flex:1"><div style="font-weight:500">${r.name}</div><div style="font-size:0.75rem;color:var(--text-muted)">${r.email}${r.delegated_from ? ` · delegated from #${r.delegated_from}` : ''}</div></div><span class="badge">${titleCaseStatus(r.status)}</span>${['pending','sent','viewed'].includes(r.status) ? `<button class="btn btn-ghost btn-sm" onclick="openDelegateRecipientModal(${r.id}, ${item.id})">${icon('send')} Delegate</button>` : ''}</div>`).join('')}
        ${(item.field_values || []).filter(value => value.attachment_url).length ? `
          <div style="font-weight:600;margin:1.25rem 0 0.75rem">Signer Attachments</div>
          ${(item.field_values || []).filter(value => value.attachment_url).map(value => `<div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid var(--border)">
            <div style="min-width:0">
              <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(value.metadata?.label || value.field_key)}</div>
              <div style="font-size:0.75rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(value.metadata?.filename || value.value || 'Uploaded file')}</div>
            </div>
            <a class="btn btn-ghost btn-sm" href="${escapeHtml(value.attachment_url)}" target="_blank">${icon('external-link')} Open</a>
          </div>`).join('')}
        ` : ''}
        ${(item.field_values || []).length ? `
          <div style="font-weight:600;margin:1.25rem 0 0.75rem">Filled Document Review</div>
          ${renderEnvelopeReviewDocument(item)}
        ` : ''}
        <div class="flex gap-2" style="margin-top:1rem">
          <button class="btn btn-primary btn-sm" onclick="sendEnvelopeLive(${item.id})">${icon('send')} Send</button>
          <button class="btn btn-ghost btn-sm" onclick="remindEnvelopeLive(${item.id})">${icon('refresh')} Remind</button>
          <button class="btn btn-ghost btn-sm" onclick="openEnvelopeEmailLab(${item.id})">${icon('file')} Emails</button>
          <button class="btn btn-ghost btn-sm" onclick="generateEnvelopeSignedPdf(${item.id})">${icon('download')} Signed PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="openEnvelopeDocumentLab(${item.id})">${icon('file')} Documents</button>
          ${['sent','viewed','partially_signed','draft'].includes(item.status) ? `<button class="btn btn-ghost btn-sm" onclick="voidEnvelopeLive(${item.id})" style="color:var(--warning)">${icon('x-circle')} Void</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="deleteEnvelopeLive(${item.id}, '${escapeHtml(item.status || '').replaceAll("'", "\\'")}')" style="color:var(--danger)">${icon('trash')} Delete</button>
        </div>
      </div>
    `);
    if ((item.field_values || []).length) {
      schedulePublicSigningCanvasResize();
      renderPublicSigningDocumentPages();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openDelegateRecipientModal(recipientId, envelopeId) {
  openModal(`
    <div class="modal">
      <div class="modal-header">
        <div>
          <div class="modal-title">Delegate Signing Task</div>
          <div class="modal-subtitle">Move this recipient's remaining fields to another person</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Delegate Name</label><input id="delegate-name" class="form-input" placeholder="Full name"></div>
        <div class="form-group"><label class="form-label">Delegate Email</label><input id="delegate-email" class="form-input" type="email" placeholder="delegate@example.com"></div>
        <div class="form-group"><label class="form-label">Reason</label><textarea id="delegate-reason" class="form-input" rows="2" placeholder="Optional reason for the delegation"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="delegateRecipientLive(${recipientId}, ${envelopeId})">${icon('send')} Delegate</button>
      </div>
    </div>
  `);
}

async function delegateRecipientLive(recipientId, envelopeId) {
  try {
    const name = document.getElementById('delegate-name').value.trim();
    const email = document.getElementById('delegate-email').value.trim();
    const reason = document.getElementById('delegate-reason').value.trim();
    if (!name || !email) return showToast('Delegate name and email are required', 'error');
    const delegated = await hanmakApi(`/recipients/${recipientId}/delegate/`, {
      method: 'POST',
      body: JSON.stringify({name, email, reason}),
    });
    closeModal();
    showToast(`Delegated to ${delegated.name}. Previous link revoked.`, 'success', 6000);
    openLiveEnvelopeDrawer(envelopeId);
  } catch (error) {
    showToast(`Delegation failed: ${error.message}`, 'error', 7000);
  }
}

async function openEnvelopeDocumentLab(envelopeId) {
  try {
    const links = await hanmakApi('/envelope-documents/');
    const envelopeLinks = (links.results || links).filter(link => link.envelope === envelopeId);
    openDrawerLg(`
      <div class="drawer-header"><h3 class="drawer-title">Document Security & Placement</h3><button class="modal-close" onclick="closeDrawer()">x</button></div>
      <div class="drawer-body">
        <div class="flex gap-2" style="margin-bottom:1rem">
          <button class="btn btn-primary btn-sm" onclick="generateEnvelopeSignedPdf(${envelopeId})">${icon('download')} Generate Signed PDF</button>
        </div>
        ${envelopeLinks.length ? envelopeLinks.map(renderEnvelopeDocumentCard).join('') : '<div class="empty-state"><div class="empty-state-title">No linked documents</div><div class="empty-state-desc">Upload/process documents, then link them to the envelope.</div></div>'}
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderEnvelopeDocumentCard(link) {
  const documentDetail = link.document_detail || {};
  return `<div class="card" style="padding:1rem;margin-bottom:1rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:0.75rem">
      <div>
        <div style="font-weight:700">${documentDetail.title || `Document #${link.document}`}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">Status: ${titleCaseStatus(documentDetail.status)} · Pages: ${documentDetail.page_count || 0} · SHA: ${(documentDetail.sha256 || '').slice(0,12) || '-'}</div>
      </div>
      <span class="badge badge-${documentDetail.status === 'ready' ? 'success' : 'warning'}">${documentDetail.status || 'linked'}</span>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-ghost btn-sm" onclick="scanDocumentLive(${link.document})">${icon('shield')} Scan</button>
      <button class="btn btn-ghost btn-sm" onclick="processDocumentLive(${link.document})">${icon('refresh')} Process Pages</button>
    </div>
  </div>`;
}

async function scanDocumentLive(documentId) {
  try {
    const scan = await hanmakApi(`/documents/${documentId}/scan/`, {method: 'POST', body: JSON.stringify({})});
    showToast(`Scan complete: ${scan.status}`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function processDocumentLive(documentId) {
  try {
    const processedDocument = await hanmakApi(`/documents/${documentId}/process/`, {method: 'POST', body: JSON.stringify({page_count: 1})});
    showToast(`Processed ${processedDocument.page_count} page(s)`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openEnvelopeEmailLab(envelopeId) {
  try {
    const [messages, envelope] = await Promise.all([
      hanmakApi(`/email-messages/`),
      hanmakApi(`/envelopes/${envelopeId}/`),
    ]);
    const rows = (messages.results || messages).filter(message => message.envelope === envelopeId);
    const recipientsById = Object.fromEntries((envelope.recipients || []).map(recipient => [recipient.id, recipient]));
    openDrawerLg(`
      <div class="drawer-header"><h3 class="drawer-title">Email & Signing Links</h3><button class="modal-close" onclick="closeDrawer()">x</button></div>
      <div class="drawer-body">
        <div class="card" style="padding:0.85rem;margin-bottom:1rem;background:var(--bg-secondary)">
          <div style="font-weight:800;margin-bottom:0.5rem">Routing Overview</div>
          ${(envelope.recipients || []).map(recipient => `<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.35rem 0;border-bottom:1px solid var(--border);font-size:0.8rem"><span>${escapeHtml(recipient.name)}${recipient.delegated_from ? ` <span style="color:var(--text-muted)">delegated from #${recipient.delegated_from}</span>` : ''}</span><span>${liveBadge(recipient.status)} <span style="color:var(--text-muted)">order ${recipient.routing_order}</span></span></div>`).join('')}
        </div>
        <div class="flex gap-2" style="margin-bottom:1rem">
          <button class="btn btn-primary btn-sm" onclick="sendEnvelopeLive(${envelopeId});setTimeout(()=>openEnvelopeEmailLab(${envelopeId}),700)">${icon('send')} Queue Invites</button>
          <button class="btn btn-ghost btn-sm" onclick="remindEnvelopeLive(${envelopeId});setTimeout(()=>openEnvelopeEmailLab(${envelopeId}),700)">${icon('refresh')} Queue Reminders</button>
          <button class="btn btn-ghost btn-sm" onclick="generateEnvelopeSignedPdf(${envelopeId})">${icon('download')} Generate Signed PDF</button>
        </div>
        ${rows.length ? rows.map(message => renderEmailMessageCard(message, recipientsById[message.recipient])).join('') : '<div class="empty-state"><div class="empty-state-title">No emails queued yet</div><div class="empty-state-desc">Queue invites or reminders to create signing links.</div></div>'}
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderEmailMessageCard(message, recipient = null) {
  const linkState = recipient?.status === 'delegated' ? 'Superseded' : message.signing_url ? 'Active link' : 'No link';
  return `<div class="card" style="padding:1rem;margin-bottom:1rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:0.75rem">
      <div>
        <div style="font-weight:700">${message.subject}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${message.to_email} · ${titleCaseStatus(message.kind)} · ${titleCaseStatus(message.status)}${recipient ? ` · ${titleCaseStatus(recipient.role)} · order ${recipient.routing_order}` : ''}</div>
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center;flex-wrap:wrap;justify-content:flex-end">
        ${recipient ? liveBadge(recipient.status) : ''}
        <span class="badge badge-${message.status === 'sent' ? 'success' : message.status === 'failed' ? 'danger' : 'warning'}">${message.status}</span>
      </div>
    </div>
    <div style="font-size:0.78rem;color:${linkState === 'Superseded' ? 'var(--warning)' : 'var(--text-muted)'};margin-bottom:0.6rem">${linkState}${recipient?.delegated_from ? ` · delegated from recipient #${recipient.delegated_from}` : ''}</div>
    ${message.status === 'failed' || message.bounced_at ? `<div class="alert alert-danger" style="margin-bottom:0.75rem">${icon('alert-circle')} ${escapeHtml(message.bounce_reason || message.error_message || 'Delivery failed')}</div>` : ''}
    <div class="form-group">
      <label class="form-label">Signing URL</label>
      <div style="display:flex;gap:0.5rem">
        <input class="form-input" value="${message.signing_url || ''}" readonly>
        <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${message.signing_url || ''}')">${icon('copy')}</button>
        <button class="btn btn-primary btn-sm" ${linkState === 'Superseded' ? 'disabled' : ''} onclick="openSigningUrl('${message.signing_url || ''}')">${icon('external-link')} Test</button>
      </div>
    </div>
    <div class="flex gap-2" style="margin-bottom:0.75rem">
      ${message.status === 'failed' ? `<button class="btn btn-ghost btn-sm" onclick="retryEmailMessageLive(${message.id})">${icon('refresh')} Retry</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="markEmailBouncedLive(${message.id})">${icon('alert-circle')} Mark Bounce</button>
    </div>
    <details>
      <summary style="cursor:pointer;font-size:0.8125rem;font-weight:600">Preview HTML email</summary>
      <iframe style="width:100%;height:320px;border:1px solid var(--border);border-radius:6px;margin-top:0.75rem;background:white" srcdoc="${(message.html_body || '').replaceAll('"', '&quot;')}"></iframe>
    </details>
  </div>`;
}

function openSigningUrl(url) {
  if (!url) return showToast('No signing URL available', 'error');
  const token = url.split('/sign/')[1]?.replaceAll('/', '');
  if (!token) return window.open(url, '_blank');
  navigate('public-signing', {token});
  closeDrawer();
}

async function generateEnvelopeSignedPdf(envelopeId) {
  try {
    let bundles = await hanmakApi('/evidence-bundles/');
    let bundle = (bundles.results || bundles).find(item => item.envelope === envelopeId);
    if (!bundle) {
      bundle = await hanmakApi('/evidence-bundles/', {
        method: 'POST',
        body: JSON.stringify({envelope: envelopeId}),
      });
    }
    const generated = await hanmakApi(`/evidence-bundles/${bundle.id}/generate-signed-pdf/`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const verification = await verifyEvidenceBundleLive(bundle.id, {silent: true});
    openModal(`
      <div class="modal modal-sm">
        <div class="modal-header"><div class="modal-title">Signed PDF Ready</div><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <div class="alert alert-${verification.valid ? 'success' : 'warning'}" style="margin-bottom:0.75rem">${icon(verification.valid ? 'check-circle' : 'alert-circle')} Evidence verification ${verification.valid ? 'passed' : 'needs attention'}</div>
          <div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">SHA-256</div>
          <code style="display:block;word-break:break-all;background:var(--bg-secondary);padding:0.75rem;border-radius:6px">${generated.signed_pdf_sha256}</code>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="copyToClipboard('${generated.signed_pdf_sha256}')">${icon('copy')} Copy Hash</button>
          <button class="btn btn-ghost" onclick="verifyEvidenceBundleLive(${bundle.id})">${icon('shield-check')} Verify</button>
          <a class="btn btn-primary" href="${generated.signed_pdf}" target="_blank">${icon('download')} Open PDF</a>
        </div>
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function verifyEvidenceBundleLive(bundleId, options = {}) {
  const verification = await hanmakApi(`/evidence-bundles/${bundleId}/verify/`, {method: 'POST', body: JSON.stringify({})});
  if (!options.silent) {
    openModal(`
      <div class="modal modal-sm">
        <div class="modal-header"><div class="modal-title">Evidence Verification</div><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <div class="alert alert-${verification.valid ? 'success' : 'danger'}" style="margin-bottom:1rem">${icon(verification.valid ? 'check-circle' : 'alert-circle')} ${verification.valid ? 'All stored hashes match.' : 'One or more evidence files failed verification.'}</div>
          ${evidenceVerificationRow('Manifest JSON', verification.manifest)}
          ${evidenceVerificationRow('Signed PDF', verification.signed_pdf)}
        </div>
      </div>
    `);
  }
  return verification;
}

function evidenceVerificationRow(label, result = {}) {
  return `<div style="padding:0.75rem;background:var(--bg-secondary);border-radius:6px;margin-bottom:0.5rem">
    <div style="display:flex;justify-content:space-between;gap:0.75rem;margin-bottom:0.35rem"><strong>${label}</strong>${liveBadge(result.valid ? 'valid' : 'invalid')}</div>
    <div style="font-size:0.75rem;color:var(--text-muted);word-break:break-all">Expected: ${escapeHtml(result.expected_sha256 || '-')}</div>
    <div style="font-size:0.75rem;color:var(--text-muted);word-break:break-all">Actual: ${escapeHtml(result.actual_sha256 || '-')}</div>
  </div>`;
}

registerPage('email-messages', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Email Messages</h1>
    <p class="page-subtitle">Queued invites, reminders, signing URLs, retries, bounces, and HTML email previews</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="runDueRemindersLive()">${icon('refresh')} Run Due Reminders</button>
    <button class="btn btn-primary" onclick="email_messages_init()">${icon('refresh')} Refresh</button>
  </div>
</div>
<div id="email-reliability-stats" class="stats-grid" style="margin-bottom:1rem"></div>
<div class="card" style="padding:1rem;margin-bottom:1rem;background:var(--bg-secondary)">
  <div style="font-weight:800;margin-bottom:0.4rem">Bounce Webhook</div>
  <div style="font-size:0.8125rem;color:var(--text-muted);word-break:break-all">POST provider bounces to <code>/api/v1/email/bounce/</code> with <code>message_id</code> or <code>to_email</code> and <code>reason</code>.</div>
</div>
<div id="reminder-schedule-list" style="margin-bottom:1rem"></div>
<div id="email-message-list" class="flex flex-col gap-3"></div>
`);

async function email_messages_init() {
  if (!await ensureHanmakApi()) return;
  const [data, schedulesData] = await Promise.all([
    hanmakApi('/email-messages/'),
    hanmakApi('/reminder-schedules/'),
  ]);
  const rows = data.results || data;
  const schedules = schedulesData.results || schedulesData;
  renderEmailReliabilityStats(rows, schedules);
  renderReminderSchedulesLive(schedules);
  const list = document.getElementById('email-message-list');
  if (list) list.innerHTML = rows.map(renderEmailMessageCard).join('') || '<div class="empty-state"><div class="empty-state-title">No email messages yet</div></div>';
}

function renderEmailReliabilityStats(rows, schedules) {
  const target = document.getElementById('email-reliability-stats');
  if (!target) return;
  const queued = rows.filter(item => item.status === 'queued').length;
  const sent = rows.filter(item => item.status === 'sent').length;
  const failed = rows.filter(item => item.status === 'failed').length;
  const bounced = rows.filter(item => item.bounced_at).length;
  const activeSchedules = schedules.filter(item => item.status === 'active').length;
  target.innerHTML = [
    ['Queued', queued, 'var(--warning)'],
    ['Sent', sent, 'var(--success)'],
    ['Failed', failed, 'var(--danger)'],
    ['Bounced', bounced, 'var(--danger)'],
    ['Active Reminders', activeSchedules, 'var(--primary)'],
  ].map(([label, value, color]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div></div>`).join('');
}

function renderReminderSchedulesLive(schedules) {
  const target = document.getElementById('reminder-schedule-list');
  if (!target) return;
  target.innerHTML = liveTable(['Envelope', 'Interval', 'Sent', 'Next Run', 'Status'], schedules.map(schedule => `
    <tr>
      <td>Envelope #${schedule.envelope}</td>
      <td>${schedule.interval_days} day(s)</td>
      <td>${schedule.reminders_sent} / ${schedule.max_reminders}</td>
      <td>${apiDate(schedule.next_run_at)}</td>
      <td>${liveBadge(schedule.status)}</td>
    </tr>
  `), 'No reminder schedules yet');
}

async function retryEmailMessageLive(messageId) {
  try {
    await hanmakApi(`/email-messages/${messageId}/retry/`, {method: 'POST', body: JSON.stringify({})});
    showToast('Email retry queued', 'success');
    email_messages_init();
  } catch (error) {
    showToast(`Retry failed: ${error.message}`, 'error', 7000);
  }
}

async function markEmailBouncedLive(messageId) {
  try {
    const reason = prompt('Bounce reason', 'Mailbox rejected the message.') || 'Mailbox rejected the message.';
    await hanmakApi(`/email-messages/${messageId}/mark_bounced/`, {
      method: 'POST',
      body: JSON.stringify({reason}),
    });
    showToast('Email marked as bounced', 'success');
    email_messages_init();
  } catch (error) {
    showToast(`Bounce update failed: ${error.message}`, 'error', 7000);
  }
}

async function runDueRemindersLive() {
  try {
    await hanmakApi('/reminder-schedules/run_due/', {method: 'POST', body: JSON.stringify({})});
    showToast('Due reminder task queued', 'success');
    setTimeout(email_messages_init, 700);
  } catch (error) {
    showToast(`Reminder task failed: ${error.message}`, 'error', 7000);
  }
}

async function sendEnvelopeLive(id) {
  try {
    const data = await hanmakApi(`/envelopes/${id}/send/`, {method: 'POST', body: JSON.stringify({})});
    showToast(`Envelope sent. ${data.queued_email_count || 0} email queued.`, 'success');
    envelopes_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function remindEnvelopeLive(id) {
  try {
    const data = await hanmakApi(`/envelopes/${id}/remind/`, {method: 'POST', body: JSON.stringify({})});
    showToast(`${data.queued_email_count || 0} reminder email queued.`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function inbox_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/inbox/');
    const stats = document.querySelector('#page-content .stats-grid');
    if (stats) stats.innerHTML = [
      ['Pending Signatures', data.counts.signing || 0],
      ['Pending Approvals', data.counts.approvals || 0],
      ['Failed Tasks', data.counts.failed_tasks || 0],
      ['Live Items', (data.counts.signing || 0) + (data.counts.approvals || 0) + (data.counts.failed_tasks || 0)],
    ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
    const list = document.getElementById('inbox-list');
    if (list) list.innerHTML = [
      ...data.signing.map(item => liveSigningInboxItem(item)),
      ...data.approvals.map(item => liveApprovalInboxItem(item)),
      ...data.failed_tasks.map(item => liveTaskInboxItem(item)),
    ].join('') || `<div class="empty-state"><div class="empty-state-title">Inbox clear</div><div class="empty-state-desc">No live tasks are waiting right now.</div></div>`;
  } catch (error) {
    showToast(`Inbox API error: ${error.message}`, 'error');
  }
}

function liveInboxItemShell(iconName, title, desc, priority, actions) {
  const priorityColor = priority === 'high' ? 'var(--danger)' : priority === 'medium' ? 'var(--warning)' : 'var(--text-muted)';
  return `<div class="card" style="padding:1rem;margin-bottom:0.75rem;display:flex;align-items:flex-start;gap:1rem">
    <div style="width:36px;height:36px;border-radius:var(--radius-md);background:var(--bg-surface);display:flex;align-items:center;justify-content:center;flex-shrink:0">${icon(iconName, 16)}</div>
    <div style="flex:1;min-width:0">
      <div style="font-weight:600;font-size:0.875rem;color:var(--text-primary);margin-bottom:2px">${escapeHtml(title)}</div>
      <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem">${escapeHtml(desc || '')}</div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap">${actions}</div>
    </div>
    <span style="font-size:0.7rem;font-weight:600;color:${priorityColor};text-transform:uppercase;flex-shrink:0">${priority}</span>
  </div>`;
}

function liveSigningInboxItem(item) {
  const title = item.envelope_name || `Envelope #${item.envelope}`;
  const desc = `Signing session · ${titleCaseStatus(item.status)}`;
  const actions = item.token
    ? `<button class="btn btn-primary btn-sm" onclick="openPublicSigningToken('${item.token}')">${icon('edit')} Sign Now</button>`
    : `<button class="btn btn-secondary btn-sm" onclick="navigate('envelopes')">${icon('eye')} View Envelope</button>`;
  return liveInboxItemShell('edit', title, desc, 'medium', actions);
}

function liveApprovalInboxItem(item) {
  const title = item.envelope_name || `Envelope #${item.envelope}`;
  const desc = `Approval request · ${item.role || 'approver'}`;
  const actions = `
    <button class="btn btn-ghost btn-sm" onclick="openApprovalReviewLive(${item.id})">${icon('eye')} Review</button>
    <button class="btn btn-primary btn-sm" onclick="approveInboxItemLive(${item.id})">${icon('check')} Approve</button>
    <button class="btn btn-secondary btn-sm" onclick="rejectInboxItemLive(${item.id})">${icon('x')} Reject</button>
    <button class="btn btn-ghost btn-sm" onclick="delegateInboxItemLive(${item.id})">${icon('refresh')} Delegate</button>
  `;
  return liveInboxItemShell('check', title, desc, 'high', actions);
}

async function openApprovalReviewLive(approvalId) {
  try {
    const approval = await hanmakApi(`/approval-requests/${approvalId}/`);
    const envelope = await hanmakApi(`/envelopes/${approval.envelope}/`);
    openModal(`
      <div class="modal modal-xl">
        <div class="modal-header">
          <div>
            <div class="modal-title">Approval Review</div>
            <div class="modal-subtitle">${escapeHtml(envelope.name || `Envelope #${envelope.id}`)} · ${escapeHtml(approval.approval_role || 'Approval')}</div>
          </div>
          <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
        </div>
        <div class="modal-body">
          <div class="card" style="padding:0.75rem;margin-bottom:1rem;background:var(--bg-secondary)">
            <div style="display:flex;justify-content:space-between;gap:1rem;font-size:0.8125rem;flex-wrap:wrap">
              <span>Status: <strong>${titleCaseStatus(envelope.status)}</strong></span>
              <span>Submitted values: <strong>${(envelope.field_values || []).length}</strong></span>
              <span>Recipients: <strong>${(envelope.recipients || []).length}</strong></span>
            </div>
          </div>
          ${renderEnvelopeReviewDocument(envelope)}
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Close</button>
          <button class="btn btn-secondary" onclick="rejectInboxItemLive(${approvalId});closeModal()">${icon('x')} Reject</button>
          <button class="btn btn-primary" onclick="approveInboxItemLive(${approvalId});closeModal()">${icon('check')} Approve</button>
        </div>
      </div>
    `);
    schedulePublicSigningCanvasResize();
    await renderPublicSigningDocumentPages();
  } catch (error) {
    showToast(error.message || 'Approval review failed', 'error', 7000);
  }
}

function liveTaskInboxItem(item) {
  const title = item.task_name || 'Failed Task';
  const desc = item.error_message || 'Task failed';
  const actions = `<button class="btn btn-ghost btn-sm" onclick="navigate('background-tasks')">${icon('alert-circle')} View Tasks</button>`;
  return liveInboxItemShell('alert-circle', title, desc, 'high', actions);
}

async function approveInboxItemLive(approvalId) {
  try {
    await hanmakApi(`/approval-requests/${approvalId}/approve/`, {method: 'POST', body: JSON.stringify({})});
    showToast('Approved', 'success');
    inbox_init();
  } catch (error) {
    showToast(error.message || 'Approve failed', 'error');
  }
}

async function rejectInboxItemLive(approvalId) {
  const reason = prompt('Rejection reason (optional):') ?? '';
  try {
    await hanmakApi(`/approval-requests/${approvalId}/reject/`, {method: 'POST', body: JSON.stringify({reason})});
    showToast('Rejected', 'success');
    inbox_init();
  } catch (error) {
    showToast(error.message || 'Reject failed', 'error');
  }
}

async function delegateInboxItemLive(approvalId) {
  const email = prompt('Delegate to (email):');
  if (!email) return;
  try {
    await hanmakApi(`/approval-requests/${approvalId}/request_changes/`, {method: 'POST', body: JSON.stringify({delegate_to: email})});
    showToast('Delegated', 'success');
    inbox_init();
  } catch (error) {
    showToast(error.message || 'Delegate failed', 'error');
  }
}

let HANMAK_DASHBOARD_ACTIVITY_EVENTS = [];
let HANMAK_DASHBOARD_ACTIVITY_LIMIT = 8;

function dashboardOpenNewEnvelope() {
  navigate('envelopes');
  setTimeout(() => {
    if (typeof openCreateEnvelopeModal === 'function') openCreateEnvelopeModal();
  }, 250);
}

function dashboardActivityMessage(event) {
  const message = event.message || event.event_type || 'Activity event';
  return String(message).length > 120 ? `${String(message).slice(0, 117)}...` : message;
}

function dashboardActivityEventHtml(event) {
  const severity = event.severity || 'info';
  const actor = event.actor_username || 'System';
  return `
    <button type="button" onclick="navigate('audit')" style="width:100%;display:flex;align-items:center;gap:12px;padding:12px 14px;border:0;border-bottom:1px solid var(--border-light);background:transparent;text-align:left;cursor:pointer;">
      ${avatar(actor, 32)}
      <span style="flex:1;min-width:0;">
        <span style="display:block;font-size:13px;color:var(--text-primary);line-height:1.35;">
          <span style="font-weight:700;">${escapeHtml(actor)}</span> ${escapeHtml(dashboardActivityMessage(event))}
        </span>
        <span style="display:block;font-size:11px;color:var(--text-tertiary);margin-top:3px;">${apiDate(event.created_at)} · ${escapeHtml(event.event_type || 'audit')}</span>
      </span>
      ${liveBadge(severity)}
    </button>
  `;
}

function dashboardRenderActivityList() {
  const activityList = document.getElementById('dashboard-activity-list');
  const loadMore = document.getElementById('dashboard-load-more-activity');
  if (!activityList) return;
  const visible = HANMAK_DASHBOARD_ACTIVITY_EVENTS.slice(0, HANMAK_DASHBOARD_ACTIVITY_LIMIT);
  activityList.innerHTML = visible.length
    ? visible.map(dashboardActivityEventHtml).join('')
    : '<div class="empty-state"><div class="empty-state-title">No activity yet</div></div>';
  if (loadMore) {
    const remaining = Math.max(0, HANMAK_DASHBOARD_ACTIVITY_EVENTS.length - visible.length);
    loadMore.textContent = remaining ? `Load ${Math.min(8, remaining)} more activity item${remaining === 1 ? '' : 's'}` : 'All activity shown';
    loadMore.disabled = !remaining;
  }
}

function dashboardLoadMoreActivity() {
  HANMAK_DASHBOARD_ACTIVITY_LIMIT += 8;
  dashboardRenderActivityList();
}

async function dashboard_init() {
  injectAuthButton();
  if (!await ensureHanmakApi()) return;
  try {
    const {completion, inbox, search, audit: auditData, webhooks: webhookData, profile, risks, workflows, approvalBottlenecks} = await hanmakLoadDashboardSummary();
    const greeting = document.getElementById('dashboard-greeting');
    if (greeting) {
      const displayName = profile?.display_name || profile?.username || profile?.email || '';
      greeting.textContent = `Good morning${displayName ? `, ${displayName}` : ''}`;
    }
    const stats = document.querySelector('#page-content .stats-grid');
    if (stats) stats.innerHTML = [
      {label:'Total Envelopes', value:completion.total, change:'live API', dir:'up', color:'#4f8ef7'},
      {label:'Completed', value:completion.completed, change:'live API', dir:'up', color:'#10b981'},
      {label:'Pending Signatures', value:inbox.counts.signing, change:'from inbox', dir:'down', color:'#f59e0b'},
      {label:'In Approval', value:inbox.counts.approvals, change:'from inbox', dir:'down', color:'#ef4444'},
      {label:'Search Hits', value:search.results.length, change:'contract search', dir:'up', color:'#8b5cf6'},
      {label:'Completion Rate', value:`${completion.completion_rate}%`, change:'live API', dir:'up', color:'#14b8a6'},
    ].map(s => `<div class="stat-card"><div class="stat-card-accent" style="background:${s.color}"></div><div class="stat-label">${s.label}</div><div class="stat-value">${s.value}</div><div class="stat-change ${s.dir}">${s.change}</div></div>`).join('');
    const activityList = document.getElementById('dashboard-activity-list');
    const events = auditData.results || auditData;
    if (activityList) {
      HANMAK_DASHBOARD_ACTIVITY_EVENTS = Array.isArray(events) ? events : [];
      HANMAK_DASHBOARD_ACTIVITY_LIMIT = 8;
      dashboardRenderActivityList();
    }
    const attention = document.getElementById('dashboard-attention-list');
    if (attention) {
      const items = [
        ...(inbox.signing || []).map(item => ({type:'signature', title:item.envelope_name, due:item.due_at || 'Signing task', token:item.token})),
        ...(inbox.approvals || []).map(item => ({type:'approval', title:item.envelope_name, due:item.role || 'Approval task'})),
        ...(inbox.failed_tasks || []).map(item => ({type:'task', title:item.task_name, due:item.error_message || 'Failed task'})),
      ].slice(0, 6);
      const count = document.getElementById('dashboard-attention-count');
      if (count) count.textContent = `${items.length} item${items.length === 1 ? '' : 's'}`;
      attention.innerHTML = items.length ? items.map(item => `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-bottom:1px solid var(--border-light);">
          <div style="width:32px;height:32px;border-radius:var(--radius-md);background:var(--bg-surface);display:flex;align-items:center;justify-content:center;flex-shrink:0;">${icon(item.type === 'signature' ? 'edit' : item.type === 'approval' ? 'check' : 'alert-circle', 13)}</div>
          <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${escapeHtml(item.title || 'Task')}</div><div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${escapeHtml(String(item.due || ''))}</div></div>
          <button class="btn btn-primary btn-sm" onclick="${item.token ? `openPublicSigningToken('${item.token}')` : item.type === 'task' ? `navigate('tasks')` : item.type === 'approval' ? `navigate('approvals')` : `navigate('inbox')`}">Act</button>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-state-title">Nothing needs attention</div></div>';
    }
    const riskRadar = document.getElementById('dashboard-risk-radar');
    if (riskRadar) {
      const rows = (risks?.results || risks || []).slice(0, 4);
      const severityConfig = {
        critical: {label: 'Critical', badge: 'danger', score: 95},
        high: {label: 'High', badge: 'danger', score: 82},
        medium: {label: 'Medium', badge: 'warning', score: 55},
        low: {label: 'Low', badge: 'success', score: 24},
        info: {label: 'Info', badge: 'info', score: 12},
      };
      riskRadar.innerHTML = rows.length ? rows.map(row => {
        const severity = String(row.severity || 'info').toLowerCase();
        const config = severityConfig[severity] || severityConfig.info;
        const score = Number(row.metadata?.score || row.metadata?.risk_score || config.score);
        return `
          <div style="padding:12px;border-radius:var(--radius-md);border:1px solid var(--border-light);margin-bottom:10px;background:var(--bg-surface);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
              <span style="font-size:12px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(row.title || `Risk Finding #${row.id}`)}</span>
              <span class="badge badge-${config.badge}">${config.label} Risk</span>
            </div>
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(row.description || row.status || 'No description recorded.')}</div>
            <div class="progress-bar"><div class="progress-fill ${config.badge}" style="width:${Math.max(1, Math.min(100, score))}%"></div></div>
          </div>
        `;
      }).join('') : '<div class="empty-state"><div class="empty-state-title">No open risk findings</div></div>';
    }
    const workflowSnapshot = document.getElementById('dashboard-workflow-snapshot');
    if (workflowSnapshot) {
      const workflowRows = workflows?.results || workflows || [];
      const bottleneckRows = approvalBottlenecks || [];
      const statusCounts = workflowRows.reduce((acc, workflow) => {
        const status = titleCaseStatus(workflow.status || 'draft');
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      bottleneckRows.forEach(row => {
        const key = `${row.approval_role || 'Approval'} ${titleCaseStatus(row.status || '')}`.trim();
        statusCounts[key] = (statusCounts[key] || 0) + Number(row.count || 0);
      });
      const colors = ['#8b5cf6', '#4f8ef7', '#f59e0b', '#f97316', '#10b981', '#ef4444'];
      const rows = Object.entries(statusCounts).slice(0, 6);
      const total = rows.reduce((sum, [, count]) => sum + count, 0) || 1;
      workflowSnapshot.innerHTML = rows.length ? rows.map(([stage, count], index) => {
        const color = colors[index % colors.length];
        return `
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
            <div style="width:3px;height:32px;background:${color};border-radius:2px;flex-shrink:0;"></div>
            <div style="flex:1;">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px;gap:8px;">
                <span style="font-size:12px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(stage)}</span>
                <span style="font-size:12px;font-weight:700;color:var(--text-primary);">${count}</span>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="background:${color};width:${Math.min(100, (count / total) * 100)}%"></div></div>
            </div>
          </div>
        `;
      }).join('') : `<div class="empty-state"><div class="empty-state-title">No workflow data yet</div><button class="btn btn-primary btn-sm" onclick="navigate('workflow-builder')">Create Workflow</button></div>`;
    }
    const webhookHealth = document.getElementById('dashboard-webhook-health');
    if (webhookHealth) {
      const total = webhookData.reduce((sum, row) => sum + row.count, 0);
      const delivered = webhookData.find(row => row.status === 'delivered')?.count || 0;
      const failed = webhookData.find(row => row.status === 'failed')?.count || 0;
      const success = total ? Math.round((delivered / total) * 1000) / 10 : 100;
      webhookHealth.innerHTML = `<div style="padding-bottom:16px;border-bottom:1px solid var(--border-light);">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;font-weight:700;color:var(--text-primary)">Live webhook delivery</span>
          <span class="badge badge-${failed ? 'warning' : 'success'}">${failed ? 'attention' : 'healthy'}</span>
        </div>
        <div style="display:flex;gap:16px;font-size:11px;color:var(--text-secondary);">
          <span style="color:var(--success);">✓ ${success}% success</span>
          <span style="color:var(--danger);">✗ ${failed} failed</span>
          <span>${total} total</span>
        </div>
        <div class="progress-bar" style="margin-top:6px;"><div class="progress-fill success" style="width:${success}%"></div></div>
      </div>
      <div style="display:flex;gap:12px;font-size:12px;margin-top:1rem"><span style="color:var(--text-secondary)">Source:</span><button class="btn btn-ghost btn-sm" style="padding:0;height:auto;" onclick="navigate('webhooks')">Webhook Lab -></button></div>`;
    }
  } catch (error) {
    console.warn(error);
  }
}

async function exportDashboardReportLive() {
  if (!await ensureHanmakApi()) return;
  try {
    const {completion, inbox, search} = await hanmakLoadDashboardSummary();
    const csv = [
      'metric,value',
      `total_envelopes,${completion.total}`,
      `completed_envelopes,${completion.completed}`,
      `completion_rate,${completion.completion_rate}`,
      `pending_signatures,${inbox.counts.signing}`,
      `pending_approvals,${inbox.counts.approvals}`,
      `failed_tasks,${inbox.counts.failed_tasks}`,
      `search_hits,${search.results.length}`,
    ].join('\n');
    downloadTextFile(`hanmak-dashboard-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
    showToast('Dashboard report exported as CSV', 'success');
  } catch (error) {
    showToast(`Dashboard export failed: ${error.message}`, 'error');
  }
}

registerPage('signing', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Signing Sessions</h1>
    <p class="page-subtitle">Live view of all signer sessions — status, tokens, and activity</p>
  </div>
  <button class="btn btn-ghost" onclick="signing_init()">${icon('refresh')} Refresh</button>
</div>
<div id="live-signing-stats" class="stats-grid" style="margin-bottom:1rem"></div>
<div id="live-signing-sessions"></div>
`);

async function signing_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/signing-sessions/');
    const rows = data.results || data;
    const stats = document.getElementById('live-signing-stats');
    if (stats) {
      const counts = {pending: 0, in_progress: 0, completed: 0, expired: 0};
      rows.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; });
      stats.innerHTML = [
        ['Total Sessions', rows.length],
        ['Pending', counts.pending],
        ['In Progress', counts.in_progress],
        ['Completed', counts.completed],
      ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
    }
    const list = document.getElementById('live-signing-sessions');
    if (list) {
      list.innerHTML = liveTable(['Session', 'Envelope', 'Recipient', 'Status', 'Started', 'Actions'], rows.map(session => `
        <tr>
          <td><div style="font-weight:600">SES-${session.id}</div><div style="font-size:0.75rem;color:var(--text-muted)">${session.token ? session.token.slice(0, 12) + '…' : '—'}</div></td>
          <td>${session.envelope ? `<a href="#" onclick="openLiveEnvelopeDrawer(${session.envelope});return false">ENV-${session.envelope}</a>` : '—'}</td>
          <td>${escapeHtml(session.recipient_name || session.recipient || '—')}</td>
          <td>${liveBadge(session.status)}</td>
          <td>${apiDate(session.created_at)}</td>
          <td>${session.token && ['pending','in_progress'].includes(session.status) ? `<button class="btn btn-primary btn-sm" onclick="openPublicSigningToken('${session.token}')">${icon('edit')} Open Signer</button>` : `<span style="font-size:0.75rem;color:var(--text-muted)">${titleCaseStatus(session.status)}</span>`}</td>
        </tr>
      `), 'No signing sessions found');
    }
  } catch (error) {
    showToast(`Signing sessions API error: ${error.message}`, 'error');
  }
}

registerPage('public-signing', ({token} = {}) => `
<div class="page-header">
  <div>
    <h1 class="page-title">Secure Signing Link</h1>
    <p class="page-subtitle">Review consent, apply signature, and submit through the public signer API</p>
  </div>
</div>
<div class="card" style="max-width:760px;margin:0 auto">
  <div class="card-body" id="public-signing-body" style="padding:1.5rem">
    <div class="form-group">
      <label class="form-label">Signing token</label>
      <input id="public-sign-token" class="form-input" value="${token || new URLSearchParams(location.search).get('token') || ''}" placeholder="Paste token from email link">
    </div>
    <button class="btn btn-primary" onclick="loadPublicSigningSession()">${icon('eye')} Open Signing Session</button>
  </div>
</div>
`);

function renderSignerField(field, existingValue = '') {
  const value = existingValue || field.value || '';
  if (field.field_type === 'signature') {
    return `<div class="form-group">
      <label class="form-label">${escapeHtml(field.label)} ${field.required ? '*' : ''}</label>
      <input class="form-input public-field-input" data-field-key="${escapeHtml(field.field_key || field.label)}" data-field-type="signature" value="${escapeHtml(value)}" placeholder="Type your full legal name">
    </div>`;
  }
  if (field.field_type === 'checkbox') {
    return `<label style="display:flex;gap:0.5rem;align-items:center;margin-bottom:0.75rem">
      <input class="public-field-input" data-field-key="${escapeHtml(field.field_key || field.label)}" data-field-type="checkbox" type="checkbox" ${value === 'true' ? 'checked' : ''}>
      ${escapeHtml(field.label)} ${field.required ? '*' : ''}
    </label>`;
  }
  return `<div class="form-group">
    <label class="form-label">${escapeHtml(field.label)} ${field.required ? '*' : ''}</label>
    <input class="form-input public-field-input" data-field-key="${escapeHtml(field.field_key || field.label)}" data-field-type="${escapeHtml(field.field_type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.label)}">
  </div>`;
}

function signerPageCount(fields, documents) {
  const fieldPages = fields.map(field => Number(field.page || 1));
  const documentPages = documents.map(link => Number(link.document_detail?.page_count || 0));
  return Math.max(1, ...fieldPages, ...documentPages);
}

function signerDocumentPageHeight(documents, pageNumber) {
  const pageMeta = documents
    .map(link => link.document_detail?.pages || [])
    .flat()
    .find(page => Number(page.page_number || 1) === pageNumber);
  if (!pageMeta) return 0;
  const width = Number(pageMeta.width || HANMAK_CANONICAL_PAGE_WIDTH) || HANMAK_CANONICAL_PAGE_WIDTH;
  const height = Number(pageMeta.height || 0) || 0;
  return height ? Math.max(1, Math.round(height * (HANMAK_CANONICAL_PAGE_WIDTH / width))) : 0;
}

function signerPageHeight(fields, pageNumber, documents = []) {
  const pageFields = fields.filter(field => Number(field.page || 1) === pageNumber);
  // Scale each field's stored page_height by the same ratio used in signerFieldGeometry
  // (HANMAK_CANONICAL_PAGE_WIDTH / page_width) so the page container height matches
  // the proportionally-scaled field positions.
  const fieldPageHeights = pageFields
    .map(field => {
      const pw = Number(field.page_width || HANMAK_CANONICAL_PAGE_WIDTH) || HANMAK_CANONICAL_PAGE_WIDTH;
      const ph = Number(field.page_height || 0);
      return ph ? Math.round(ph * HANMAK_CANONICAL_PAGE_WIDTH / pw) : 0;
    })
    .filter(Boolean);
  const documentHeight = signerDocumentPageHeight(documents, pageNumber);
  const baseHeight = documentHeight || (fieldPageHeights.length ? Math.max(...fieldPageHeights) : HANMAK_DEFAULT_PAGE_HEIGHT);
  const maxFieldBottom = pageFields.reduce((max, field) => {
    const geometry = signerFieldGeometry(field);
    return Math.max(max, geometry.top + geometry.height + 96);
  }, 0);
  return Math.max(baseHeight, maxFieldBottom);
}

function dedupeFieldsByPlacement(fields) {
  const seen = new Set();
  return (fields || []).filter(field => {
    const key = [
      field.field_key || field.label || field.id,
      field.page || 1,
      Math.round(Number(field.x || 0)),
      Math.round(Number(field.y || 0)),
      Math.round(Number(field.width || 0)),
      Math.round(Number(field.height || 0)),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function signingRoleSummary(recipient, fields) {
  const requiredCount = fields.filter(field => field.required !== false).length;
  const signatureCount = fields.filter(field => ['signature', 'initials'].includes(field.field_type)).length;
  return `<div class="card" style="padding:0.85rem;margin-bottom:1rem;background:#f8fafc;border-color:#dbeafe">
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center">
      <div>
        <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:800">Assigned signing task</div>
        <div style="font-weight:800;color:#0f172a">${escapeHtml(recipient.name || 'Current recipient')}</div>
        <div style="font-size:0.78rem;color:#64748b">${escapeHtml(recipient.email || '')} · ${titleCaseStatus(recipient.role || 'signer')}</div>
      </div>
      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end">
        <span class="badge badge-warning">${requiredCount} required</span>
        <span class="badge">${fields.length} field${fields.length === 1 ? '' : 's'}</span>
        <span class="badge badge-success">${signatureCount} signing</span>
      </div>
    </div>
  </div>`;
}

function existingValuesFromFieldValues(fieldValues = []) {
  const values = {};
  (fieldValues || []).forEach(item => {
    values[item.field_key] = item.attachment_url
      ? {value: item.value, filename: item.metadata?.filename || item.value, url: item.attachment_url}
      : {value: item.value, metadata: item.metadata || {}};
  });
  return values;
}

function renderEnvelopeReviewDocument(envelope) {
  const fields = dedupeFieldsByPlacement(envelope.fields || []);
  if (!fields.length) return '<div class="empty-state"><div class="empty-state-title">No form fields on this envelope</div></div>';
  const existingValues = existingValuesFromFieldValues(envelope.field_values || []);
  return renderSignerDocumentCanvas({
    documents: envelope.documents || [],
    envelope_detail: envelope,
  }, fields, existingValues, true);
}

function normalizeSignerOptions(field) {
  if (Array.isArray(field.options)) return field.options.map(option => String(option)).filter(Boolean);
  if (typeof field.options === 'string') {
    return field.options.split(/\r?\n|,/).map(option => option.trim()).filter(Boolean);
  }
  return [];
}

function normalizeSignatureMethods(field) {
  const configured = normalizeSignerOptions(field)
    .map(method => String(method).toLowerCase())
    .filter(method => ['type', 'draw', 'upload'].includes(method));
  return configured.length ? configured : ['type', 'draw', 'upload'];
}

function signerFieldGeometry(field) {
  const pageWidth = Number(field.page_width || HANMAK_CANONICAL_PAGE_WIDTH) || HANMAK_CANONICAL_PAGE_WIDTH;
  const pageHeight = Number(field.page_height || HANMAK_DEFAULT_PAGE_HEIGHT) || HANMAK_DEFAULT_PAGE_HEIGHT;
  // Scale both axes by the width ratio so the rendered page stays proportional.
  // The signer page container height is also derived by the same width ratio
  // (HANMAK_CANONICAL_PAGE_WIDTH / pageWidth * pageHeight), keeping field
  // fractions consistent across both axes.
  const scaleX = HANMAK_CANONICAL_PAGE_WIDTH / pageWidth;
  const scaleY = HANMAK_CANONICAL_PAGE_WIDTH / pageWidth;
  const renderedPageHeight = Math.round(pageHeight * scaleY);
  const width = Math.max(56, Math.round(Number(field.width || 160) * scaleX));
  const height = Math.max(24, Math.round(Number(field.height || 32) * scaleY));
  return {
    left: Math.max(0, Math.min(Math.round(Number(field.x || 0) * scaleX), Math.max(0, HANMAK_CANONICAL_PAGE_WIDTH - width))),
    top: Math.max(0, Math.min(Math.round(Number(field.y || 0) * scaleY), Math.max(0, renderedPageHeight - height))),
    width,
    height,
  };
}

function renderSignerValueDisplay(field, value) {
  if (value && typeof value === 'object' && !value.url) value = value.value;
  if (field.field_type === 'attachment') {
    if (value && typeof value === 'object') return value.filename || value.value || 'Attached file';
    return value || '';
  }
  if (field.field_type === 'checkbox') return String(value).toLowerCase() === 'true' ? 'Checked' : '';
  if (field.field_type === 'signature' && String(value || '').startsWith('data:image/')) return 'Drawn signature';
  return value || '';
}

function renderSignedImageValue(value, height) {
  if (value && typeof value === 'object') value = value.value;
  if (!String(value || '').startsWith('data:image/')) return '';
  return `<img src="${escapeHtml(value)}" alt="Signature" style="max-width:100%;max-height:${Math.max(24, height - 4)}px;display:block;object-fit:contain">`;
}

function publicValueText(value) {
  if (value && typeof value === 'object') return value.value || '';
  return value || '';
}

function publicValueMetadata(value) {
  return value && typeof value === 'object' && value.metadata ? value.metadata : {};
}

function publicFieldFontSize(field, height, readonly = false) {
  if (field.field_type === 'signature') return Math.max(24, Math.min(42, Math.round(height * 0.48)));
  if (field.field_type === 'initials') return Math.max(20, Math.min(34, Math.round(height * 0.46)));
  if (field.field_type === 'checkbox') return Math.max(14, Math.min(20, Math.round(height * 0.42)));
  return Math.max(readonly ? 13 : 14, Math.min(22, Math.round(height * 0.36)));
}

function publicSignatureStyleCss(style = {}, height = 64) {
  const familyMap = {
    script: "'Dancing Script', cursive",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "'DM Sans', Arial, sans-serif",
    mono: "'JetBrains Mono', monospace",
  };
  const family = familyMap[style.family] || familyMap.script;
  const color = /^#[0-9a-f]{6}$/i.test(style.color || '') ? style.color : '#1e40af';
  const weight = style.weight === 'bold' ? '700' : '600';
  const italic = style.italic ? 'italic' : 'normal';
  const size = Number(style.size || 0) || publicFieldFontSize({field_type: 'signature'}, height, true);
  return `font-family:${family};font-size:${Math.max(18, Math.min(48, size))}px;color:${color};font-weight:${weight};font-style:${italic};`;
}

function renderSignerOverlayField(field, existingValue = '', readonly = false) {
  const value = existingValue || field.value || '';
  const textValue = publicValueText(value);
  const metadata = publicValueMetadata(value);
  const key = escapeHtml(field.field_key || field.label);
  const label = escapeHtml(field.label || 'Field');
  const required = field.required !== false ? '1' : '';
  const geometry = signerFieldGeometry(field);
  const left = geometry.left;
  const top = geometry.top;
  const width = geometry.width;
  const height = geometry.height;
  const baseStyle = `position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;z-index:5;`;
  const baseFontSize = publicFieldFontSize(field, height, readonly);
  const inputStyle = `width:100%;height:100%;box-sizing:border-box;border:1.5px solid var(--accent);background:rgba(255,255,255,0.96);border-radius:4px;font-size:${baseFontSize}px;padding:4px 8px;box-shadow:0 2px 8px rgba(15,23,42,0.08);`;
  const labelHtml = `<div style="position:absolute;left:0;top:-18px;font-size:10px;font-weight:700;color:var(--accent);white-space:nowrap">${label}${field.required ? ' *' : ''}</div>`;

  if (readonly) {
    const displayValue = renderSignerValueDisplay(field, value);
    if (!displayValue) return '';
    if (field.field_type === 'attachment') {
      const attachmentUrl = value && typeof value === 'object' ? value.url : '';
      return `<div style="${baseStyle}display:flex;align-items:center;box-sizing:border-box;padding:0 2px;background:transparent;border:none;box-shadow:none;font-size:12px;color:#0f172a;">
        ${attachmentUrl ? `<a href="${escapeHtml(attachmentUrl)}" target="_blank" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon('file', 12)} ${escapeHtml(displayValue)}</a>` : `${icon('file', 12)} ${escapeHtml(displayValue)}`}
      </div>`;
    }
    if (field.field_type === 'checkbox') {
      return `<div style="${baseStyle}display:flex;align-items:center;box-sizing:border-box;padding:0 2px;background:transparent;border:none;box-shadow:none;font-size:16px;color:#0f172a;">
        ${String(value).toLowerCase() === 'true' ? '✓' : ''}
      </div>`;
    }
    if (field.field_type === 'signature' && String(textValue || '').startsWith('data:image/')) {
      return `<div style="${baseStyle}display:flex;align-items:center;box-sizing:border-box;padding:0;background:transparent;border:none;box-shadow:none;">
        ${renderSignedImageValue(textValue, height)}
      </div>`;
    }
    const signatureStyle = ['signature', 'initials'].includes(field.field_type)
      ? publicSignatureStyleCss(metadata.signature_style || {}, height)
      : `font-size:${baseFontSize}px;color:#0f172a;`;
    return `<div style="${baseStyle}display:flex;align-items:center;box-sizing:border-box;padding:0 2px;background:transparent;border:none;box-shadow:none;${signatureStyle}">
      ${escapeHtml(displayValue)}
    </div>`;
  }

  if (field.field_type === 'signature') {
    const display = textValue ? renderSignerValueDisplay(field, value) : 'Click to sign';
    const methods = normalizeSignatureMethods(field).join(',');
    const signatureStyle = publicSignatureStyleCss(metadata.signature_style || {}, height);
    const signatureStyleJson = escapeHtml(JSON.stringify(metadata.signature_style || {}));
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input type="hidden" class="public-field-input" data-field-key="${key}" data-field-type="signature" data-required="${required}" data-label="${label}" data-signature-style="${signatureStyleJson}" value="${escapeHtml(textValue)}">
      <button type="button" class="public-signature-trigger" data-field-key="${key}" data-methods="${escapeHtml(methods)}" onclick="openPublicSignatureModal('${key}', '${label}')" style="${inputStyle}${signatureStyle}text-align:left;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${String(textValue || '').startsWith('data:image/') ? renderSignedImageValue(textValue, height) : escapeHtml(display)}</button>
    </div>`;
  }
  if (field.field_type === 'initials') {
    const signatureStyle = publicSignatureStyleCss(metadata.signature_style || {}, height);
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input class="public-field-input" data-field-key="${key}" data-field-type="initials" data-required="${required}" data-label="${label}" value="${escapeHtml(textValue)}" placeholder="Initials" style="${inputStyle}${signatureStyle}text-align:center;">
    </div>`;
  }
  if (field.field_type === 'checkbox') {
    return `<label style="${baseStyle}display:flex;align-items:center;gap:6px;padding:4px 7px;box-sizing:border-box;border:1.5px solid var(--accent);background:rgba(255,255,255,0.96);border-radius:4px;font-size:11px;font-weight:600;color:var(--text-primary);box-shadow:0 2px 8px rgba(15,23,42,0.08);">
      <input class="public-field-input" data-field-key="${key}" data-field-type="checkbox" data-required="${required}" data-label="${label}" type="checkbox" ${value === 'true' ? 'checked' : ''}>
      <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}${field.required ? ' *' : ''}</span>
    </label>`;
  }
  if (field.field_type === 'date') {
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input type="date" class="public-field-input" data-field-key="${key}" data-field-type="date" data-required="${required}" data-label="${label}" value="${escapeHtml(textValue)}" style="${inputStyle}">
    </div>`;
  }
  if (field.field_type === 'email') {
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input type="email" class="public-field-input" data-field-key="${key}" data-field-type="email" data-required="${required}" data-label="${label}" value="${escapeHtml(textValue)}" placeholder="${label}" style="${inputStyle}">
    </div>`;
  }
  if (field.field_type === 'number') {
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input type="number" class="public-field-input" data-field-key="${key}" data-field-type="number" data-required="${required}" data-label="${label}" value="${escapeHtml(textValue)}" placeholder="${label}" style="${inputStyle}">
    </div>`;
  }
  if (field.field_type === 'select') {
    const options = normalizeSignerOptions(field);
    return `<div style="${baseStyle}">
      ${labelHtml}
      <select class="public-field-input" data-field-key="${key}" data-field-type="select" data-required="${required}" data-label="${label}" style="${inputStyle}">
        <option value="">Select...</option>
        ${(options.length ? options : ['Yes', 'No']).map(option => `<option value="${escapeHtml(String(option))}" ${String(option) === textValue ? 'selected' : ''}>${escapeHtml(String(option))}</option>`).join('')}
      </select>
    </div>`;
  }
  if (field.field_type === 'attachment') {
    const display = value && typeof value === 'object' ? value.filename : value;
    return `<div style="${baseStyle}">
      ${labelHtml}
      <input type="file" class="public-field-input" data-field-key="${key}" data-field-type="attachment" data-required="${required}" data-label="${label}" style="${inputStyle}padding:7px">
      ${display ? `<div style="position:absolute;left:0;top:${height + 4}px;font-size:10px;color:var(--text-muted);max-width:${width}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${icon('file', 10)} ${escapeHtml(display)}</div>` : ''}
    </div>`;
  }
  return `<div style="${baseStyle}">
    ${labelHtml}
    <input class="public-field-input" data-field-key="${key}" data-field-type="${escapeHtml(field.field_type || 'text')}" data-required="${required}" data-label="${label}" value="${escapeHtml(textValue)}" placeholder="${label}" style="${inputStyle}">
  </div>`;
}

function openPublicSignatureModal(fieldKey, label) {
  const input = document.querySelector(`.public-field-input[data-field-key="${CSS.escape(fieldKey)}"]`);
  const trigger = document.querySelector(`.public-signature-trigger[data-field-key="${CSS.escape(fieldKey)}"]`);
  const current = input?.value || '';
  let currentStyle = {};
  try {
    currentStyle = JSON.parse(input?.dataset.signatureStyle || '{}') || {};
  } catch (_) {
    currentStyle = {};
  }
  const methods = (trigger?.dataset.methods || 'type,draw,upload').split(',').filter(Boolean);
  const firstMethod = methods[0] || 'type';
  const tab = (method, title) => methods.includes(method)
    ? `<button class="tab ${method === firstMethod ? 'active' : ''}" onclick="switchPublicSignatureMode('${method}', this)">${title}</button>`
    : '';
  const panelDisplay = method => method === firstMethod ? '' : 'display:none';
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Apply Signature</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="tabs" style="margin-bottom:1rem">
        ${tab('type', 'Type')}
        ${tab('draw', 'Draw')}
        ${tab('upload', 'Upload')}
      </div>
      ${methods.includes('type') ? `<div id="sig-mode-type" class="public-sig-mode" style="${panelDisplay('type')}">
        <div class="form-group"><label class="form-label">${escapeHtml(label)}</label><input id="public-typed-signature" class="form-input" value="${current.startsWith('data:image/') ? '' : escapeHtml(current)}" placeholder="Type your full legal name" style="${publicSignatureStyleCss(currentStyle, 88)}font-size:32px"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group">
            <label class="form-label">Style</label>
            <select id="public-signature-family" class="form-input" onchange="previewPublicTypedSignatureStyle()">
              <option value="script" ${currentStyle.family === 'script' || !currentStyle.family ? 'selected' : ''}>Script</option>
              <option value="serif" ${currentStyle.family === 'serif' ? 'selected' : ''}>Serif</option>
              <option value="sans" ${currentStyle.family === 'sans' ? 'selected' : ''}>Sans</option>
              <option value="mono" ${currentStyle.family === 'mono' ? 'selected' : ''}>Mono</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Color</label>
            <input id="public-signature-color" class="form-input" type="color" value="${escapeHtml(currentStyle.color || '#1e40af')}" onchange="previewPublicTypedSignatureStyle()">
          </div>
          <div class="form-group">
            <label class="form-label">Size</label>
            <input id="public-signature-size" class="form-input" type="number" min="18" max="48" value="${Number(currentStyle.size || 32)}" oninput="previewPublicTypedSignatureStyle()">
          </div>
          <div style="display:flex;align-items:center;gap:1rem;font-size:0.85rem;color:var(--text-secondary);padding-top:1.45rem">
            <label style="display:flex;align-items:center;gap:0.5rem"><input id="public-signature-italic" type="checkbox" ${currentStyle.italic ? 'checked' : ''} onchange="previewPublicTypedSignatureStyle()"> Italic</label>
            <label style="display:flex;align-items:center;gap:0.5rem"><input id="public-signature-bold" type="checkbox" ${currentStyle.weight === 'bold' ? 'checked' : ''} onchange="previewPublicTypedSignatureStyle()"> Bold</label>
          </div>
        </div>
      </div>` : ''}
      ${methods.includes('draw') ? `<div id="sig-mode-draw" class="public-sig-mode" style="${panelDisplay('draw')}">
        <canvas id="public-signature-canvas" width="520" height="180" style="width:100%;height:180px;border:1px solid var(--border);border-radius:7px;background:white;touch-action:none"></canvas>
        <button class="btn btn-ghost btn-sm" style="margin-top:0.5rem" onclick="clearPublicSignatureCanvas()">Clear</button>
      </div>` : ''}
      ${methods.includes('upload') ? `<div id="sig-mode-upload" class="public-sig-mode" style="${panelDisplay('upload')}">
        <input id="public-signature-upload" class="form-input" type="file" accept="image/png,image/jpeg,image/webp">
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="savePublicSignatureValue('${fieldKey}')">${icon('check')} Apply</button>
    </div>
  `);
  if (methods.includes('draw')) setTimeout(initPublicSignatureCanvas, 50);
  if (methods.includes('type')) setTimeout(previewPublicTypedSignatureStyle, 20);
}

function currentPublicTypedSignatureStyle() {
  return {
    family: document.getElementById('public-signature-family')?.value || 'script',
    color: document.getElementById('public-signature-color')?.value || '#1e40af',
    size: Number(document.getElementById('public-signature-size')?.value || 32),
    italic: Boolean(document.getElementById('public-signature-italic')?.checked),
    weight: document.getElementById('public-signature-bold')?.checked ? 'bold' : 'normal',
  };
}

function previewPublicTypedSignatureStyle() {
  const input = document.getElementById('public-typed-signature');
  if (!input) return;
  const style = currentPublicTypedSignatureStyle();
  const familyMap = {
    script: "'Dancing Script', cursive",
    serif: "Georgia, 'Times New Roman', serif",
    sans: "'DM Sans', Arial, sans-serif",
    mono: "'JetBrains Mono', monospace",
  };
  input.style.fontFamily = familyMap[style.family] || familyMap.script;
  input.style.color = style.color;
  input.style.fontSize = `${Math.max(18, Math.min(48, Number(style.size || 32)))}px`;
  input.style.fontStyle = style.italic ? 'italic' : 'normal';
  input.style.fontWeight = style.weight === 'bold' ? '700' : '600';
}

function switchPublicSignatureMode(mode, button) {
  document.querySelectorAll('.public-sig-mode').forEach(panel => panel.style.display = 'none');
  document.getElementById(`sig-mode-${mode}`).style.display = 'block';
  document.querySelectorAll('#active-modal .tab').forEach(tab => tab.classList.remove('active'));
  button.classList.add('active');
}

function initPublicSignatureCanvas() {
  const canvas = document.getElementById('public-signature-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1e40af';
  let drawing = false;
  const point = event => {
    const rect = canvas.getBoundingClientRect();
    const source = event.touches?.[0] || event;
    return {x: (source.clientX - rect.left) * (canvas.width / rect.width), y: (source.clientY - rect.top) * (canvas.height / rect.height)};
  };
  const start = event => { event.preventDefault(); drawing = true; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = event => { if (!drawing) return; event.preventDefault(); const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing = false; };
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, {passive:false});
  canvas.addEventListener('touchmove', move, {passive:false});
  canvas.addEventListener('touchend', end);
}

function clearPublicSignatureCanvas() {
  const canvas = document.getElementById('public-signature-canvas');
  if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

async function savePublicSignatureValue(fieldKey) {
  const activeMode = document.querySelector('#active-modal .tab.active')?.textContent?.trim().toLowerCase() || 'type';
  let value = '';
  let signatureStyle = {};
  if (activeMode === 'type') {
    value = document.getElementById('public-typed-signature')?.value.trim() || '';
    signatureStyle = currentPublicTypedSignatureStyle();
  } else if (activeMode === 'draw') {
    const canvas = document.getElementById('public-signature-canvas');
    value = canvas ? canvas.toDataURL('image/png') : '';
  } else {
    const file = document.getElementById('public-signature-upload')?.files?.[0];
    if (file) value = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(file); });
  }
  if (!value) return showToast('Add a signature first', 'error');
  const input = document.querySelector(`.public-field-input[data-field-key="${CSS.escape(fieldKey)}"]`);
  const trigger = document.querySelector(`.public-signature-trigger[data-field-key="${CSS.escape(fieldKey)}"]`);
  if (input) {
    input.value = value;
    input.dataset.signatureStyle = JSON.stringify(signatureStyle);
  }
  if (trigger) {
    trigger.innerHTML = value.startsWith('data:image/')
      ? renderSignedImageValue(value, Number.parseFloat(trigger.style.height || '64') || 64)
      : escapeHtml(value);
    trigger.style.borderColor = 'transparent';
    trigger.style.boxShadow = 'none';
    trigger.style.background = 'transparent';
    if (!value.startsWith('data:image/')) trigger.style.cssText += publicSignatureStyleCss(signatureStyle, Number.parseFloat(trigger.style.height || '88') || 88);
  }
  closeModal();
}

function validatePublicRequiredFields() {
  const missing = [];
  document.querySelectorAll('.public-field-input[data-required="1"]').forEach(input => {
    const label = input.dataset.label || input.dataset.fieldKey || 'Required field';
    const value = publicFieldInputValue(input);
    if (!publicFieldValueIsComplete(input, value)) {
      missing.push(label);
      input.style.borderColor = 'var(--danger)';
      input.style.boxShadow = '0 0 0 3px rgba(239,68,68,0.16)';
    } else {
      input.style.borderColor = 'transparent';
      input.style.boxShadow = 'none';
      input.style.background = 'transparent';
    }
  });
  if (missing.length) {
    showToast(`Complete required field(s): ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '...' : ''}`, 'error', 7000);
    return false;
  }
  return true;
}

function publicFieldInputValue(input) {
  if (!input) return '';
  if (input.type === 'file') return input.files?.[0]?.name || '';
  if (input.type === 'checkbox') return input.checked ? 'true' : 'false';
  if (input.tagName === 'SELECT') return input.value || '';
  return String(input.value ?? '').trim();
}

function publicFieldValueIsComplete(input, value = publicFieldInputValue(input)) {
  if (input?.type === 'checkbox') return value === 'true';
  return Boolean(String(value ?? '').trim());
}

function setPublicInputCompletionStyle(input) {
  if (!input || input.type === 'hidden') return;
  if (publicFieldValueIsComplete(input)) {
    input.style.borderColor = 'transparent';
    input.style.boxShadow = 'none';
    input.style.background = 'transparent';
  }
}

function syncPublicFilledFieldStyles() {
  document.querySelectorAll('.public-field-input').forEach(setPublicInputCompletionStyle);
}

document.addEventListener('input', event => {
  if (event.target?.classList?.contains('public-field-input')) setPublicInputCompletionStyle(event.target);
});
document.addEventListener('change', event => {
  if (event.target?.classList?.contains('public-field-input')) setPublicInputCompletionStyle(event.target);
});

function collectPublicFieldValues() {
  const byKey = new Map();
  [...document.querySelectorAll('.public-field-input')].forEach(input => {
    const fieldKey = input.dataset.fieldKey || input.name || input.id || '';
    if (!fieldKey) return;
    const value = publicFieldInputValue(input);
    const item = {
      field_key: fieldKey,
      value,
      file: input.type === 'file' ? input.files?.[0] || null : null,
      metadata: {
        field_type: input.dataset.fieldType || input.type || 'text',
        label: input.dataset.label || fieldKey,
      },
      complete: publicFieldValueIsComplete(input, value),
      signing: ['signature', 'initials'].includes(input.dataset.fieldType || ''),
    };
    if (input.dataset.signatureStyle) {
      try {
        item.metadata.signature_style = JSON.parse(input.dataset.signatureStyle);
      } catch (_) {
        item.metadata.signature_style = {};
      }
    }
    const existing = byKey.get(fieldKey);
    if (!existing || (!existing.complete && item.complete) || (item.complete && item.signing)) {
      byKey.set(fieldKey, item);
    }
  });
  return [...byKey.values()];
}

function resizePublicSigningCanvases() {
  document.querySelectorAll('.public-signing-viewport').forEach(viewport => {
    const shell = viewport.querySelector('.public-signing-scale-shell');
    const pages = viewport.querySelector('.public-signing-pages');
    if (!shell || !pages) return;
    const style = window.getComputedStyle(viewport);
    const horizontalPadding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
    const available = Math.max(280, viewport.clientWidth - horizontalPadding);
    const scale = Math.min(1, available / HANMAK_CANONICAL_PAGE_WIDTH);
    pages.style.transform = `scale(${scale})`;
    pages.style.transformOrigin = 'top left';
    pages.style.width = `${HANMAK_CANONICAL_PAGE_WIDTH}px`;
    shell.style.width = `${Math.round(HANMAK_CANONICAL_PAGE_WIDTH * scale)}px`;
    shell.style.height = `${Math.round(pages.scrollHeight * scale)}px`;
  });
}

function schedulePublicSigningCanvasResize() {
  requestAnimationFrame(() => {
    resizePublicSigningCanvases();
    setTimeout(resizePublicSigningCanvases, 80);
  });
  if (!publicSigningResizeHandlerAttached) {
    window.addEventListener('resize', resizePublicSigningCanvases);
    publicSigningResizeHandlerAttached = true;
  }
}

function firstTypedSignatureValue(fieldValues) {
  const signingValue = fieldValues.find(item => item.signing && String(item.value || '').trim());
  if (signingValue) return String(signingValue.value).trim();
  const typedFallback = fieldValues.find(item => item.field_key === 'typed_signature' && String(item.value || '').trim());
  return typedFallback ? String(typedFallback.value).trim() : '';
}

function renderSignerDocumentCanvas(session, fields, existingValues, readonly = false, editableFieldKeys = null) {
  const documents = session.documents || [];
  const pageCount = signerPageCount(fields, documents);
  const pages = Array.from({length: pageCount}, (_, index) => index + 1);
  const primaryDocument = documents[0]?.document_detail || {};
  const docTitle = primaryDocument.title || session.envelope_detail?.name || 'Document';
  const fileUrl = primaryDocument.file_url || '';
  const pdfUrl = fileUrl && (fileUrl.toLowerCase().includes('.pdf') || primaryDocument.mime_type === 'application/pdf') ? fileUrl : '';
  return `
    <div class="public-signing-viewport" style="background:#dbe3ef;margin:1rem -1.5rem;padding:1.5rem;overflow-x:hidden;overflow-y:visible;border-top:1px solid var(--border);border-bottom:1px solid var(--border)">
      <div class="public-signing-scale-shell" style="width:${HANMAK_CANONICAL_PAGE_WIDTH}px;margin:0 auto;position:relative;">
      <div class="public-signing-pages" style="width:${HANMAK_CANONICAL_PAGE_WIDTH}px;max-width:${HANMAK_CANONICAL_PAGE_WIDTH}px;display:flex;flex-direction:column;gap:1.25rem;transform-origin:top left;">
        ${pages.map(pageNumber => {
          const pageFields = fields.filter(field => Number(field.page || 1) === pageNumber);
          const height = signerPageHeight(fields, pageNumber, documents);
          return `<div class="public-signing-page" data-page="${pageNumber}" data-pdf-url="${escapeHtml(pdfUrl)}" style="position:relative;width:${HANMAK_CANONICAL_PAGE_WIDTH}px;height:${height}px;background:white;box-shadow:0 4px 24px rgba(15,23,42,0.16);border-radius:2px;overflow:visible">
            <div style="position:absolute;left:0;top:-18px;font-size:11px;color:#64748b;font-weight:700">Page ${pageNumber}</div>
            ${pdfUrl ? `<div class="public-page-render-status" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#64748b;font-size:12px;pointer-events:none">Rendering ${escapeHtml(docTitle)} page ${pageNumber} as PNG...</div>` : `<div style="padding:58px 64px;color:#334155;font-family:Georgia,serif;font-size:12px;line-height:1.8;pointer-events:none">
              <div style="text-align:center;margin-bottom:32px">
                <div style="font-size:17px;font-weight:800;color:#1e293b;text-transform:uppercase">${escapeHtml(docTitle)}</div>
                <div style="font-size:11px;color:#64748b">HanMak signing document preview</div>
              </div>
              <p><strong>Review.</strong> Please review the document and complete each highlighted field placed by the template builder.</p>
              <p><strong>Agreement.</strong> The fields shown on this page are positioned from the saved template coordinates and will be captured in the evidence record after submission.</p>
              <p><strong>Consent.</strong> By submitting, the signer accepts the electronic signature disclosure and confirms the entered values.</p>
            </div>`}
            ${pageFields.map(field => {
              const fieldKey = field.field_key || field.label;
              const fieldReadonly = readonly || (editableFieldKeys instanceof Set && !editableFieldKeys.has(fieldKey));
              return renderSignerOverlayField(field, existingValues[field.field_key], fieldReadonly);
            }).join('')}
          </div>`;
        }).join('')}
      </div>
      </div>
    </div>`;
}

function renderCompletedSigningSession(session, fields, existingValues) {
  const envelope = session.envelope_detail || {};
  const recipient = session.recipient_detail || {};
  const completedAt = envelope.completed_at || session.submitted_at || recipient.signed_at;
  return `
    <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem">
      <div>
        <div style="font-size:1.15rem;font-weight:800">${escapeHtml(envelope.name || `Envelope #${session.envelope}`)}</div>
        <div style="font-size:0.8125rem;color:var(--text-muted)">${escapeHtml(recipient.name || `Recipient #${session.recipient}`)} · ${escapeHtml(recipient.email || '')}</div>
      </div>
      ${liveBadge(envelope.status || session.status)}
    </div>
    <div class="card" style="padding:1rem;margin-bottom:1rem;background:#f0fdf4;border-color:#bbf7d0">
      <div style="font-weight:900;color:#166534;margin-bottom:0.35rem">Completed</div>
      <div style="font-size:0.85rem;color:#166534">${escapeHtml(session.readonly_reason || 'This signing task has already been completed.')}</div>
      <div style="font-size:0.78rem;color:#4b5563;margin-top:0.45rem">Submitted ${apiDate(completedAt)}</div>
    </div>
    ${(session.documents || []).length ? `<div class="card" style="padding:1rem;margin-bottom:1rem;background:var(--bg-secondary)">
      <div style="font-weight:700;margin-bottom:0.5rem">Completed Documents</div>
      ${(session.documents || []).map(link => `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid var(--border)"><span>${escapeHtml(link.document_detail?.title || `Document #${link.document}`)}</span>${link.document_detail?.file_url ? `<a class="btn btn-ghost btn-sm" href="${link.document_detail.file_url}" target="_blank">${icon('external-link')} Open Source</a>` : ''}</div>`).join('')}
    </div>` : ''}
    <div style="font-weight:800;margin:1rem 0 0.5rem">Submitted Values</div>
    ${fields.length ? renderSignerDocumentCanvas(session, fields, existingValues, true) : ''}
    ${fields.length ? `<div class="card" style="padding:0.75rem;margin-bottom:1rem">
      ${fields.map(field => {
        const value = existingValues[field.field_key] || '';
        const displayValue = field.field_type === 'checkbox' ? (String(value).toLowerCase() === 'true' ? 'Checked' : 'Not checked') : renderSignerValueDisplay(field, value) || '-';
        const displayHtml = field.field_type === 'attachment' && value?.url
          ? `<a href="${escapeHtml(value.url)}" target="_blank">${icon('external-link')} ${escapeHtml(displayValue)}</a>`
          : `<strong>${escapeHtml(displayValue)}</strong>`;
        return `<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.45rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${escapeHtml(field.label || field.field_key)}</span>${displayHtml}</div>`;
      }).join('')}
    </div>` : '<div class="empty-state"><div class="empty-state-title">No submitted field values</div></div>'}
    <button class="btn btn-primary" onclick="loadPublicSigningSession()">${icon('refresh')} Refresh Status</button>
  `;
}

async function loadPublicPdfEngine() {
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

function publicSigningPageOverlayHeight(pageNode, fallbackHeight = 0) {
  const overlayNodes = [...pageNode.querySelectorAll('.public-field-input')]
    .map(input => input.closest('div[style*="position:absolute"], label[style*="position:absolute"]'))
    .filter(Boolean);
  const maxBottom = overlayNodes.reduce((max, node) => {
    const top = Number.parseFloat(node.style.top || '0') || 0;
    const height = Number.parseFloat(node.style.height || '32') || 32;
    return Math.max(max, top + height + 96);
  }, 0);
  return Math.max(fallbackHeight || HANMAK_DEFAULT_PAGE_HEIGHT, maxBottom);
}

async function renderPublicSigningDocumentPages() {
  const pageNodes = [...document.querySelectorAll('.public-signing-page[data-pdf-url]')].filter(node => node.dataset.pdfUrl);
  if (!pageNodes.length) return;
  try {
    await loadPublicPdfEngine();
    const documents = new Map();
    for (const pageNode of pageNodes) {
      const pdfUrl = pageNode.dataset.pdfUrl;
      if (!documents.has(pdfUrl)) documents.set(pdfUrl, pdfjsLib.getDocument(pdfUrl).promise);
      const pdf = await documents.get(pdfUrl);
      const pageNumber = Math.min(Number(pageNode.dataset.page || 1), pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({scale: 1});
      const scale = HANMAK_CANONICAL_PAGE_WIDTH / baseViewport.width;
      const viewport = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({canvasContext: canvas.getContext('2d'), viewport}).promise;
      const image = document.createElement('img');
      image.alt = `Rendered signing page ${pageNumber}`;
      image.src = canvas.toDataURL('image/png');
      image.style.cssText = `position:absolute;left:0;top:0;width:${HANMAK_CANONICAL_PAGE_WIDTH}px;height:${canvas.height}px;display:block;pointer-events:none;user-select:none;`;
      pageNode.querySelector('.public-page-render-status')?.remove();
      pageNode.prepend(image);
      pageNode.style.height = `${publicSigningPageOverlayHeight(pageNode, canvas.height)}px`;
      schedulePublicSigningCanvasResize();
    }
  } catch (error) {
    document.querySelectorAll('.public-page-render-status').forEach(node => {
      node.textContent = `Could not render PDF as PNG: ${error.message}`;
    });
    showToast(`PDF render failed: ${error.message}`, 'error', 7000);
  } finally {
    schedulePublicSigningCanvasResize();
  }
}

async function loadPublicSigningSession() {
  const token = document.getElementById('public-sign-token').value.trim();
  if (!token) return showToast('Paste a signer token first', 'error');
  try {
    const response = await fetch(`${HANMAK_API_BASE_URL}/sign/${token}/`);
    const session = await response.json();
    if (!response.ok) return showToast(session.detail || 'Signing link failed', 'error');
    const envelope = session.envelope_detail || {};
    const recipient = session.recipient_detail || {};
    const existingValues = existingValuesFromFieldValues(session.field_values || []);
    const signingFields = dedupeFieldsByPlacement(session.fields || []);
    const allFields = dedupeFieldsByPlacement(envelope.fields || session.fields || []);
    const editableFieldKeys = new Set(signingFields.map(field => field.field_key || field.label).filter(Boolean));
    if (session.is_completed || session.status === 'submitted' || envelope.status === 'completed' || recipient.status === 'signed') {
      document.getElementById('public-signing-body').innerHTML = renderCompletedSigningSession(session, allFields, existingValues);
      schedulePublicSigningCanvasResize();
      await renderPublicSigningDocumentPages();
      return;
    }
    const signatureField = signingFields.find(field => field.field_type === 'signature');
    const defaultName = existingValues[signatureField?.field_key] || recipient.name || '';
    document.getElementById('public-signing-body').innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:1rem;margin-bottom:1rem">
        <div>
          <div style="font-size:1.15rem;font-weight:800">${escapeHtml(envelope.name || `Envelope #${session.envelope}`)}</div>
          <div style="font-size:0.8125rem;color:var(--text-muted)">${escapeHtml(recipient.name || `Recipient #${session.recipient}`)} · ${escapeHtml(recipient.email || '')}</div>
        </div>
        ${liveBadge(session.status)}
      </div>
      ${signingRoleSummary(recipient, signingFields)}
      ${(session.documents || []).length ? `<div class="card" style="padding:1rem;margin-bottom:1rem;background:var(--bg-secondary)">
        <div style="font-weight:700;margin-bottom:0.5rem">Documents</div>
        ${(session.documents || []).map(link => `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid var(--border)"><span>${escapeHtml(link.document_detail?.title || `Document #${link.document}`)}</span>${link.document_detail?.file_url ? `<a class="btn btn-ghost btn-sm" href="${link.document_detail.file_url}" target="_blank">${icon('external-link')} Open</a>` : ''}</div>`).join('')}
      </div>` : ''}
      <label style="display:flex;gap:0.5rem;align-items:center;margin-bottom:1rem"><input id="sign-consent" type="checkbox"> I agree to use electronic records and signatures.</label>
      ${allFields.length ? renderSignerDocumentCanvas(session, allFields, existingValues, false, editableFieldKeys) : `<div class="form-group"><label class="form-label">Typed signature</label><input class="form-input public-field-input" data-field-key="typed_signature" data-field-type="signature" value="${escapeHtml(defaultName)}" placeholder="Full legal name"></div>`}
      <div class="flex gap-2" style="justify-content:flex-end">
        <button class="btn btn-ghost" onclick="openPublicDelegateModal('${token}')">${icon('send')} Delegate</button>
        <button class="btn btn-ghost" style="color:var(--danger)" onclick="openPublicDeclineModal('${token}')">${icon('x-circle')} Decline</button>
        <button class="btn btn-primary" onclick="submitPublicSigningSession('${token}')">${icon('check')} Submit Signature</button>
      </div>
    `;
    const firstSignature = document.querySelector('.public-field-input[data-field-type="signature"]');
    if (firstSignature && !firstSignature.value) {
      firstSignature.value = defaultName;
      const trigger = document.querySelector(`.public-signature-trigger[data-field-key="${CSS.escape(firstSignature.dataset.fieldKey || '')}"]`);
      if (trigger && defaultName) trigger.textContent = defaultName;
    }
    syncPublicFilledFieldStyles();
    schedulePublicSigningCanvasResize();
    await renderPublicSigningDocumentPages();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openPublicDelegateModal(token) {
  openModal(`
    <div class="modal">
      <div class="modal-header"><h3 class="modal-title">${icon('send')} Delegate Signing Task</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1rem">Delegation revokes this signing link and emails a new secure link to the delegate.</p>
        <div class="form-group"><label class="form-label">Delegate Name</label><input id="public-delegate-name" class="form-input" placeholder="Full name"></div>
        <div class="form-group"><label class="form-label">Delegate Email</label><input id="public-delegate-email" class="form-input" type="email" placeholder="delegate@example.com"></div>
        <div class="form-group"><label class="form-label">Reason</label><textarea id="public-delegate-reason" class="form-input" rows="2" placeholder="Optional delegation reason"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="delegatePublicSigningSession('${token}')">${icon('send')} Delegate</button>
      </div>
    </div>
  `);
}

async function delegatePublicSigningSession(token) {
  const name = document.getElementById('public-delegate-name')?.value.trim() || '';
  const email = document.getElementById('public-delegate-email')?.value.trim() || '';
  const reason = document.getElementById('public-delegate-reason')?.value.trim() || '';
  if (!name || !email) return showToast('Delegate name and email are required.', 'error');
  try {
    const response = await fetch(`${HANMAK_API_BASE_URL}/sign/${token}/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'delegate', name, email, reason}),
    });
    const data = await response.json();
    if (!response.ok) return showToast(data.detail || 'Delegation failed', 'error', 7000);
    closeModal();
    showToast(`Signing task delegated to ${name}.`, 'success', 7000);
    document.getElementById('public-signing-body').innerHTML = `
      <div class="card" style="padding:1rem;background:#eff6ff;border-color:#bfdbfe">
        <div style="font-weight:900;color:#1d4ed8;margin-bottom:0.35rem">Signing delegated</div>
        <div style="font-size:0.85rem;color:#1e40af">A new signing link was issued to ${escapeHtml(name)} at ${escapeHtml(email)}. This link has been revoked.</div>
      </div>`;
  } catch (error) {
    showToast(`Delegation failed: ${error.message}`, 'error', 7000);
  }
}

function openPublicDeclineModal(token) {
  openModal(`
    <div class="modal">
      <div class="modal-header"><h3 class="modal-title">${icon('x-circle')} Decline Signing</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <p style="font-size:0.875rem;color:var(--text-secondary);margin-bottom:1rem">Declining will close this signing task, mark the envelope as declined, and revoke other open signer links for this envelope.</p>
        <div class="form-group"><label class="form-label">Reason</label><textarea id="public-decline-reason" class="form-input" rows="3" placeholder="I cannot sign because..."></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="declinePublicSigningSession('${token}')">${icon('x-circle')} Decline</button>
      </div>
    </div>
  `);
}

async function declinePublicSigningSession(token) {
  const reason = document.getElementById('public-decline-reason')?.value.trim() || '';
  try {
    const response = await fetch(`${HANMAK_API_BASE_URL}/sign/${token}/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({action: 'decline', reason}),
    });
    const data = await response.json();
    if (!response.ok) return showToast(data.detail || 'Decline failed', 'error', 7000);
    closeModal();
    showToast('Signing task declined', 'success');
    const envelope = data.envelope_detail || {};
    const recipient = data.recipient_detail || {};
    document.getElementById('public-signing-body').innerHTML = `
      <div class="card" style="padding:1rem;background:#fef2f2;border-color:#fecaca">
        <div style="font-weight:900;color:#991b1b;margin-bottom:0.35rem">Signing declined</div>
        <div style="font-size:0.85rem;color:#991b1b">${escapeHtml(recipient.name || 'The signer')} declined ${escapeHtml(envelope.name || `envelope #${data.envelope}`)}.</div>
        ${reason ? `<div style="font-size:0.8125rem;color:#7f1d1d;margin-top:0.75rem;white-space:pre-wrap">${escapeHtml(reason)}</div>` : ''}
      </div>`;
  } catch (error) {
    showToast(`Decline failed: ${error.message}`, 'error', 7000);
  }
}

async function submitPublicSigningSession(token) {
  if (!document.getElementById('sign-consent').checked) return showToast('Consent is required', 'error');
  if (!validatePublicRequiredFields()) return;
  const collectedFields = collectPublicFieldValues();
  const fieldValues = collectedFields.map(({complete, signing, file, ...item}) => item);
  const typedName = firstTypedSignatureValue(collectedFields);
  const signatureType = String(typedName).startsWith('data:image/') ? 'drawn' : 'typed';
  const signatureFieldMeta = collectedFields.find(item => item.signing && String(item.value || '').trim())?.metadata || {};
  const hasRequiredSigningField = [...document.querySelectorAll('.public-field-input[data-required="1"]')]
    .some(input => ['signature', 'initials'].includes(input.dataset.fieldType || ''));
  if (hasRequiredSigningField && !typedName) {
    return showToast('Complete your signature or initials field before submitting.', 'error');
  }
  const payload = {
      consent_text: 'Accepted electronic signature consent.',
      signature: {
        signature_type: signatureType,
        typed_name: signatureType === 'typed' ? (typedName || 'Accepted electronically') : 'Drawn signature',
        metadata: signatureType === 'drawn'
          ? {image_data_url: typedName}
          : {signature_style: signatureFieldMeta.signature_style || {}},
      },
      field_values: fieldValues.length ? fieldValues : [{field_key: 'typed_signature', value: typedName}],
  };
  const attachmentFields = collectedFields.filter(item => item.file);
  const requestOptions = {method: 'POST'};
  if (attachmentFields.length) {
    const formData = new FormData();
    formData.append('payload', JSON.stringify(payload));
    attachmentFields.forEach(item => formData.append(`attachment__${item.field_key}`, item.file));
    requestOptions.body = formData;
  } else {
    requestOptions.headers = {'Content-Type': 'application/json'};
    requestOptions.body = JSON.stringify(payload);
  }
  const response = await fetch(`${HANMAK_API_BASE_URL}/sign/${token}/`, requestOptions);
  const data = await response.json();
  if (!response.ok) return showToast(data.detail || 'Signing failed', 'error');
  showToast('Signature submitted', 'success');
  let evidenceHtml = '';
  if (localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    evidenceHtml = await generateEvidenceAfterSigning(data.envelope);
  }
  const fields = dedupeFieldsByPlacement(data.envelope_detail?.fields || data.fields || []);
  const existingValues = existingValuesFromFieldValues(data.field_values || []);
  document.getElementById('public-signing-body').innerHTML = `
    <div class="card" style="padding:1rem;margin-bottom:1rem;background:#f0fdf4;border-color:#bbf7d0">
      <div style="font-weight:900;color:#166534;margin-bottom:0.35rem">Signed successfully</div>
      <div style="font-size:0.85rem;color:#166534">Envelope ${data.envelope_detail?.status === 'completed' ? 'completed' : 'updated'} for ${escapeHtml(data.recipient_detail?.name || 'the signer')}.</div>
      ${evidenceHtml}
    </div>
    ${renderCompletedSigningSession(data, fields, existingValues)}
  `;
  schedulePublicSigningCanvasResize();
  await renderPublicSigningDocumentPages();
}

async function generateEvidenceAfterSigning(envelopeId) {
  try {
    let bundles = await hanmakApi('/evidence-bundles/');
    let bundle = (bundles.results || bundles).find(item => item.envelope === envelopeId);
    if (!bundle) {
      bundle = await hanmakApi('/evidence-bundles/', {method: 'POST', body: JSON.stringify({envelope: envelopeId})});
    }
    const manifest = await hanmakApi(`/evidence-bundles/${bundle.id}/generate/`, {method: 'POST', body: JSON.stringify({})});
    const pdf = await hanmakApi(`/evidence-bundles/${bundle.id}/generate-signed-pdf/`, {method: 'POST', body: JSON.stringify({})});
    const verification = await verifyEvidenceBundleLive(bundle.id, {silent: true});
    return `<div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:center;flex-wrap:wrap">
      ${manifest.file ? `<a class="btn btn-ghost btn-sm" href="${manifest.file}" target="_blank">${icon('file')} Evidence JSON</a>` : ''}
      ${pdf.signed_pdf ? `<a class="btn btn-primary btn-sm" href="${pdf.signed_pdf}" target="_blank">${icon('download')} Signed PDF</a>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="verifyEvidenceBundleLive(${bundle.id})">${icon(verification.valid ? 'shield-check' : 'alert-circle')} Verify</button>
    </div>`;
  } catch (error) {
    return `<div style="margin-top:1rem;color:var(--warning);font-size:0.8125rem">Signed. Evidence generation needs an admin API connection.</div>`;
  }
}

function public_signing_init() {
  const token = document.getElementById('public-sign-token')?.value.trim();
  if (token) loadPublicSigningSession();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));
}

function liveBadge(value) {
  const status = String(value || '').toLowerCase();
  const color = ['active', 'ready', 'healthy', 'sent', 'completed'].includes(status) ? 'success' :
    ['failed', 'voided', 'released'].includes(status) ? 'danger' :
    ['draft', 'queued', 'running', 'pending'].includes(status) ? 'warning' : 'secondary';
  return `<span class="badge badge-${color}">${titleCaseStatus(value || '-')}</span>`;
}

function liveTable(headers, rows, emptyTitle = 'No live records yet') {
  return `<div class="card">
    <div class="card-body" style="padding:0">
      <table class="table">
        <thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead>
        <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}"><div class="empty-state"><div class="empty-state-title">${emptyTitle}</div></div></td></tr>`}</tbody>
      </table>
    </div>
  </div>`;
}

async function firstOrganizationId() {
  const cached = localStorage.getItem('HANMAK_ORGANIZATION_ID');
  const data = await hanmakApi('/organizations/', {headers: {'X-HanMak-Organization': ''}});
  const organizations = data.results || data;
  const org = organizations.find(item => item.id === Number(cached)) || organizations[0];
  if (!org) throw new Error('Create an organization before adding records');
  localStorage.setItem('HANMAK_ORGANIZATION_ID', org.id);
  if (typeof updateOrganizationChrome === 'function') updateOrganizationChrome(org);
  return org.id;
}

registerPage('templates', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Templates</h1>
    <p class="page-subtitle">Live template library, versions, roles, and activation state</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="templates_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="openCreateTemplateModal()">${icon('plus')} New Template</button>
  </div>
</div>
<div id="live-template-stats" class="stats-grid" style="margin-bottom:1rem"></div>
<div id="live-template-list"></div>
`);

async function templates_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/templates/');
    const rows = data.results || data;
    const stats = document.getElementById('live-template-stats');
    if (stats) {
      stats.innerHTML = [
        ['Templates', rows.length],
        ['Active', rows.filter(row => row.status === 'active').length],
        ['Draft', rows.filter(row => row.status === 'draft').length],
        ['Versions', rows.reduce((sum, row) => sum + (row.versions?.length || 0), 0)],
      ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
    }
    const list = document.getElementById('live-template-list');
    if (list) {
      list.innerHTML = liveTable(['Template', 'Category', 'Status', 'Versions', 'Fields', 'Updated', 'Actions'], rows.map(template => `
        <tr>
          <td><div style="font-weight:700">${escapeHtml(template.name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(template.description || 'No description')}</div></td>
          <td>${escapeHtml(template.category || '-')}</td>
          <td>${liveBadge(template.status)}</td>
          <td>${template.versions?.length || 0}</td>
          <td>${template.fields?.length || 0}</td>
          <td>${apiDate(template.updated_at)}</td>
          <td><div class="flex gap-1">
            <button class="btn btn-ghost btn-sm" onclick="openLiveTemplateDrawer(${template.id})">${icon('eye')} View</button>
            <button class="btn btn-primary btn-sm" onclick="editLiveTemplateInBuilder(${template.id})">${icon('edit')} Builder</button>
            <button class="btn btn-ghost btn-sm" onclick="openCreateEnvelopeModal(${template.id})">${icon('send')} Use</button>
            <button class="btn btn-ghost btn-sm" onclick="openTemplateMetadataModal(${template.id})">${icon('settings')} Details</button>
            <button class="btn btn-ghost btn-sm" onclick="duplicateTemplateLive(${template.id})">${icon('copy')} Copy</button>
            ${template.status === 'archived' ? `<button class="btn btn-ghost btn-sm" onclick="activateTemplateLive(${template.id})">${icon('check')} Activate</button>` : `<button class="btn btn-ghost btn-sm" onclick="archiveTemplateLive(${template.id})">${icon('x-circle')} Archive</button>`}
            ${template.versions?.length ? '' : `<button class="btn btn-success btn-sm" onclick="makeTemplateUsableLive(${template.id})">${icon('check')} Setup</button>`}
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteTemplateLive(${template.id}, '${escapeHtml(template.name).replaceAll("'", "\\'")}')">${icon('trash')} Delete</button>
          </div></td>
        </tr>
      `), 'No templates found');
    }
  } catch (error) {
    showToast(`Templates API error: ${error.message}`, 'error');
  }
}

async function openTemplateMetadataModal(id) {
  try {
    const template = await hanmakApi(`/templates/${id}/`);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Template Details</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input id="template-meta-name" class="form-input" value="${escapeHtml(template.name || '')}"></div>
        <div class="form-group"><label class="form-label">Category</label><input id="template-meta-category" class="form-input" value="${escapeHtml(template.category || '')}"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea id="template-meta-description" class="form-input" rows="3">${escapeHtml(template.description || '')}</textarea></div>
        <div class="form-group"><label class="form-label">Status</label><select id="template-meta-status" class="form-input">
          ${['draft','active','archived'].map(status => `<option value="${status}" ${template.status === status ? 'selected' : ''}>${titleCaseStatus(status)}</option>`).join('')}
        </select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" onclick="deleteTemplateLive(${template.id}, '${escapeHtml(template.name).replaceAll("'", "\\'")}')">${icon('trash')} Delete</button>
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveTemplateMetadataLive(${template.id})">${icon('save')} Save</button>
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveTemplateMetadataLive(id) {
  await hanmakApi(`/templates/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: document.getElementById('template-meta-name')?.value.trim() || 'Untitled Template',
      category: document.getElementById('template-meta-category')?.value.trim() || '',
      description: document.getElementById('template-meta-description')?.value || '',
      status: document.getElementById('template-meta-status')?.value || 'draft',
    }),
  });
  closeModal();
  showToast('Template updated', 'success');
  templates_init();
}

async function deleteTemplateLive(id, name) {
  confirm(`Delete template "${name}"? Existing envelopes keep their copied fields.`, async () => {
    try {
      await hanmakApi(`/templates/${id}/`, {method: 'DELETE'});
      closeModal();
      showToast('Template deleted', 'success');
      templates_init();
    } catch (error) {
      showToast(error.message || 'Template delete failed. Check permissions or linked compliance controls.', 'error', 7000);
    }
  });
}

async function duplicateTemplateLive(id) {
  const name = prompt('Name for copied template', 'Template Copy');
  if (name === null) return;
  await hanmakApi(`/templates/${id}/duplicate/`, {method: 'POST', body: JSON.stringify({name: name || 'Template Copy'})});
  showToast('Template duplicated', 'success');
  templates_init();
}

async function archiveTemplateLive(id) {
  await hanmakApi(`/templates/${id}/archive/`, {method: 'POST', body: JSON.stringify({})});
  showToast('Template archived', 'success');
  templates_init();
}

async function activateTemplateLive(id) {
  await hanmakApi(`/templates/${id}/activate/`, {method: 'POST', body: JSON.stringify({})});
  showToast('Template activated', 'success');
  templates_init();
}

function openCreateTemplateModal() {
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">New Template</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input id="new-template-name" class="form-input" value="Mutual NDA"></div>
        <div class="form-group"><label class="form-label">Category</label><input id="new-template-category" class="form-input" value="Legal"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea id="new-template-description" class="form-input" rows="3">Reusable agreement template.</textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="createTemplateLive()">${icon('plus')} Create</button>
      </div>
    </div>
  `);
}

async function createTemplateLive() {
  try {
    const organization = await firstOrganizationId();
    const name = document.getElementById('new-template-name').value;
    if (!window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
      const template = await hanmakApi('/templates/', {
        method: 'POST',
        body: JSON.stringify({
          organization,
          name,
          category: document.getElementById('new-template-category').value,
          description: document.getElementById('new-template-description').value,
          status: 'draft',
        }),
      });
      closeModal();
      showToast('Template draft created. Open it in Form Builder or attach a File Library document before beta use.', 'success', 7000);
      templates_init();
      setTimeout(() => editLiveTemplateInBuilder(template.id), 300);
      return;
    }
    const pdf = placeholderPdfFile(`${name}.pdf`);
    const formData = new FormData();
    formData.append('organization', organization);
    formData.append('title', name);
    formData.append('mime_type', 'application/pdf');
    formData.append('file', pdf, `${name}.pdf`);
    const documentRecord = await hanmakApi('/documents/', {method: 'POST', body: formData});
    await hanmakApi(`/documents/${documentRecord.id}/process/`, {method: 'POST', body: JSON.stringify({page_count: 1})});
    await hanmakApi(`/documents/${documentRecord.id}/scan/`, {method: 'POST', body: JSON.stringify({})});

    const template = await hanmakApi('/templates/', {
      method: 'POST',
      body: JSON.stringify({
        organization,
        name,
        category: document.getElementById('new-template-category').value,
        description: document.getElementById('new-template-description').value,
        status: 'active',
      }),
    });
    const fields = [
      {field_key: 'signer-name', field_type: 'text', label: 'Signer Name', required: true, party_key: 'party-2', page: 1, x: 133, y: 341, width: 309, height: 52, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
      {field_key: 'signature', field_type: 'signature', label: 'Signature', required: true, party_key: 'party-2', page: 1, x: 133, y: 1040, width: 374, height: 104, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
    ];
    await hanmakApi(`/templates/${template.id}/setup/`, {
      method: 'POST',
      body: JSON.stringify({
        document: documentRecord.id,
        fields,
        changelog: 'Quick starter version',
      }),
    });
    closeModal();
    showToast('Usable template created by backend setup service', 'success');
    templates_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function makeTemplateUsableLive(templateId) {
  try {
    if (!window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
      throw new Error('Quick placeholder setup is disabled in beta mode. Open the template in Form Builder and attach a real File Library document.');
    }
    const template = await hanmakApi(`/templates/${templateId}/`);
    const organization = template.organization || await firstOrganizationId();
    const pdf = placeholderPdfFile(`${template.name}.pdf`);
    const formData = new FormData();
    formData.append('organization', organization);
    formData.append('title', template.name);
    formData.append('mime_type', 'application/pdf');
    formData.append('file', pdf, `${template.name}.pdf`);
    const documentRecord = await hanmakApi('/documents/', {method: 'POST', body: formData});
    await hanmakApi(`/documents/${documentRecord.id}/process/`, {method: 'POST', body: JSON.stringify({page_count: 1})});
    await hanmakApi(`/documents/${documentRecord.id}/scan/`, {method: 'POST', body: JSON.stringify({})});
    const fields = [
      {field_key: 'signer-name', field_type: 'text', label: 'Signer Name', required: true, party_key: 'party-2', page: 1, x: 133, y: 341, width: 309, height: 52, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
      {field_key: 'signature', field_type: 'signature', label: 'Signature', required: true, party_key: 'party-2', page: 1, x: 133, y: 1040, width: 374, height: 104, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
    ];
    await hanmakApi(`/templates/${template.id}/setup/`, {
      method: 'POST',
      body: JSON.stringify({
        document: documentRecord.id,
        fields,
        changelog: 'Made usable from Templates page',
      }),
    });
    showToast(`${template.name} is ready for envelopes through backend setup`, 'success');
    templates_init();
  } catch (error) {
    showToast(`Template setup failed: ${error.message}`, 'error', 7000);
  }
}

async function openLiveTemplateDrawer(id) {
  try {
    const template = await hanmakApi(`/templates/${id}/`);
    openDrawerLg(`
      <div class="drawer-header"><h3 class="drawer-title">${escapeHtml(template.name)}</h3><button class="modal-close" onclick="closeDrawer()">x</button></div>
      <div class="drawer-body">
        <div class="flex gap-2" style="margin-bottom:1rem">
          <button class="btn btn-primary btn-sm" onclick="editLiveTemplateInBuilder(${template.id})">${icon('edit')} Edit in Builder</button>
          <button class="btn btn-ghost btn-sm" onclick="closeDrawer();openCreateEnvelopeModal(${template.id})">${icon('send')} Use in Envelope</button>
        </div>
        <div class="card" style="padding:1rem;margin-bottom:1rem">
          ${[['Status', titleCaseStatus(template.status)], ['Category', template.category || '-'], ['Version', template.version], ['Created', apiDate(template.created_at)], ['Updated', apiDate(template.updated_at)]].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border)"><span style="color:var(--text-muted)">${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('')}
        </div>
        <div style="font-weight:700;margin-bottom:0.75rem">Versions</div>
        ${(template.versions || []).map(version => `<div class="card" style="padding:1rem;margin-bottom:0.75rem"><div style="display:flex;justify-content:space-between"><strong>Version ${version.version_number}</strong>${liveBadge(version.is_published ? 'published' : 'draft')}</div><div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem">${escapeHtml(version.changelog || 'No changelog')}</div></div>`).join('') || '<div class="empty-state"><div class="empty-state-title">No versions yet</div></div>'}
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function editLiveTemplateInBuilder(id) {
  localStorage.setItem('HANMAK_EDIT_TEMPLATE_ID', String(id));
  closeDrawer();
  navigate('form-builder');
}

registerPage('workflow-builder', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Workflow Builder</h1>
    <p class="page-subtitle">Live approval and signing workflow definitions</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="workflow_builder_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-ghost" onclick="validateAllWorkflowsLive()">${icon('check-circle')} Validate</button>
    <button class="btn btn-primary" onclick="openCreateWorkflowModal()">${icon('plus')} New Workflow</button>
  </div>
</div>
<div id="live-workflow-stats" class="stats-grid" style="--cols:4;margin-bottom:1rem"></div>
<div id="live-workflow-list"></div>
`);

async function workflow_builder_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const [data, runsData] = await Promise.all([hanmakApi('/workflows/'), hanmakApi('/workflow-runs/')]);
    const rows = data.results || data;
    const runs = runsData.results || runsData;
    const workflowById = Object.fromEntries(rows.map(workflow => [workflow.id, workflow]));
    const stats = document.getElementById('live-workflow-stats');
    if (stats) {
      stats.innerHTML = [
        ['Definitions', rows.length],
        ['Active', rows.filter(row => row.status === 'active').length],
        ['Stages', rows.reduce((sum, row) => sum + (row.stages?.length || 0), 0)],
        ['Running', runs.filter(run => run.status === 'running').length],
      ].map(([label, value]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`).join('');
    }
    document.getElementById('live-workflow-list').innerHTML = `
    ${liveTable(['Workflow', 'Status', 'Stages', 'Updated', 'Actions'], rows.map(workflow => `
      <tr>
        <td><div style="font-weight:700">${escapeHtml(workflow.name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(workflow.description || 'No description')}</div></td>
        <td>${liveBadge(workflow.status)}</td>
        <td>${workflowStageBadges(workflow)}</td>
        <td>${apiDate(workflow.updated_at)}</td>
        <td><div class="flex gap-1">
          <button class="btn btn-primary btn-sm" onclick="openWorkflowStageEditor(${workflow.id}, '${escapeHtml(workflow.name).replaceAll("'", "\\'")}')">${icon('activity')} Stages</button>
          <button class="btn btn-ghost btn-sm" onclick="simulateWorkflowLive(${workflow.id})">${icon('play')} Simulate</button>
          <button class="btn btn-ghost btn-sm" onclick="openStartWorkflowRunModal(${workflow.id})">${icon('send')} Run</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditWorkflowModal(${workflow.id})">${icon('edit')} Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="activateWorkflowLive(${workflow.id})">${icon('check')} Activate</button>
          <button class="btn btn-ghost btn-sm" onclick="archiveWorkflowLive(${workflow.id})">${icon('stop')} Archive</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteWorkflowLive(${workflow.id}, '${escapeHtml(workflow.name).replaceAll("'", "\\'")}')">${icon('trash')}</button>
        </div></td>
      </tr>
    `), 'No workflows found')}
    <div style="height:1rem"></div>
    ${liveTable(['Run', 'Workflow', 'Stage', 'Status', 'Started', 'Actions'], runs.map(run => `
      <tr>
        <td>#${run.id}<div style="font-size:0.75rem;color:var(--text-muted)">Envelope #${run.envelope}</div></td>
        <td>${run.workflow ? escapeHtml(workflowById[run.workflow]?.name || `#${run.workflow}`) : '-'}</td>
        <td>${workflowStageLabel(workflowById[run.workflow], run.current_stage_key)}</td>
        <td>${liveBadge(run.status)}</td>
        <td>${apiDate(run.started_at)}</td>
        <td><div class="flex gap-1">${run.status === 'running' ? `<button class="btn btn-ghost btn-sm" onclick="advanceWorkflowRunLive(${run.id})">${icon('arrow-right')} Advance</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="openWorkflowRunEventsLive(${run.id}, ${run.envelope})">${icon('file-text')} Events</button></div></td>
      </tr>
    `), 'No workflow runs found')}`;
  } catch (error) {
    showToast(`Workflow API error: ${error.message}`, 'error');
  }
}

function workflowStageBadges(workflow) {
  const stages = workflow.stages || [];
  if (!stages.length) return '<span class="badge badge-warning">No stages</span>';
  return stages
    .sort((a, b) => a.order - b.order)
    .map(stage => `<span class="badge" style="margin-right:0.35rem">${escapeHtml(stage.label)} · ${escapeHtml(stage.stage_type)}</span>`)
    .join('');
}

function workflowStageLabel(workflow, key) {
  if (!key) return '<span style="color:var(--text-muted)">Not started</span>';
  const stage = (workflow?.stages || []).find(item => item.key === key);
  return stage ? `${escapeHtml(stage.label)} <span style="font-size:0.72rem;color:var(--text-muted)">(${escapeHtml(key)})</span>` : escapeHtml(key);
}

async function validateAllWorkflowsLive() {
  try {
    const data = await hanmakApi('/workflows/');
    const workflows = data.results || data;
    const results = await Promise.all(workflows.map(async workflow => {
      try {
        const result = await hanmakApi(`/workflows/${workflow.id}/simulate/`, {method: 'POST', body: JSON.stringify({})});
        return {workflow, result};
      } catch (error) {
        return {workflow, result: {valid: false, errors: [error.message], warnings: []}};
      }
    }));
    openModal(`<div class="modal-header"><h3 class="modal-title">${icon('check-circle')} Workflow Validation</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        ${results.length ? results.map(({workflow, result}) => `<div style="padding:0.75rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.625rem">
          <div style="display:flex;justify-content:space-between;align-items:center"><strong>${escapeHtml(workflow.name)}</strong>${liveBadge(result.valid ? 'valid' : 'invalid')}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem">${result.stage_count || 0} stage(s)</div>
          ${(result.errors || []).map(item => `<div style="font-size:0.8rem;color:var(--danger);margin-top:0.25rem">${escapeHtml(item)}</div>`).join('')}
          ${(result.warnings || []).map(item => `<div style="font-size:0.8rem;color:var(--warning);margin-top:0.25rem">${escapeHtml(item)}</div>`).join('')}
        </div>`).join('') : '<div class="empty-state"><div class="empty-state-title">No workflows to validate.</div></div>'}
      </div>`);
  } catch (error) {
    showToast(`Workflow validation failed: ${error.message}`, 'error');
  }
}

function openCreateWorkflowModal() {
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">New Workflow</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input id="new-workflow-name" class="form-input" value="Standard Approval Flow"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea id="new-workflow-description" class="form-input" rows="3">Custom signing, review, notification, and approval workflow.</textarea></div>
        <div class="form-group">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
            <label class="form-label" style="margin:0">Stages</label>
            <button class="btn btn-ghost btn-sm" onclick="addCreateWorkflowStageRow()">${icon('plus')} Add Stage</button>
          </div>
          <div id="new-workflow-stage-rows"></div>
        </div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createWorkflowLive()">${icon('plus')} Create</button></div>
    </div>
  `);
  renderCreateWorkflowStageRows([
    {label: 'Signer Review', stage_type: 'signing'},
    {label: 'Manager Approval', stage_type: 'approval'},
  ]);
}

async function createWorkflowLive() {
  try {
    const organization = await firstOrganizationId();
    const stages = readCreateWorkflowStageRows();
    if (!stages.length) {
      return showToast('Add at least one workflow stage', 'error');
    }
    const workflow = await hanmakApi('/workflows/', {
      method: 'POST',
      body: JSON.stringify({
        organization,
        name: document.getElementById('new-workflow-name').value.trim() || 'Untitled Workflow',
        description: document.getElementById('new-workflow-description').value,
        status: 'draft',
        schema: {steps: stages.map(stage => stage.key)},
      }),
    });
    await hanmakApi(`/workflows/${workflow.id}/replace-stages/`, {
      method: 'POST',
      body: JSON.stringify({stages}),
    });
    closeModal();
    showToast('Workflow created', 'success');
    workflow_builder_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function createWorkflowStageTypeOptions(selected = 'approval') {
  return WF_STAGE_TYPES.map(type => `<option value="${type.value}" ${selected === type.value ? 'selected' : ''}>${type.label}</option>`).join('');
}

function renderCreateWorkflowStageRows(stages) {
  const container = document.getElementById('new-workflow-stage-rows');
  if (!container) return;
  container.innerHTML = stages.map((stage, index) => `
    <div class="new-workflow-stage-row" style="display:grid;grid-template-columns:minmax(0,1fr) 150px 40px;gap:0.5rem;align-items:center;margin-bottom:0.5rem">
      <input class="form-input new-workflow-stage-label" value="${escapeHtml(stage.label || '')}" placeholder="Stage name">
      <select class="form-input new-workflow-stage-type">${createWorkflowStageTypeOptions(stage.stage_type || 'approval')}</select>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="removeCreateWorkflowStageRow(${index})" title="Remove">${icon('trash')}</button>
    </div>
  `).join('');
}

function getCreateWorkflowStageDrafts() {
  return [...document.querySelectorAll('.new-workflow-stage-row')].map(row => ({
    label: row.querySelector('.new-workflow-stage-label')?.value || '',
    stage_type: row.querySelector('.new-workflow-stage-type')?.value || 'approval',
  }));
}

function addCreateWorkflowStageRow() {
  const stages = getCreateWorkflowStageDrafts();
  stages.push({label: `Stage ${stages.length + 1}`, stage_type: 'approval'});
  renderCreateWorkflowStageRows(stages);
}

function removeCreateWorkflowStageRow(index) {
  const stages = getCreateWorkflowStageDrafts();
  stages.splice(index, 1);
  renderCreateWorkflowStageRows(stages);
}

function readCreateWorkflowStageRows() {
  return getCreateWorkflowStageDrafts()
    .map((stage, index) => {
      const label = stage.label.trim();
      const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `stage_${index + 1}`;
      return label ? {
        key,
        label,
        stage_type: stage.stage_type || 'approval',
        order: index + 1,
        config: {},
      } : null;
    })
    .filter(Boolean);
}

async function openEditWorkflowModal(id) {
  try {
    const workflow = await hanmakApi(`/workflows/${id}/`);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Edit Workflow</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Name</label><input id="edit-workflow-name" class="form-input" value="${escapeHtml(workflow.name || '')}"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea id="edit-workflow-description" class="form-input" rows="3">${escapeHtml(workflow.description || '')}</textarea></div>
        <div class="form-group"><label class="form-label">Status</label><select id="edit-workflow-status" class="form-input">
          ${['draft','active','archived'].map(status => `<option value="${status}" ${workflow.status === status ? 'selected' : ''}>${titleCaseStatus(status)}</option>`).join('')}
        </select></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveWorkflowLive(${workflow.id})">${icon('save')} Save</button></div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveWorkflowLive(id) {
  await hanmakApi(`/workflows/${id}/`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: document.getElementById('edit-workflow-name')?.value.trim() || 'Untitled Workflow',
      description: document.getElementById('edit-workflow-description')?.value || '',
      status: document.getElementById('edit-workflow-status')?.value || 'draft',
    }),
  });
  closeModal();
  showToast('Workflow saved', 'success');
  workflow_builder_init();
}

async function deleteWorkflowLive(id, name) {
  confirm(`Delete workflow "${name}"?`, async () => {
    await hanmakApi(`/workflows/${id}/`, {method: 'DELETE'});
    showToast('Workflow deleted', 'success');
    workflow_builder_init();
  });
}

// ── Workflow Visual Stage Editor ──────────────────────────────────────────

let _wfEditorStages = [];
let _wfEditorWorkflowId = null;

const WF_STAGE_TYPES = [
  {value: 'signing',      label: 'Signing',       color: '#4f8ef7'},
  {value: 'approval',     label: 'Approval',      color: '#f59e0b'},
  {value: 'notification', label: 'Notification',  color: '#8b5cf6'},
  {value: 'review',       label: 'Review',        color: '#14b8a6'},
  {value: 'condition',    label: 'Condition',      color: '#ef4444'},
];

function wfStageTypeColor(type) {
  return WF_STAGE_TYPES.find(t => t.value === type)?.color || '#6b7280';
}

async function openWorkflowStageEditor(workflowId, workflowName) {
  _wfEditorWorkflowId = workflowId;
  openDrawerLg(`
    <div style="display:flex;flex-direction:column;height:100%">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1.25rem 1.5rem;border-bottom:1px solid var(--border);flex-shrink:0">
        <div>
          <div style="font-size:1.125rem;font-weight:700">Stage Editor — ${escapeHtml(workflowName)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);margin-top:2px">Drag stages to reorder · Click to edit · Save to apply</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-ghost" onclick="closeDrawer()">${icon('x')} Close</button>
          <button class="btn btn-primary" onclick="saveWorkflowStagesLive()">${icon('save')} Save Stages</button>
        </div>
      </div>
      <div style="flex:1;overflow-y:auto;padding:1.5rem">
        <div id="wf-stage-canvas" style="min-height:200px"></div>
        <div style="margin-top:2rem">
          <div style="font-weight:700;margin-bottom:0.75rem">Add Stage</div>
          <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
            ${WF_STAGE_TYPES.map(t => `
              <button class="btn btn-ghost btn-sm" style="border:2px solid ${t.color};color:${t.color}" onclick="wfAddStage('${t.value}')">
                + ${t.label}
              </button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
  await _loadWfEditorStages(workflowId);
}

async function _loadWfEditorStages(workflowId) {
  try {
    const workflow = await hanmakApi(`/workflows/${workflowId}/`);
    _wfEditorStages = (workflow.stages || []).map((s, i) => ({
      id: s.id,
      key: s.key,
      label: s.label,
      stage_type: s.stage_type || 'approval',
      order: s.order ?? (i + 1),
      config: s.config || {},
      _local: false,
    }));
    _wfRenderCanvas();
  } catch (error) {
    showToast(`Failed to load stages: ${error.message}`, 'error');
  }
}

function _wfRenderCanvas() {
  const canvas = document.getElementById('wf-stage-canvas');
  if (!canvas) return;
  if (!_wfEditorStages.length) {
    canvas.innerHTML = `
      <div style="text-align:center;padding:3rem;border:2px dashed var(--border);border-radius:12px;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:0.5rem">+</div>
        <div>No stages yet — add one below</div>
      </div>`;
    return;
  }
  const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
  canvas.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:0;flex-wrap:wrap;padding:0.5rem 0">
      <div style="display:flex;align-items:center;padding:0.75rem 1rem;background:var(--bg-secondary);border:2px solid var(--border);border-radius:8px;font-size:0.75rem;font-weight:600;color:var(--text-muted);white-space:nowrap">
        ${icon('play', 12)} START
      </div>
      ${sorted.map((stage, idx) => `
        <div style="display:flex;align-items:center">
          <div style="width:32px;height:2px;background:var(--border);flex-shrink:0"></div>
          <div style="border:2px solid ${wfStageTypeColor(stage.stage_type)};border-radius:12px;padding:0;min-width:180px;background:var(--bg-primary);position:relative;overflow:hidden">
            <div style="height:4px;background:${wfStageTypeColor(stage.stage_type)}"></div>
            <div style="padding:0.75rem">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem">
                <span style="font-size:0.7rem;font-weight:700;color:${wfStageTypeColor(stage.stage_type)};text-transform:uppercase">${stage.stage_type}</span>
                <span style="font-size:0.7rem;color:var(--text-muted)">#{${stage.order}}</span>
              </div>
              <input class="form-input" style="font-size:0.8125rem;font-weight:600;margin-bottom:0.5rem;padding:4px 8px"
                value="${escapeHtml(stage.label)}"
                onchange="_wfUpdateStageLabel(${idx}, this.value)"
                placeholder="Stage name">
              <select class="form-input" style="font-size:0.75rem;padding:4px 8px"
                onchange="_wfUpdateStageType(${idx}, this.value)">
                ${WF_STAGE_TYPES.map(t => `<option value="${t.value}" ${stage.stage_type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
              </select>
              <div style="display:flex;justify-content:space-between;margin-top:0.5rem;gap:4px">
                <div class="flex gap-1">
                  ${idx > 0 ? `<button class="btn btn-ghost btn-sm" style="padding:2px 5px" onclick="_wfMoveStage(${idx},-1)" title="Move left">${icon('chevron-right', 12)}</button>` : ''}
                  ${idx < sorted.length - 1 ? `<button class="btn btn-ghost btn-sm" style="padding:2px 5px;transform:rotate(180deg)" onclick="_wfMoveStage(${idx},1)" title="Move right">${icon('chevron-right', 12)}</button>` : ''}
                </div>
                <button class="btn btn-ghost btn-sm" style="padding:2px 5px;color:var(--danger)" onclick="_wfRemoveStage(${idx})" title="Remove">${icon('trash', 12)}</button>
              </div>
            </div>
          </div>
        </div>
      `).join('')}
      <div style="display:flex;align-items:center">
        <div style="width:32px;height:2px;background:var(--border);flex-shrink:0"></div>
        <div style="display:flex;align-items:center;padding:0.75rem 1rem;background:var(--bg-secondary);border:2px solid var(--border);border-radius:8px;font-size:0.75rem;font-weight:600;color:var(--text-muted);white-space:nowrap">
          ${icon('check', 12)} END
        </div>
      </div>
    </div>`;
}

function _wfUpdateStageLabel(idx, value) {
  const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
  const stage = sorted[idx];
  if (stage) {
    stage.label = value;
    if (!stage.id) stage.key = value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `stage_${idx + 1}`;
  }
}

function _wfUpdateStageType(idx, value) {
  const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
  const stage = sorted[idx];
  if (stage) { stage.stage_type = value; _wfRenderCanvas(); }
}

function _wfMoveStage(idx, dir) {
  const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= sorted.length) return;
  const tempOrder = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tempOrder;
  _wfRenderCanvas();
}

function _wfRemoveStage(idx) {
  const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
  sorted.splice(idx, 1);
  sorted.forEach((s, i) => { s.order = i + 1; });
  _wfEditorStages = sorted;
  _wfRenderCanvas();
}

function wfAddStage(type) {
  const nextOrder = _wfEditorStages.length + 1;
  const typeMeta = WF_STAGE_TYPES.find(t => t.value === type) || {label: type};
  _wfEditorStages.push({
    id: null,
    key: `${type}_${nextOrder}`,
    label: `${typeMeta.label} ${nextOrder}`,
    stage_type: type,
    order: nextOrder,
    config: {},
    _local: true,
  });
  _wfRenderCanvas();
}

async function saveWorkflowStagesLive() {
  if (!_wfEditorWorkflowId) return;
  try {
    const sorted = [..._wfEditorStages].sort((a, b) => a.order - b.order);
    await hanmakApi(`/workflows/${_wfEditorWorkflowId}/replace-stages/`, {
      method: 'POST',
      body: JSON.stringify({
        stages: sorted.map((s, i) => ({
          key: (s.key || `stage_${i + 1}`).replace(/[^a-z0-9_]/g, '_'),
          label: s.label || `Stage ${i + 1}`,
          stage_type: s.stage_type || 'approval',
          order: i + 1,
          config: s.config || {},
        })),
      }),
    });
    showToast(`${sorted.length} stage(s) saved`, 'success');
    closeDrawer();
    workflow_builder_init();
  } catch (error) {
    showToast(error.message || 'Save failed', 'error');
  }
}

async function simulateWorkflowLive(id) {
  try {
    const result = await hanmakApi(`/workflows/${id}/simulate/`, {method: 'POST', body: JSON.stringify({})});
    openModal(`<div class="modal modal-sm"><div class="modal-header"><div class="modal-title">${result.valid ? 'Simulation Passed' : 'Simulation Failed'}</div><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        ${(result.errors || []).map(item => `<div style="color:var(--danger);font-size:0.85rem;margin-bottom:0.5rem">${escapeHtml(item)}</div>`).join('')}
        ${(result.warnings || []).map(item => `<div style="color:var(--warning);font-size:0.85rem;margin-bottom:0.5rem">${escapeHtml(item)}</div>`).join('')}
        ${(result.stages || []).map(stage => `<div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-bottom:1px solid var(--border)"><span>${escapeHtml(stage.label)}</span><span class="badge">${escapeHtml(stage.stage_type)}</span></div>`).join('') || '<div style="color:var(--text-muted)">No stages configured.</div>'}
      </div></div>`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function activateWorkflowLive(id) {
  try {
    await hanmakApi(`/workflows/${id}/activate/`, {method: 'POST', body: JSON.stringify({})});
    showToast('Workflow activated', 'success');
    workflow_builder_init();
  } catch (error) {
    showToast(`Workflow activation failed: ${error.message}`, 'error', 9000);
  }
}

async function archiveWorkflowLive(id) {
  await hanmakApi(`/workflows/${id}/archive/`, {method: 'POST', body: JSON.stringify({})});
  showToast('Workflow archived', 'success');
  workflow_builder_init();
}

async function advanceWorkflowRunLive(id) {
  try {
    const run = await hanmakApi(`/workflow-runs/${id}/advance/`, {
      method: 'POST',
      body: JSON.stringify({message: 'Advanced from workflow builder'}),
    });
    showToast(run.status === 'completed' ? 'Workflow completed' : `Advanced to ${run.current_stage_key || 'next stage'}`, 'success');
    workflow_builder_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openStartWorkflowRunModal(workflowId) {
  try {
    const [workflow, envelopeData] = await Promise.all([
      hanmakApi(`/workflows/${workflowId}/`),
      hanmakApi('/envelopes/'),
    ]);
    const envelopes = envelopeData.results || envelopeData;
    const sortedStages = (workflow.stages || []).sort((a, b) => a.order - b.order);
    const canStart = workflow.status === 'active' && envelopes.length && sortedStages.length;
    openModal(`<div class="modal-header"><h3 class="modal-title">${icon('send')} Start Workflow Run</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div style="font-size:0.875rem;color:var(--text-muted);margin-bottom:1rem">${escapeHtml(workflow.name)} · ${(workflow.stages || []).length} stage(s)</div>
        ${workflow.status !== 'active' ? '<div class="alert alert-warning" style="margin-bottom:1rem">Activate this workflow before starting a run.</div>' : ''}
        ${!envelopes.length ? '<div class="alert alert-warning" style="margin-bottom:1rem">Create an envelope before starting a workflow run.</div>' : ''}
        ${!sortedStages.length ? '<div class="alert alert-warning" style="margin-bottom:1rem">Add at least one stage before starting a workflow run.</div>' : ''}
        <div class="form-group"><label class="form-label">Envelope</label><select id="workflow-run-envelope" class="form-input">
          ${envelopes.map(envelope => `<option value="${envelope.id}">${escapeHtml(envelope.name)} · ${escapeHtml(envelope.status)}</option>`).join('')}
        </select></div>
        <div class="form-group"><label class="form-label">Initial Stage</label><select id="workflow-run-stage" class="form-input">
          ${sortedStages.map(stage => `<option value="${escapeHtml(stage.key)}">${escapeHtml(stage.label)}</option>`).join('')}
        </select></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" ${canStart ? '' : 'disabled'} onclick="startWorkflowRunLive(${workflowId})">${icon('play')} Start Run</button></div>`);
  } catch (error) {
    showToast(`Could not open workflow run: ${error.message}`, 'error');
  }
}

async function startWorkflowRunLive(workflowId) {
  try {
    const envelope = Number(document.getElementById('workflow-run-envelope')?.value || 0);
    if (!envelope) return showToast('Choose an envelope first', 'error');
    await hanmakApi('/workflow-runs/', {
      method: 'POST',
      body: JSON.stringify({
        envelope,
        workflow: workflowId,
        status: 'running',
        current_stage_key: document.getElementById('workflow-run-stage')?.value || '',
      }),
    });
    closeModal();
    showToast('Workflow run started', 'success');
    workflow_builder_init();
  } catch (error) {
    showToast(`Workflow run failed: ${error.message}`, 'error', 9000);
  }
}

async function openWorkflowRunEventsLive(runId, envelopeId) {
  try {
    const data = await hanmakApi(`/workflow-events/?run=${runId}`);
    let events = data.results || data;
    events = events.filter(event => event.run === runId);
    openModal(`<div class="modal-header"><h3 class="modal-title">${icon('file-text')} Workflow Events</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        ${events.length ? events.map(event => `<div style="padding:0.75rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.5rem">
          <div style="display:flex;justify-content:space-between;gap:1rem"><strong>${escapeHtml(event.event_type)}</strong><span style="font-size:0.75rem;color:var(--text-muted)">${apiDate(event.created_at)}</span></div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem">Stage: ${escapeHtml(event.stage_key || '-')} · Envelope #${event.envelope || envelopeId}</div>
          <div style="font-size:0.85rem;margin-top:0.35rem">${escapeHtml(event.message || '')}</div>
        </div>`).join('') : '<div class="empty-state"><div class="empty-state-title">No workflow events yet.</div></div>'}
      </div>`);
  } catch (error) {
    showToast(`Could not load workflow events: ${error.message}`, 'error');
  }
}

registerPage('legal-holds', () => `
<div class="page-header">
  <div><h1 class="page-title">Legal Holds</h1><p class="page-subtitle">Live litigation holds and release controls</p></div>
  <button class="btn btn-primary" onclick="openCreateLegalHoldModal()">${icon('plus')} New Hold</button>
</div>
<div id="live-legal-holds"></div>
`);

async function legal_holds_init() {
  if (!await ensureHanmakApi()) return;
  const data = await hanmakApi('/legal-holds/');
  const rows = data.results || data;
  document.getElementById('live-legal-holds').innerHTML = liveTable(['Hold', 'Matter', 'Status', 'Created', 'Actions'], rows.map(hold => `
    <tr>
      <td><strong>${escapeHtml(hold.name)}</strong><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(hold.reason || '')}</div></td>
      <td>${escapeHtml(hold.matter || '-')}</td>
      <td>${liveBadge(hold.status)}</td>
      <td>${apiDate(hold.created_at)}</td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="viewLegalHoldLive(${hold.id})">${icon('eye')} View</button>
        ${hold.status !== 'released' ? `<button class="btn btn-ghost btn-sm" style="color:var(--warning)" onclick="releaseLegalHoldLive(${hold.id})">${icon('x-circle')} Release</button>` : ''}
      </td>
    </tr>
  `), 'No legal holds found');
}

async function viewLegalHoldLive(id) {
  try {
    const hold = await hanmakApi(`/legal-holds/${id}/`);
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Legal Hold — ${escapeHtml(hold.name)}</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
          <div><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Status</div>${liveBadge(hold.status)}</div>
          <div><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Matter</div><div style="font-weight:600">${escapeHtml(hold.matter || '-')}</div></div>
          <div><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Created</div><div>${apiDate(hold.created_at)}</div></div>
          <div><div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:2px">Released</div><div>${hold.released_at ? apiDate(hold.released_at) : '—'}</div></div>
        </div>
        <div class="form-group"><label class="form-label">Reason</label><div class="form-input" style="min-height:60px;background:var(--bg-secondary)">${escapeHtml(hold.reason || '—')}</div></div>
        ${hold.notes ? `<div class="form-group"><label class="form-label">Notes</label><div class="form-input" style="background:var(--bg-secondary)">${escapeHtml(hold.notes)}</div></div>` : ''}
      </div>
      <div class="modal-footer">
        ${hold.status !== 'released' ? `<button class="btn btn-ghost" style="color:var(--warning)" onclick="closeModal();releaseLegalHoldLive(${id})">${icon('x-circle')} Release Hold</button>` : ''}
        <button class="btn btn-primary" onclick="closeModal()">Close</button>
      </div>
    `);
  } catch (error) {
    showToast(error.message || 'Could not load hold details', 'error');
  }
}

function openCreateLegalHoldModal() {
  openModal(`<div class="modal"><div class="modal-header"><div class="modal-title">New Legal Hold</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Name</label><input id="new-hold-name" class="form-input" value="Contract Review Hold"></div><div class="form-group"><label class="form-label">Matter</label><input id="new-hold-matter" class="form-input" value="LIT-2026-NEW"></div><div class="form-group"><label class="form-label">Reason</label><textarea id="new-hold-reason" class="form-input" rows="3">Preserve related documents.</textarea></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createLegalHoldLive()">${icon('plus')} Create</button></div></div>`);
}

async function createLegalHoldLive() {
  try {
    const organization = await firstOrganizationId();
    await hanmakApi('/legal-holds/', {method: 'POST', body: JSON.stringify({organization, name: document.getElementById('new-hold-name').value, matter: document.getElementById('new-hold-matter').value, reason: document.getElementById('new-hold-reason').value})});
    closeModal();
    showToast('Legal hold created', 'success');
    legal_holds_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function releaseLegalHoldLive(id) {
  confirm('Release this legal hold? Documents will no longer be preserved by this hold.', async () => {
    try {
      await hanmakApi(`/legal-holds/${id}/release/`, {method: 'POST', body: JSON.stringify({})});
      showToast('Legal hold released', 'success');
      legal_holds_init();
    } catch (error) {
      showToast(error.message || 'Release failed', 'error');
    }
  });
}

registerPage('test-lab', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Test Lab</h1>
    <p class="page-subtitle">Run the full template → envelope → email → signer → evidence loop against the live API</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openScheduleTestRunModal()">${icon('calendar')} Schedule Run</button>
    <button class="btn btn-ghost" onclick="downloadTestLabReport()">${icon('download')} Report</button>
    <button class="btn btn-ghost" onclick="runAllTests()">${icon('play')} Run All Suites</button>
    <button class="btn btn-primary" onclick="runHanmakEndToEndTest()">${icon('play')} Run End-to-End Test</button>
  </div>
</div>
<div class="card" style="padding:1rem;margin-bottom:1rem">
  <div style="font-weight:700;margin-bottom:0.5rem">What This Checks</div>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.75rem">
    ${['Create document', 'Save template/version', 'Copy fields to envelope', 'Send signer email', 'Submit signer link', 'Generate evidence/PDF'].map(item => `<div class="badge badge-accent" style="justify-content:center;padding:0.55rem">${item}</div>`).join('')}
  </div>
</div>
<div class="stats-grid" id="live-test-lab-stats" style="--cols:5;margin-bottom:1rem">
  ${['Queued', 'Running', 'Succeeded', 'Failed', 'Last Run'].map(label => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">—</div></div>`).join('')}
</div>
<div class="card" style="padding:1rem;margin-bottom:1rem">
  <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:0.75rem">
    <div>
      <div style="font-weight:700">Backend Test Runs</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Recent Test Lab task records from Background Tasks.</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="test_lab_init()">${icon('refresh')} Refresh</button>
  </div>
  <div id="live-test-lab-runs"><div class="empty-state"><div class="empty-state-title">Loading backend test runs...</div></div></div>
</div>
<div id="hanmak-e2e-result" class="card" style="padding:1rem">
  <div class="empty-state"><div class="empty-state-title">Ready to test</div><div class="empty-state-desc">Click Run End-to-End Test to create real API records and verify the signing loop.</div></div>
</div>
`);

let _liveTestLabRuns = [];

async function test_lab_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/task-runs/?page_size=100');
    _liveTestLabRuns = (data.results || data).filter(run => run.related_object_type === 'test_lab');
    renderLiveTestLabRuns();
  } catch (error) {
    const target = document.getElementById('live-test-lab-runs');
    if (target) target.innerHTML = `<div class="alert alert-danger">${icon('alert-circle')} Could not load test runs: ${escapeHtml(error.message)}</div>`;
  }
}

function renderLiveTestLabRuns() {
  const stats = document.getElementById('live-test-lab-stats');
  const counts = _liveTestLabRuns.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});
  if (stats) {
    const last = _liveTestLabRuns[0];
    stats.innerHTML = [
      ['Queued', counts.queued || 0, ''],
      ['Running', counts.running || 0, 'var(--warning)'],
      ['Succeeded', counts.succeeded || 0, 'var(--success)'],
      ['Failed', counts.failed || 0, 'var(--danger)'],
      ['Last Run', last ? apiDate(last.queued_at || last.created_at) : '—', ''],
    ].map(([label, value, color]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`).join('');
  }
  const target = document.getElementById('live-test-lab-runs');
  if (!target) return;
  target.innerHTML = liveTable(['Task', 'Suite', 'Status', 'Queue', 'Queued', 'Actions'], _liveTestLabRuns.slice(0, 20).map(run => `
    <tr>
      <td><strong>${escapeHtml(run.task_name)}</strong><div style="font-size:0.75rem;color:var(--text-muted)">#${run.id}</div></td>
      <td>${escapeHtml(run.payload?.suite || run.payload?.test || '—')}</td>
      <td>${liveBadge(run.status)}</td>
      <td><code>${escapeHtml(run.queue_name || 'default')}</code></td>
      <td>${apiDate(run.queued_at || run.created_at)}</td>
      <td><div class="flex gap-1">
        ${run.status === 'failed' ? `<button class="btn btn-ghost btn-sm" onclick="rerunLiveTestLabTask(${run.id})">${icon('refresh')} Rerun</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="openLiveTaskRunDetail(${run.id})">${icon('eye')} View</button>
      </div></td>
    </tr>
  `), 'No backend Test Lab runs yet. Use Run All Suites or Run End-to-End Test.');
}

function downloadTestLabReport() {
  const rows = _liveTestLabRuns.map(run => [
    run.id,
    `"${String(run.payload?.suite || '').replaceAll('"', '""')}"`,
    `"${String(run.task_name || '').replaceAll('"', '""')}"`,
    run.status,
    run.queue_name,
    run.queued_at || '',
    run.finished_at || '',
    `"${String(run.error_message || '').replaceAll('"', '""')}"`,
  ].join(','));
  downloadTextFile(`hanmak-live-test-lab-${new Date().toISOString().slice(0,10)}.csv`, ['id,suite,task,status,queue,queued_at,finished_at,error'].concat(rows).join('\n'), 'text/csv');
  showToast(`${_liveTestLabRuns.length} backend test run(s) exported as CSV`, 'success');
}

async function rerunLiveTestLabTask(id) {
  try {
    const rerun = await hanmakApi(`/task-runs/${id}/restart/`, {method: 'POST', body: JSON.stringify({})});
    _liveTestLabRuns.unshift(rerun);
    renderLiveTestLabRuns();
    showToast(`Rerun queued as task #${rerun.id}`, 'success');
  } catch (error) {
    showToast(`Rerun failed: ${error.message}`, 'error', 7000);
  }
}

async function openLiveTaskRunDetail(id) {
  try {
    const run = await hanmakApi(`/task-runs/${id}/`);
    openModal(`
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Task Run #${run.id}</div><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
            ${[
              ['Task', run.task_name],
              ['Status', titleCaseStatus(run.status)],
              ['Queue', run.queue_name || 'default'],
              ['Queued', apiDate(run.queued_at || run.created_at)],
              ['Started', run.started_at ? apiDate(run.started_at) : '—'],
              ['Finished', run.finished_at ? apiDate(run.finished_at) : '—'],
            ].map(([label, value]) => `<div style="padding:0.625rem;background:var(--bg-secondary);border-radius:6px"><div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px">${label}</div><div style="font-weight:600;font-size:0.85rem">${escapeHtml(String(value || '—'))}</div></div>`).join('')}
          </div>
          <div class="form-group"><label class="form-label">Payload</label><pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:0.75rem;border-radius:6px;font-size:0.75rem;max-height:180px;overflow:auto">${escapeHtml(JSON.stringify(run.payload || {}, null, 2))}</pre></div>
          <div class="form-group"><label class="form-label">Result</label><pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:0.75rem;border-radius:6px;font-size:0.75rem;max-height:180px;overflow:auto">${escapeHtml(JSON.stringify(run.result || {}, null, 2))}</pre></div>
          ${run.error_message ? `<div class="alert alert-danger">${escapeHtml(run.error_message)}</div>` : ''}
        </div>
        <div class="modal-footer">
          ${run.status === 'failed' ? `<button class="btn btn-ghost" onclick="closeModal();rerunLiveTestLabTask(${run.id})">${icon('refresh')} Rerun</button>` : ''}
          <button class="btn btn-primary" onclick="closeModal()">Close</button>
        </div>
      </div>
    `);
  } catch (error) {
    showToast(`Task detail failed: ${error.message}`, 'error', 7000);
  }
}

function e2eLogLine(status, label, detail = '') {
  const color = status === 'ok' ? 'success' : status === 'run' ? 'warning' : 'danger';
  return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">
    <span class="badge badge-${color}" style="width:72px;justify-content:center">${status}</span>
    <div style="flex:1"><strong>${escapeHtml(label)}</strong>${detail ? `<div style="font-size:0.75rem;color:var(--text-muted)">${detail}</div>` : ''}</div>
  </div>`;
}

function setE2eResult(html) {
  const target = document.getElementById('hanmak-e2e-result');
  if (target) target.innerHTML = html;
}

async function runHanmakEndToEndTest() {
  if (!await ensureHanmakApi()) return;
  const log = [];
  const push = (status, label, detail = '') => {
    log.push(e2eLogLine(status, label, detail));
    setE2eResult(log.join(''));
  };
  try {
    push('run', 'Starting live API test');
    const organization = await firstOrganizationId();
    const stamp = Date.now();
    const pdf = placeholderPdfFile(`HanMak Test Agreement ${stamp}.pdf`);
    const formData = new FormData();
    formData.append('organization', organization);
    formData.append('title', `HanMak Test Agreement ${stamp}`);
    formData.append('mime_type', 'application/pdf');
    formData.append('file', pdf, `hanmak-test-${stamp}.pdf`);
    const documentRecord = await hanmakApi('/documents/', {method: 'POST', body: formData});
    await hanmakApi(`/documents/${documentRecord.id}/process/`, {method: 'POST', body: JSON.stringify({page_count: 1})});
    await hanmakApi(`/documents/${documentRecord.id}/scan/`, {method: 'POST', body: JSON.stringify({})});
    push('ok', 'Document saved', `Document #${documentRecord.id}`);

    const template = await hanmakApi('/templates/', {
      method: 'POST',
      body: JSON.stringify({organization, name: `E2E Template ${stamp}`, category: 'Test Lab', description: 'Generated by Test Lab', status: 'active'}),
    });
    const fields = [
      {field_key: 'signer-name', field_type: 'text', label: 'Signer Name', required: true, party_key: 'party-2', page: 1, x: 133, y: 341, width: 309, height: 52, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
      {field_key: 'signature', field_type: 'signature', label: 'Signature', required: true, party_key: 'party-2', page: 1, x: 133, y: 1040, width: 374, height: 104, page_width: HANMAK_CANONICAL_PAGE_WIDTH, page_height: HANMAK_DEFAULT_PAGE_HEIGHT, coordinate_basis: 'page-pixels'},
    ];
    const version = await hanmakApi('/template-versions/', {
      method: 'POST',
      body: JSON.stringify({
        template: template.id,
        version_number: 1,
        document: documentRecord.id,
        field_schema: {source: 'test-lab', page_count: 1, document_id: documentRecord.id, fields},
        workflow_schema: {stages: [{key: 'signer', type: 'signing', order: 1}]},
        changelog: 'Generated by Test Lab',
        is_published: true,
      }),
    });
    const party = await hanmakApi('/template-parties/', {method: 'POST', body: JSON.stringify({template_version: version.id, role_key: 'party-2', label: 'Signer', routing_order: 1})});
    for (const field of fields) {
      const {party_key, ...fieldPayload} = field;
      await hanmakApi('/form-fields/', {method: 'POST', body: JSON.stringify({...fieldPayload, template: template.id, template_version: version.id, party: party.id})});
    }
    push('ok', 'Template saved', `Template #${template.id}, version #${version.id}, document #${documentRecord.id}`);

    const envelope = await hanmakApi('/envelopes/', {
      method: 'POST',
      body: JSON.stringify({
        organization,
        template: template.id,
        template_version: version.id,
        name: `E2E Envelope ${stamp}`,
        message: 'Generated by HanMak Test Lab',
        recipients: [{name: 'Test Signer', email: `test-signer-${stamp}@example.com`, role: 'signer'}],
      }),
    });
    await hanmakApi('/envelope-documents/', {method: 'POST', body: JSON.stringify({envelope: envelope.id, document: documentRecord.id, order: 1})});
    await copyTemplateFieldsToEnvelope(version.id, {
      ...envelope,
      recipients: (envelope.recipients || []).map(recipient => ({...recipient, party_key: 'party-2'})),
    });
    push('ok', 'Envelope created from template', `Envelope #${envelope.id}`);

    const sent = await hanmakApi(`/envelopes/${envelope.id}/send/`, {method: 'POST', body: JSON.stringify({})});
    push('ok', 'Signer email queued/sent', `${sent.queued_email_count || 0} email(s) queued`);

    const messages = await hanmakApi('/email-messages/');
    const message = (messages.results || messages).find(item => item.envelope === envelope.id);
    const token = (message?.signing_url || '').split('token=')[1] || '';
    if (!token) throw new Error('Could not locate signing token from queued email.');
    push('ok', 'Signing link generated', `<a href="${escapeHtml(message.signing_url)}" target="_blank">Open signer link</a>`);

    const signResponse = await fetch(`${HANMAK_API_BASE_URL}/sign/${token}/`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        consent_text: 'Accepted by Test Lab.',
        signature: {signature_type: 'typed', typed_name: 'Test Signer'},
        field_values: [
          {field_key: 'signer-name', value: 'Test Signer', metadata: {field_type: 'text'}},
          {field_key: 'signature', value: 'Test Signer', metadata: {field_type: 'signature'}},
        ],
      }),
    });
    const signed = await signResponse.json();
    if (!signResponse.ok) throw new Error(signed.detail || 'Public signing submit failed.');
    push('ok', 'Signer submitted', `Envelope status: ${signed.envelope_detail?.status || signed.status}`);

    const bundle = await hanmakApi('/evidence-bundles/', {method: 'POST', body: JSON.stringify({envelope: envelope.id})});
    const manifest = await hanmakApi(`/evidence-bundles/${bundle.id}/generate/`, {method: 'POST', body: JSON.stringify({})});
    const signedPdf = await hanmakApi(`/evidence-bundles/${bundle.id}/generate-signed-pdf/`, {method: 'POST', body: JSON.stringify({})});
    const verification = await verifyEvidenceBundleLive(bundle.id, {silent: true});
    push('ok', 'Evidence generated', `${manifest.file ? `<a href="${manifest.file}" target="_blank">Evidence JSON</a>` : ''} ${signedPdf.signed_pdf ? `<a href="${signedPdf.signed_pdf}" target="_blank">Signed PDF</a>` : ''} · Verification: ${verification.valid ? 'passed' : 'failed'}`);
    showToast('End-to-end test completed', 'success');
  } catch (error) {
    push('fail', 'End-to-end test failed', error.message);
    showToast(error.message, 'error', 7000);
  }
}

function currentEnvelopeTemplatePartyKeys() {
  const option = document.getElementById('live-envelope-template')?.selectedOptions?.[0];
  const parties = (option?.dataset.parties || '').split(',').map(item => item.trim()).filter(Boolean);
  return parties.length ? parties : ['party-1', 'party-2', 'party-3'];
}

function envelopePartyOptionsLive(selected = '') {
  return `<option value="">No fields</option>${currentEnvelopeTemplatePartyKeys().map(partyKey => `<option value="${escapeHtml(partyKey)}" ${selected === partyKey ? 'selected' : ''}>${escapeHtml(titleCaseStatus(partyKey.replace(/-/g, ' ')))}</option>`).join('')}`;
}

function envelopeRecipientRowLive(name = '', email = '', role = 'signer', partyKey = '') {
  const index = document.querySelectorAll?.('.live-envelope-recipient-row').length + 1 || 1;
  return `<div class="live-envelope-recipient-row" style="display:grid;grid-template-columns:24px 1fr 1.35fr 120px 120px 34px;gap:8px;align-items:center;margin-bottom:8px">
    <span style="font-size:0.75rem;color:var(--text-muted)">${index}.</span>
    <input class="form-input live-recipient-name" value="${escapeHtml(name)}" placeholder="Full name">
    <input class="form-input live-recipient-email" value="${escapeHtml(email)}" placeholder="Email address" type="email">
    <select class="form-input live-recipient-role">
      <option value="signer" ${role === 'signer' ? 'selected' : ''}>Signer</option>
      <option value="approver" ${role === 'approver' ? 'selected' : ''}>Approver</option>
      <option value="cc" ${role === 'cc' ? 'selected' : ''}>CC</option>
    </select>
    <select class="form-input live-recipient-party">
      ${envelopePartyOptionsLive(partyKey)}
    </select>
    <button class="btn btn-ghost btn-sm" onclick="this.closest('.live-envelope-recipient-row').remove()">${icon('x')}</button>
  </div>`;
}

function addLiveEnvelopeRecipientRow() {
  document.getElementById('live-envelope-recipient-rows')?.insertAdjacentHTML('beforeend', envelopeRecipientRowLive());
  renderEnvelopeReadinessLive();
}

function refreshEnvelopeRecipientPartyOptions() {
  document.querySelectorAll('.live-envelope-recipient-row .live-recipient-party').forEach(select => {
    const previous = select.value;
    select.innerHTML = envelopePartyOptionsLive(previous);
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  });
}

async function openCreateEnvelopeModal(preselectedTemplateId = null) {
  if (!await ensureHanmakApi()) return;
  try {
    const [templatesData, documentsData] = await Promise.all([
      hanmakApi('/templates/'),
      hanmakApi('/documents/'),
    ]);
    const templates = templatesData.results || templatesData;
    const documents = documentsData.results || documentsData;
    const allowPlaceholderDocuments = Boolean(window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments);
    openModal(`
      <div class="modal modal-lg">
        <div class="modal-header">
          <div>
            <div class="modal-title">New Live Envelope</div>
            <div class="modal-subtitle">Create, attach, and optionally send through the HanMak API</div>
          </div>
          <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Envelope Name</label>
            <input id="live-envelope-name" class="form-input" value="New Vendor Agreement - ${new Date().toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}">
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
            <div class="form-group">
              <label class="form-label">Template</label>
              <select id="live-envelope-template" class="form-input">
                <option value="">Start from scratch</option>
                ${templates.map(template => {
                  const version = template.versions?.[0] || {};
                  const fields = template.fields?.length || version.field_schema?.fields?.length || 0;
                  const ready = !!(version.id && version.document && fields);
                  const parties = (version.parties || []).map(party => party.role_key).join(',');
                  return `<option value="${template.id}" data-version="${version.id || ''}" data-document="${version.document || ''}" data-fields="${fields}" data-parties="${escapeHtml(parties)}" data-ready="${ready ? '1' : ''}">${escapeHtml(template.name)}${ready ? '' : ' (setup needed)'}</option>`;
                }).join('')}
              </select>
              <div id="live-envelope-template-info" style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem">Choose a template to reuse its document and fields.</div>
            </div>
            <div class="form-group">
              <label class="form-label">Due Date</label>
              <input id="live-envelope-due-date" class="form-input" type="date" value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Message</label>
            <textarea id="live-envelope-message" class="form-input" rows="2">Please review and sign this document at your earliest convenience.</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Document Attachment</label>
            <select id="live-envelope-document-mode" class="form-input" onchange="document.getElementById('live-new-document-title-wrap').style.display=this.value==='new'?'block':'none';document.getElementById('live-existing-document-wrap').style.display=this.value==='existing'?'block':'none'">
              <option value="template">Use selected template document</option>
              ${allowPlaceholderDocuments ? '<option value="new">Create placeholder PDF document</option>' : ''}
              <option value="existing" ${documents.length ? '' : 'disabled'}>Use existing document</option>
              <option value="">No document yet</option>
            </select>
            ${allowPlaceholderDocuments ? '' : '<div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.35rem">Beta mode requires a real template or File Library document. Placeholder PDFs are disabled.</div>'}
          </div>
          <div id="live-existing-document-wrap" class="form-group" style="display:none">
            <label class="form-label">Existing Document</label>
            <select id="live-existing-document" class="form-input">
              ${documents.map(document => `<option value="${document.id}">${escapeHtml(document.title)} · ${titleCaseStatus(document.status)}</option>`).join('')}
            </select>
          </div>
          <div id="live-new-document-title-wrap" class="form-group" style="display:none">
            <input id="live-new-document-title" class="form-input" value="Agreement Placeholder.pdf" placeholder="Document title">
          </div>
          <div class="form-group">
            <label class="form-label">Recipients</label>
            <div style="display:grid;grid-template-columns:24px 1fr 1.35fr 120px 120px 34px;gap:8px;align-items:center;margin-bottom:6px;font-size:0.68rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">
              <span></span><span>Name</span><span>Email</span><span>Role</span><span>Template Party</span><span></span>
            </div>
            <div id="live-envelope-recipient-rows">
              ${envelopeRecipientRowLive('', '', 'signer', '')}
            </div>
            <button class="btn btn-ghost btn-sm" onclick="addLiveEnvelopeRecipientRow()">${icon('plus')} Add Recipient</button>
          </div>
          <div id="live-envelope-readiness" class="card" style="padding:0.85rem;margin-bottom:1rem;background:var(--bg-secondary);display:none"></div>
          <label style="display:flex;gap:0.5rem;align-items:center;font-size:0.875rem">
            <input id="live-envelope-add-signature-field" type="checkbox" checked>
            Add a default signature field for the first signer
          </label>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-secondary" onclick="createEnvelopeLiveFlow(false)">${icon('save')} Save Draft</button>
          <button class="btn btn-primary" onclick="createEnvelopeLiveFlow(true)">${icon('send')} Create & Send</button>
        </div>
      </div>
    `);
    const templateSelect = document.getElementById('live-envelope-template');
    if (preselectedTemplateId && templateSelect) templateSelect.value = String(preselectedTemplateId);
    templateSelect?.addEventListener('change', updateLiveEnvelopeTemplateInfo);
    document.getElementById('live-envelope-recipient-rows')?.addEventListener('input', renderEnvelopeReadinessLive);
    document.getElementById('live-envelope-recipient-rows')?.addEventListener('change', renderEnvelopeReadinessLive);
    updateLiveEnvelopeTemplateInfo();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateLiveEnvelopeTemplateInfo() {
  const select = document.getElementById('live-envelope-template');
  const option = select?.selectedOptions?.[0];
  const info = document.getElementById('live-envelope-template-info');
  const mode = document.getElementById('live-envelope-document-mode');
  const newTitle = document.getElementById('live-new-document-title');
  const existingWrap = document.getElementById('live-existing-document-wrap');
  if (!option || !info) return;
  const version = option.dataset.version;
  const documentId = option.dataset.document;
  const fields = option.dataset.fields || '0';
  if (!select.value) {
    info.textContent = 'Choose a template to reuse its document and fields.';
    if (mode && mode.value === 'template') mode.value = 'new';
    if (newTitle) newTitle.style.display = mode?.value === 'new' ? 'block' : 'none';
    if (existingWrap) existingWrap.style.display = mode?.value === 'existing' ? 'block' : 'none';
    const readiness = document.getElementById('live-envelope-readiness');
    if (readiness) readiness.style.display = 'none';
    refreshEnvelopeRecipientPartyOptions();
    return;
  }
  if (!option.dataset.ready) {
    info.innerHTML = `<span style="color:var(--warning)">This template needs setup before it can be used.</span> <button class="btn btn-primary btn-sm" style="margin-left:0.4rem;padding:2px 6px" onclick="editLiveTemplateInBuilder(${Number(select.value)})">${icon('edit')} Open Builder</button>`;
    if (mode) mode.value = 'new';
    if (newTitle) newTitle.style.display = 'block';
    if (existingWrap) existingWrap.style.display = 'none';
    const readiness = document.getElementById('live-envelope-readiness');
    if (readiness) readiness.style.display = 'none';
    refreshEnvelopeRecipientPartyOptions();
    return;
  }
  info.innerHTML = `Template version ${escapeHtml(version || '-')} · ${escapeHtml(fields)} field(s) · ${documentId ? `document #${escapeHtml(documentId)}` : 'no document attached'} <button class="btn btn-ghost btn-sm" style="margin-left:0.4rem;padding:2px 6px" onclick="openLiveTemplateDrawer(${Number(select.value)})">${icon('eye')} Open</button>`;
  if (mode && documentId) mode.value = 'template';
  if (newTitle) newTitle.style.display = mode?.value === 'new' ? 'block' : 'none';
  if (existingWrap) existingWrap.style.display = mode?.value === 'existing' ? 'block' : 'none';
  refreshEnvelopeRecipientPartyOptions();
  renderEnvelopeReadinessLive();
}

function collectLiveEnvelopeRecipients() {
  return [...document.querySelectorAll('.live-envelope-recipient-row')].map((row, index) => ({
    name: row.querySelector('.live-recipient-name').value.trim(),
    email: row.querySelector('.live-recipient-email').value.trim(),
    role: row.querySelector('.live-recipient-role').value,
    party_key: row.querySelector('.live-recipient-party')?.value || '',
    routing_order: index + 1,
  })).filter(recipient => recipient.name && recipient.email);
}

function placeholderPdfFile(title) {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj
4 0 obj<</Length 73>>stream
BT /F1 18 Tf 72 720 Td (${title.replace(/[()]/g, '')}) Tj ET
endstream endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000204 00000 n
trailer<</Size 5/Root 1 0 R>>
startxref
326
%%EOF`;
  return new File([pdf], title || 'agreement.pdf', {type: 'application/pdf'});
}

async function createLiveDocumentAttachment(organization, templateVersionId = null) {
  const mode = document.getElementById('live-envelope-document-mode').value;
  if (!mode) return null;
  if (mode === 'template' && templateVersionId) {
    const version = await hanmakApi(`/template-versions/${templateVersionId}/`);
    if (version.document) return version.document;
    if (!window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
      throw new Error('Selected template has no document. In beta mode, attach an existing File Library document or prepare the template in Form Builder first.');
    }
    showToast('Selected template has no document; creating placeholder instead.', 'info');
  }
  if (mode === 'existing') {
    return Number(document.getElementById('live-existing-document').value || 0) || null;
  }
  if (mode === 'new' && !window.HANMAK_FRONTEND_CONFIG?.allowPlaceholderDocuments) {
    throw new Error('Placeholder PDF documents are disabled in beta mode. Use an existing File Library document.');
  }
  const title = document.getElementById('live-new-document-title').value.trim() || 'Agreement Placeholder.pdf';
  const formData = new FormData();
  formData.append('organization', organization);
  formData.append('title', title);
  formData.append('mime_type', 'application/pdf');
  formData.append('file', placeholderPdfFile(title), title.endsWith('.pdf') ? title : `${title}.pdf`);
  const createdDocument = await hanmakApi('/documents/', {method: 'POST', body: formData});
  await hanmakApi(`/documents/${createdDocument.id}/process/`, {method: 'POST', body: JSON.stringify({page_count: 1})});
  await hanmakApi(`/documents/${createdDocument.id}/scan/`, {method: 'POST', body: JSON.stringify({})});
  return createdDocument.id;
}

function templateFieldPartyKey(field) {
  return field.party_key || field.party?.role_key || 'party-1';
}

function recipientForTemplateField(field, recipients) {
  if (!recipients?.length) return null;
  const partyKey = templateFieldPartyKey(field);
  return recipients.find(recipient => recipient.party_key === partyKey) || null;
}

function templateVersionFields(version) {
  return version?.field_schema?.fields || [];
}

async function validateTemplatePartyAssignments(templateVersionId, recipients) {
  if (!templateVersionId) return;
  const version = await hanmakApi(`/template-versions/${templateVersionId}/`);
  let fields = templateVersionFields(version);
  if (!fields.length) {
    const data = await hanmakApi('/form-fields/');
    fields = (data.results || data).filter(field => field.template_version === templateVersionId);
  }
  const requiredParties = [...new Set(fields.map(templateFieldPartyKey))].filter(Boolean);
  const assignedParties = new Set(recipients.map(recipient => recipient.party_key).filter(Boolean));
  const missing = requiredParties.filter(partyKey => !assignedParties.has(partyKey));
  if (missing.length) {
    throw new Error(`Assign a recipient to ${missing.join(', ')} before creating this envelope.`);
  }
}

async function renderEnvelopeReadinessLive() {
  const target = document.getElementById('live-envelope-readiness');
  const select = document.getElementById('live-envelope-template');
  const option = select?.selectedOptions?.[0];
  if (!target) return;
  const templateVersionId = Number(option?.dataset.version || 0) || null;
  const recipients = collectLiveEnvelopeRecipients();
  if (!templateVersionId) {
    target.style.display = 'none';
    return;
  }
  target.style.display = 'block';
  try {
    const version = await hanmakApi(`/template-versions/${templateVersionId}/`);
    let fields = templateVersionFields(version);
    if (!fields.length) {
      const data = await hanmakApi('/form-fields/');
      fields = (data.results || data).filter(field => field.template_version === templateVersionId);
    }
    const requiredParties = [...new Set(fields.map(templateFieldPartyKey))].filter(Boolean);
    const assignedParties = new Set(recipients.map(recipient => recipient.party_key).filter(Boolean));
    const duplicateParties = [...assignedParties].filter(partyKey => recipients.filter(recipient => recipient.party_key === partyKey).length > 1);
    const missingParties = requiredParties.filter(partyKey => !assignedParties.has(partyKey));
    const items = [
      {ok: fields.length > 0, label: `${fields.length} template field${fields.length === 1 ? '' : 's'} ready`},
      {ok: !missingParties.length, label: missingParties.length ? `Missing owner for ${missingParties.join(', ')}` : 'All template parties have an owner'},
      {ok: !duplicateParties.length, label: duplicateParties.length ? `Duplicate owner for ${duplicateParties.join(', ')}` : 'No party is assigned twice'},
      {ok: recipients.length > 0, label: `${recipients.length} recipient${recipients.length === 1 ? '' : 's'} entered`},
    ];
    target.innerHTML = `<div style="font-weight:800;margin-bottom:0.5rem">Envelope Readiness</div>
      <div style="display:grid;gap:0.4rem">${items.map(item => `<div style="display:flex;align-items:center;gap:0.5rem;font-size:0.8rem;color:${item.ok ? 'var(--success)' : 'var(--danger)'}">${icon(item.ok ? 'check' : 'alert-circle', 14)} <span>${escapeHtml(item.label)}</span></div>`).join('')}</div>`;
  } catch (error) {
    target.innerHTML = `<div style="color:var(--danger);font-size:0.8rem">Readiness check failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function copyTemplateFieldsToEnvelope(templateVersionId, envelope) {
  if (!templateVersionId || !envelope?.id) return 0;
  const version = await hanmakApi(`/template-versions/${templateVersionId}/`);
  let fields = templateVersionFields(version);
  if (!fields.length) {
    const data = await hanmakApi('/form-fields/');
    fields = (data.results || data)
      .filter(field => field.template_version === templateVersionId)
      .map(field => ({
        field_key: field.field_key,
        field_type: field.field_type,
        label: field.label,
        required: field.required,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        options: field.options,
        party_key: field.party?.role_key || '',
      }));
  }
  let copied = 0;
  for (const field of fields) {
    const recipient = recipientForTemplateField(field, envelope.recipients || []);
    if (!recipient) {
      throw new Error(`No recipient is assigned to ${templateFieldPartyKey(field)} for "${field.label || field.field_key || 'Field'}".`);
    }
    await hanmakApi('/form-fields/', {
      method: 'POST',
      body: JSON.stringify({
        envelope: envelope.id,
        recipient: recipient?.id || null,
        field_key: field.field_key || `${field.field_type}-${copied + 1}`,
        field_type: field.field_type || 'text',
        label: field.label || 'Field',
        required: field.required !== false,
        page: field.page || 1,
        x: field.x || 0,
        y: field.y || 0,
        width: field.width || 160,
        height: field.height || 32,
        options: field.options || [],
      }),
    });
    copied += 1;
  }
  return copied;
}

async function createEnvelopeLiveFlow(sendNow) {
  try {
    const name = document.getElementById('live-envelope-name').value.trim();
    if (!name) return showToast('Envelope name is required', 'error');
    const recipients = collectLiveEnvelopeRecipients();
    if (!recipients.length) return showToast('Add at least one recipient', 'error');
    const organization = await firstOrganizationId();
    const templateSelect = document.getElementById('live-envelope-template');
    const template = Number(templateSelect.value || 0) || null;
    const selectedTemplateOption = templateSelect.selectedOptions[0];
    const templateVersion = Number(selectedTemplateOption?.dataset.version || 0) || null;
    if (template && !selectedTemplateOption?.dataset.ready) {
      return showToast('This template needs setup before it can create a real signing envelope. Open it in Builder or click Setup on the Templates page.', 'error', 7000);
    }
    const duplicateParty = recipients.find((recipient, index) => recipient.party_key && recipients.some((other, otherIndex) => otherIndex !== index && other.party_key === recipient.party_key));
    if (duplicateParty) return showToast(`${duplicateParty.party_key} is assigned to more than one recipient. Each template party can only have one active owner.`, 'error', 7000);
    if (templateVersion) await validateTemplatePartyAssignments(templateVersion, recipients);
    if (templateVersion) {
      const envelope = await hanmakApi('/envelopes/create_from_template/', {
        method: 'POST',
        body: JSON.stringify({
          organization,
          template_version: templateVersion,
          name,
          message: document.getElementById('live-envelope-message').value,
          due_date: document.getElementById('live-envelope-due-date').value || null,
          send: sendNow,
          recipients,
        }),
      });
      const fieldCount = envelope.fields?.length || Number(selectedTemplateOption?.dataset.fields || 0) || 0;
      showToast(`Envelope ${sendNow ? 'created and sent' : 'draft created'} from template with ${fieldCount} field(s)`, 'success');
      closeModal();
      navigate('envelopes');
      setTimeout(() => openLiveEnvelopeDrawer(envelope.id), 500);
      return;
    }
    const recipientPayload = recipients.map(({party_key, ...recipient}) => recipient);
    const envelope = await hanmakApi('/envelopes/', {
      method: 'POST',
      body: JSON.stringify({
        organization,
        template,
        template_version: templateVersion,
        name,
        message: document.getElementById('live-envelope-message').value,
        due_date: document.getElementById('live-envelope-due-date').value || null,
        recipients: recipientPayload,
      }),
    });
    const envelopeRecipients = (envelope.recipients || []).map((recipient, index) => ({
      ...recipient,
      party_key: recipients[index]?.party_key || '',
    }));
    const envelopeWithPartyAssignments = {...envelope, recipients: envelopeRecipients};
    const documentId = await createLiveDocumentAttachment(organization, templateVersion);
    if (documentId) {
      await hanmakApi('/envelope-documents/', {
        method: 'POST',
        body: JSON.stringify({envelope: envelope.id, document: documentId, order: 1}),
      });
    }
    const copiedTemplateFields = await copyTemplateFieldsToEnvelope(templateVersion, envelopeWithPartyAssignments);
    if (!copiedTemplateFields && document.getElementById('live-envelope-add-signature-field').checked && envelope.recipients?.length) {
      const firstSigner = envelope.recipients.find(recipient => recipient.role === 'signer') || envelope.recipients[0];
      await hanmakApi('/form-fields/', {
        method: 'POST',
        body: JSON.stringify({
          envelope: envelope.id,
          recipient: firstSigner.id,
          field_type: 'signature',
          field_key: 'signature',
          label: 'Signature',
          required: true,
          page: 1,
          x: 130,
          y: 1040,
          width: 358,
          height: 104,
          page_width: HANMAK_CANONICAL_PAGE_WIDTH,
          page_height: HANMAK_DEFAULT_PAGE_HEIGHT,
          coordinate_basis: 'page-pixels',
        }),
      });
    }
    if (sendNow) {
      const sent = await hanmakApi(`/envelopes/${envelope.id}/send/`, {method: 'POST', body: JSON.stringify({})});
      showToast(`Envelope created with ${copiedTemplateFields || 1} field(s) and sent. ${sent.queued_email_count || 0} email queued.`, 'success');
    } else {
      showToast(`Envelope draft created with ${copiedTemplateFields || 1} field(s)`, 'success');
    }
    closeModal();
    navigate('envelopes');
    setTimeout(() => openLiveEnvelopeDrawer(envelope.id), 500);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

registerPage('retention', () => `
<div class="page-header">
  <div><h1 class="page-title">Retention Policies</h1><p class="page-subtitle">Live retention windows and disposition actions</p></div>
  <button class="btn btn-primary" onclick="openCreateRetentionModal()">${icon('plus')} New Policy</button>
</div>
<div id="live-retention-policies"></div>
`);

async function retention_init() {
  if (!await ensureHanmakApi()) return;
  const data = await hanmakApi('/retention-policies/');
  const rows = data.results || data;
  document.getElementById('live-retention-policies').innerHTML = liveTable(['Policy', 'Applies To', 'Filter', 'Retention', 'Action', 'Active', ''], rows.map(policy => `
    <tr>
      <td><strong>${escapeHtml(policy.name)}</strong></td>
      <td>${escapeHtml(policy.applies_to)}</td>
      <td>${escapeHtml(policy.status_filter || '-')}</td>
      <td>${policy.retention_days} days</td>
      <td>${escapeHtml(policy.action)}</td>
      <td>${policy.is_active ? liveBadge('active') : liveBadge('inactive')}</td>
      <td style="display:flex;gap:4px">
        <button class="btn btn-ghost btn-sm" onclick="toggleRetentionPolicyLive(${policy.id},${!policy.is_active})" title="${policy.is_active ? 'Deactivate' : 'Activate'}">${icon(policy.is_active ? 'toggle-right' : 'toggle-left')}</button>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteRetentionPolicyLive(${policy.id},'${escapeHtml(policy.name).replace(/'/g,"\\'")}')" title="Delete">${icon('trash')}</button>
      </td>
    </tr>
  `), 'No retention policies found');
}

async function toggleRetentionPolicyLive(id, activate) {
  try {
    await hanmakApi(`/retention-policies/${id}/`, {method: 'PATCH', body: JSON.stringify({is_active: activate})});
    showToast(`Policy ${activate ? 'activated' : 'deactivated'}`, 'success');
    retention_init();
  } catch (error) {
    showToast(error.message || 'Update failed', 'error');
  }
}

async function deleteRetentionPolicyLive(id, name) {
  confirm(`Delete retention policy "${name}"? This cannot be undone.`, async () => {
    try {
      await hanmakApi(`/retention-policies/${id}/`, {method: 'DELETE'});
      showToast('Retention policy deleted', 'success');
      retention_init();
    } catch (error) {
      showToast(error.message || 'Delete failed', 'error');
    }
  });
}

function openCreateRetentionModal() {
  openModal(`<div class="modal"><div class="modal-header"><div class="modal-title">New Retention Policy</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Name</label><input id="new-retention-name" class="form-input" value="Draft Envelopes - 90 Days"></div><div class="form-group"><label class="form-label">Status Filter</label><input id="new-retention-filter" class="form-input" value="draft"></div><div class="form-group"><label class="form-label">Retention Days</label><input id="new-retention-days" class="form-input" type="number" value="90"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createRetentionLive()">${icon('plus')} Create</button></div></div>`);
}

async function createRetentionLive() {
  try {
    const organization = await firstOrganizationId();
    await hanmakApi('/retention-policies/', {method: 'POST', body: JSON.stringify({organization, name: document.getElementById('new-retention-name').value, applies_to: 'envelopes', status_filter: document.getElementById('new-retention-filter').value, retention_days: Number(document.getElementById('new-retention-days').value), action: 'archive', is_active: true})});
    closeModal();
    showToast('Retention policy created', 'success');
    retention_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

registerPage('data-residency', () => `<div class="page-header"><div><h1 class="page-title">Data Residency</h1><p class="page-subtitle">Live region catalog, organization policy, and backend enforcement</p></div><button class="btn btn-ghost" onclick="data_residency_init()">${icon('refresh')} Refresh</button></div><div id="live-data-residency"></div>`);

async function data_residency_init() {
  if (!await ensureHanmakApi()) return;
  const [regionsData, policiesData, summaryData, settingsData] = await Promise.all([
    hanmakApi('/data-residency-regions/'),
    hanmakApi('/data-residency-policies/'),
    hanmakApi('/data-residency-policies/summary/'),
    hanmakApi('/app-settings/?namespace=compliance'),
  ]);
  const regions = regionsData.results || regionsData;
  const policies = policiesData.results || policiesData;
  const settings = settingsData.results || settingsData;
  const enforcement = settings.find(setting => setting.namespace === 'compliance' && setting.key === 'data_residency');
  const enforcementValue = enforcement?.value || {};
  const requirePolicy = Boolean(enforcementValue.require_policy);
  document.getElementById('live-data-residency').innerHTML = `
    <div class="stats-grid" style="--cols:4;margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">Policies</div><div class="stat-value">${summaryData.total || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Blocking</div><div class="stat-value" style="color:var(--danger)">${summaryData.blocking || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Log Only</div><div class="stat-value">${summaryData.log_only || 0}</div></div>
      <div class="stat-card"><div class="stat-label">Unavailable Regions</div><div class="stat-value" style="color:${summaryData.unavailable_primary_regions ? 'var(--danger)' : 'var(--success)'}">${summaryData.unavailable_primary_regions || 0}</div></div>
    </div>
    <div class="card" style="padding:1rem;margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap">
        <div>
          <div style="font-weight:700;margin-bottom:0.25rem">Backend Enforcement</div>
          <div style="font-size:0.8125rem;color:var(--text-muted)">When enabled, new documents and envelopes must have an organization residency policy before creation.</div>
        </div>
        <div class="flex gap-2" style="align-items:center">
          ${liveBadge(requirePolicy ? 'required' : 'monitoring')}
          <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem">
            <input id="data-residency-require-policy" type="checkbox" ${requirePolicy ? 'checked' : ''}>
            Require policy before creation
          </label>
          <button class="btn btn-primary btn-sm" onclick="saveDataResidencyEnforcement(${enforcement ? enforcement.id : 'null'})">${icon('save')} Save</button>
        </div>
      </div>
      <div id="data-residency-enforcement-result" style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.75rem">${enforcement ? `Updated ${apiDate(enforcement.updated_at)}` : 'No enforcement setting saved yet'}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      ${liveTable(['Region', 'Countries', 'Backend', 'Available'], regions.map(region => `<tr><td><strong>${escapeHtml(region.name)}</strong><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(region.code)}</div></td><td>${escapeHtml((region.country_codes || []).join(', '))}</td><td>${escapeHtml(region.storage_backend || '-')}</td><td>${region.is_available ? liveBadge('available') : liveBadge('unavailable')}</td></tr>`), 'No regions found')}
      ${liveTable(['Organization', 'Primary Region', 'Mode', 'Updated'], policies.map(policy => `<tr><td>#${policy.organization}</td><td>${escapeHtml(policy.primary_region_name || policy.primary_region)}</td><td>${liveBadge(policy.enforcement_mode)}</td><td>${apiDate(policy.updated_at)}</td></tr>`), 'No policies found')}
    </div>`;
}

async function saveDataResidencyEnforcement(settingId) {
  const target = document.getElementById('data-residency-enforcement-result');
  const requirePolicy = document.getElementById('data-residency-require-policy')?.checked || false;
  const payload = {
    organization: null,
    namespace: 'compliance',
    key: 'data_residency',
    value: {require_policy: requirePolicy},
    is_secret: false,
  };
  try {
    if (target) target.textContent = 'Saving...';
    if (settingId) {
      await hanmakApi(`/app-settings/${settingId}/`, {method: 'PATCH', body: JSON.stringify({value: payload.value})});
    } else {
      await hanmakApi('/app-settings/', {method: 'POST', body: JSON.stringify(payload)});
    }
    showToast('Data residency enforcement updated', 'success');
    await data_residency_init();
  } catch (error) {
    if (target) target.textContent = error.message;
    showToast(error.message, 'error');
  }
}

registerPage('compliance-exports', () => `<div class="page-header"><div><h1 class="page-title">Compliance Exports</h1><p class="page-subtitle">Live audit and evidence export queue</p></div><button class="btn btn-primary" onclick="openCreateComplianceExportModal()">${icon('download')} Queue Export</button></div><div id="live-compliance-exports"></div>`);

async function compliance_exports_init() {
  if (!await ensureHanmakApi()) return;
  const data = await hanmakApi('/compliance-exports/');
  const rows = data.results || data;
  document.getElementById('live-compliance-exports').innerHTML = liveTable(['Export', 'Status', 'Date Range', 'Requested', 'File'], rows.map(item => `<tr><td><strong>${titleCaseStatus(item.export_type)}</strong></td><td>${liveBadge(item.status)}</td><td>${item.date_from || '-'} to ${item.date_to || '-'}</td><td>${apiDate(item.created_at)}</td><td>${item.file ? `<a href="${item.file}" target="_blank">Open</a>` : '-'}</td></tr>`), 'No exports queued');
}

function openCreateComplianceExportModal() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Queue Compliance Export</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Export Type</label>
        <select id="export-type" class="form-input">
          <option value="audit">Audit Log</option>
          <option value="envelopes">Envelopes</option>
          <option value="signatures">Signatures</option>
          <option value="users">Users</option>
          <option value="full">Full Archive</option>
        </select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        <div class="form-group"><label class="form-label">Date From</label><input id="export-date-from" type="date" class="form-input"></div>
        <div class="form-group"><label class="form-label">Date To</label><input id="export-date-to" type="date" class="form-input"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="createComplianceExportLive()">${icon('download')} Queue Export</button>
    </div>
  `);
}

async function createComplianceExportLive() {
  try {
    const organization = await firstOrganizationId();
    const export_type = document.getElementById('export-type')?.value || 'audit';
    const date_from = document.getElementById('export-date-from')?.value || null;
    const date_to = document.getElementById('export-date-to')?.value || null;
    await hanmakApi('/compliance-exports/', {method: 'POST', body: JSON.stringify({organization, export_type, date_from, date_to, status: 'queued'})});
    closeModal();
    showToast('Compliance export queued', 'success');
    compliance_exports_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function settingsLoadNamespace(namespace, targetId) {
  if (!await ensureHanmakApi()) return;
  const data = await hanmakApi(`/app-settings/?namespace=${encodeURIComponent(namespace)}`);
  const rows = (data.results || data).filter(item => item.namespace === namespace);
  const target = document.getElementById(targetId);
  if (!target) return;
  target.innerHTML = rows.map(setting => `<div class="card" style="padding:1rem;margin-bottom:0.75rem"><div style="display:flex;justify-content:space-between"><strong>${escapeHtml(setting.key)}</strong><span style="font-size:0.75rem;color:var(--text-muted)">${apiDate(setting.updated_at)}</span></div><pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:0.75rem;border-radius:6px;margin-top:0.75rem;font-size:0.75rem">${escapeHtml(JSON.stringify(setting.value, null, 2))}</pre></div>`).join('') || '<div class="empty-state"><div class="empty-state-title">No live settings found</div></div>';
}

function liveSettingsPage(title, subtitle, namespace, targetId) {
  return `
  <div class="page-header">
    <div><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>
    <div class="flex gap-2">
      <button class="btn btn-ghost" onclick="settingsLoadNamespace('${namespace}', '${targetId}')">${icon('refresh')} Refresh</button>
      <button class="btn btn-primary" onclick="openCreateSettingModal('${namespace}', '${targetId}')">${icon('plus')} New Setting</button>
    </div>
  </div>
  <div class="card" style="padding:1rem;margin-bottom:1rem">
    <div style="font-size:0.8125rem;color:var(--text-muted)">Namespace</div>
    <div style="font-size:1.125rem;font-weight:700">${namespace}</div>
  </div>
  <div id="${targetId}"></div>`;
}

registerPage('settings-email', () => `
  <div class="page-header">
    <div><h1 class="page-title">Email / SMTP</h1><p class="page-subtitle">Use your own SMTP server for signer, signee, approver, reminder, and test emails</p></div>
    <button class="btn btn-ghost" onclick="settings_email_init()">${icon('refresh')} Refresh</button>
  </div>
  <div style="display:grid;grid-template-columns:minmax(0,1.1fr) minmax(320px,0.9fr);gap:1rem;align-items:start">
    <div class="card" style="padding:1rem">
      <div style="font-weight:700;margin-bottom:0.75rem">SMTP Settings</div>
      <div style="display:grid;grid-template-columns:1fr 110px;gap:0.75rem">
        <div class="form-group"><label class="form-label">SMTP Host</label><input id="smtp-host" class="form-input" value="mailhog" placeholder="smtp.gmail.com"></div>
        <div class="form-group"><label class="form-label">Port</label><input id="smtp-port" class="form-input" type="number" value="1025"></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        <div class="form-group"><label class="form-label">Username</label><input id="smtp-username" class="form-input" autocomplete="username"></div>
        <div class="form-group"><label class="form-label">Password / App Password</label><input id="smtp-password" class="form-input" type="password" autocomplete="current-password"></div>
      </div>
      <div class="form-group"><label class="form-label">From Email</label><input id="smtp-from-email" class="form-input" value="no-reply@hanmak.local" placeholder="no-reply@example.com"></div>
      <div style="display:flex;gap:1rem;margin-bottom:1rem">
        <label class="checkbox-wrap"><input id="smtp-use-tls" type="checkbox"><span class="checkbox-label">Use TLS</span></label>
        <label class="checkbox-wrap"><input id="smtp-use-ssl" type="checkbox"><span class="checkbox-label">Use SSL</span></label>
      </div>
      <div style="display:flex;gap:0.5rem;justify-content:flex-end">
        <button class="btn btn-primary" onclick="saveSmtpSettingsLive()">${icon('save')} Save SMTP</button>
      </div>
    </div>
    <div class="card" style="padding:1rem">
      <div style="font-weight:700;margin-bottom:0.75rem">Send Test Email</div>
      <div class="form-group"><label class="form-label">Recipient</label><input id="smtp-test-to" class="form-input" type="email" placeholder="you@example.com"></div>
      <button class="btn btn-success w-full" onclick="sendSmtpTestLive()" style="justify-content:center">${icon('send')} Send Test</button>
      <div id="smtp-current-settings" style="margin-top:1rem"></div>
    </div>
  </div>
  <div class="card" style="padding:1rem;margin-top:1rem">
    <div style="display:flex;justify-content:space-between;gap:1rem;align-items:center;margin-bottom:0.75rem">
      <div>
        <div style="font-weight:700">Email Templates</div>
        <div style="font-size:0.8125rem;color:var(--text-muted)">Override invite, reminder, completion, and setup email content with placeholders.</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openEmailTemplateModal()">${icon('plus')} New Template</button>
    </div>
    <div id="live-email-templates"></div>
  </div>
  <div style="margin-top:1rem" id="live-settings-email"></div>
`);

function openCreateSettingModal(namespace, targetId) {
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">New ${titleCaseStatus(namespace)} Setting</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div>
      <div class="modal-body">
        <input id="new-setting-target" type="hidden" value="${targetId}">
        <div class="form-group"><label class="form-label">Key</label><input id="new-setting-key" class="form-input" value="default"></div>
        <div class="form-group"><label class="form-label">JSON Value</label><textarea id="new-setting-value" class="form-input" rows="5">{"enabled": true}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createSettingLive('${namespace}')">${icon('plus')} Create</button></div>
    </div>
  `);
}

async function createSettingLive(namespace) {
  try {
    const organization = await firstOrganizationId();
    const targetId = document.getElementById('new-setting-target').value;
    const value = JSON.parse(document.getElementById('new-setting-value').value || '{}');
    await hanmakApi('/app-settings/', {
      method: 'POST',
      body: JSON.stringify({organization, namespace, key: document.getElementById('new-setting-key').value, value, is_secret: false}),
    });
    closeModal();
    showToast('Setting created', 'success');
    await settingsLoadNamespace(namespace, targetId);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function currentSmtpSettingLive() {
  const data = await hanmakApi('/app-settings/?namespace=email');
  const rows = (data.results || data).filter(item => item.namespace === 'email' && item.key === 'smtp');
  return rows[0] || null;
}

function smtpSettingsFromFormLive() {
  return {
    host: document.getElementById('smtp-host').value.trim(),
    port: Number(document.getElementById('smtp-port').value || 587),
    username: document.getElementById('smtp-username').value.trim(),
    password: document.getElementById('smtp-password').value,
    from_email: document.getElementById('smtp-from-email').value.trim(),
    use_tls: document.getElementById('smtp-use-tls').checked,
    use_ssl: document.getElementById('smtp-use-ssl').checked,
    timeout: 20,
  };
}

function fillSmtpSettingsLive(value) {
  const set = (id, prop = 'value') => {
    const el = document.getElementById(id);
    if (el) el[prop] = value[id.replace('smtp-', '').replaceAll('-', '_')] ?? el[prop];
  };
  set('smtp-host');
  set('smtp-port');
  set('smtp-username');
  set('smtp-password');
  set('smtp-from-email');
  const tls = document.getElementById('smtp-use-tls');
  const ssl = document.getElementById('smtp-use-ssl');
  if (tls) tls.checked = !!value.use_tls;
  if (ssl) ssl.checked = !!value.use_ssl;
}

async function saveSmtpSettingsLive() {
  try {
    if (!await ensureHanmakApi()) return;
    const organization = await firstOrganizationId();
    const value = smtpSettingsFromFormLive();
    if (!value.host) return showToast('SMTP host is required', 'error');
    if (!value.from_email) return showToast('From email is required', 'error');
    if (value.use_tls && value.use_ssl) return showToast('Choose TLS or SSL, not both', 'error');
    const existing = await currentSmtpSettingLive();
    if (existing) {
      await hanmakApi(`/app-settings/${existing.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({value, is_secret: true}),
      });
    } else {
      await hanmakApi('/app-settings/', {
        method: 'POST',
        body: JSON.stringify({organization, namespace: 'email', key: 'smtp', value, is_secret: true}),
      });
    }
    showToast('SMTP settings saved', 'success');
    await settings_email_init();
  } catch (error) {
    showToast(`SMTP save failed: ${error.message}`, 'error', 6000);
  }
}

async function sendSmtpTestLive() {
  try {
    if (!await ensureHanmakApi()) return;
    const organization = await firstOrganizationId();
    const toEmail = document.getElementById('smtp-test-to').value.trim();
    if (!toEmail) return showToast('Enter a test recipient email', 'error');
    await hanmakApi('/email-messages/test_smtp/', {
      method: 'POST',
      body: JSON.stringify({organization, to_email: toEmail}),
    });
    showToast(`Test email sent to ${toEmail}`, 'success', 6000);
  } catch (error) {
    showToast(`SMTP test failed: ${error.message}`, 'error', 8000);
  }
}

async function settings_email_init() {
  if (!await ensureHanmakApi()) return;
  const setting = await currentSmtpSettingLive();
  if (setting?.value) fillSmtpSettingsLive(setting.value);
  await loadEmailTemplatesLive();
  await settingsLoadNamespace('email', 'live-settings-email');
  const current = document.getElementById('smtp-current-settings');
  if (current) {
    current.innerHTML = setting?.value?.host
      ? `<div class="alert alert-success">${icon('check')} SMTP saved for ${escapeHtml(setting.value.host)}:${escapeHtml(String(setting.value.port || ''))}</div>`
      : `<div class="alert alert-warning">${icon('alert-circle')} No custom SMTP saved yet. Emails will use the default development backend.</div>`;
  }
}

async function loadEmailTemplatesLive() {
  const target = document.getElementById('live-email-templates');
  if (!target) return;
  const data = await hanmakApi('/email-templates/');
  const rows = data.results || data;
  target.innerHTML = liveTable(['Template', 'Kind', 'Subject', 'Active', 'Actions'], rows.map(template => `
    <tr>
      <td><strong>${escapeHtml(template.name)}</strong><div style="font-size:0.75rem;color:var(--text-muted)">#${template.id}</div></td>
      <td>${liveBadge(template.kind)}</td>
      <td>${escapeHtml(template.subject_template)}</td>
      <td>${template.is_active ? liveBadge('active') : liveBadge('inactive')}</td>
      <td><div class="flex gap-1"><button class="btn btn-ghost btn-sm" onclick="openEmailTemplateModal(${template.id})">${icon('edit')} Edit</button><button class="btn btn-ghost btn-sm" onclick="previewEmailTemplateLive(${template.id})">${icon('eye')} Preview</button></div></td>
    </tr>
  `), 'No email templates configured');
}

async function openEmailTemplateModal(templateId = null) {
  const organization = await firstOrganizationId();
  let template = {
    organization,
    kind: 'envelope_invite',
    name: 'Signer Invite',
    subject_template: 'Please sign {{ envelope_name }}',
    body_template: 'Hello {{ recipient_name }},\\n\\nPlease open {{ signing_url }} to complete {{ envelope_name }}.',
    html_template: '<p>Hello {{ recipient_name }},</p><p>Please open <a href="{{ signing_url }}">this secure link</a> to complete {{ envelope_name }}.</p>',
    is_active: true,
  };
  if (templateId) template = await hanmakApi(`/email-templates/${templateId}/`);
  openModal(`
    <div class="modal">
      <div class="modal-header"><div class="modal-title">${templateId ? 'Edit' : 'New'} Email Template</div><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <input id="email-template-id" type="hidden" value="${templateId || ''}">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Name</label><input id="email-template-name" class="form-input" value="${escapeHtml(template.name || '')}"></div>
          <div class="form-group"><label class="form-label">Kind</label><select id="email-template-kind" class="form-input">
            ${['invitation','envelope_invite','reminder','completed'].map(kind => `<option value="${kind}" ${template.kind === kind ? 'selected' : ''}>${titleCaseStatus(kind)}</option>`).join('')}
          </select></div>
        </div>
        <div class="form-group"><label class="form-label">Subject</label><input id="email-template-subject" class="form-input" value="${escapeHtml(template.subject_template || '')}"></div>
        <div class="form-group"><label class="form-label">Text Body</label><textarea id="email-template-body" class="form-input" rows="5">${escapeHtml(template.body_template || '')}</textarea></div>
        <div class="form-group"><label class="form-label">HTML Body</label><textarea id="email-template-html" class="form-input" rows="6">${escapeHtml(template.html_template || '')}</textarea></div>
        <label class="checkbox-wrap"><input id="email-template-active" type="checkbox" ${template.is_active ? 'checked' : ''}><span class="checkbox-label">Active</span></label>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.75rem">Placeholders: {{ envelope_name }}, {{ recipient_name }}, {{ recipient_email }}, {{ sender_name }}, {{ due_date }}, {{ signing_url }}, {{ brand_name }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="saveEmailTemplateLive()">${icon('save')} Save</button>
      </div>
    </div>
  `);
}

async function saveEmailTemplateLive() {
  try {
    const id = document.getElementById('email-template-id').value;
    const payload = {
      organization: await firstOrganizationId(),
      name: document.getElementById('email-template-name').value.trim(),
      kind: document.getElementById('email-template-kind').value,
      subject_template: document.getElementById('email-template-subject').value.trim(),
      body_template: document.getElementById('email-template-body').value,
      html_template: document.getElementById('email-template-html').value,
      is_active: document.getElementById('email-template-active').checked,
    };
    if (!payload.name || !payload.subject_template || !payload.body_template) return showToast('Name, subject, and text body are required', 'error');
    if (id) await hanmakApi(`/email-templates/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)});
    else await hanmakApi('/email-templates/', {method: 'POST', body: JSON.stringify(payload)});
    closeModal();
    showToast('Email template saved', 'success');
    await loadEmailTemplatesLive();
  } catch (error) {
    showToast(error.message, 'error', 7000);
  }
}

async function previewEmailTemplateLive(id) {
  try {
    const preview = await hanmakApi(`/email-templates/${id}/preview/`, {method: 'POST', body: JSON.stringify({})});
    openModal(`
      <div class="modal">
        <div class="modal-header"><div class="modal-title">Email Template Preview</div><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <div style="font-weight:700;margin-bottom:0.5rem">${escapeHtml(preview.subject)}</div>
          <pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:0.75rem;border-radius:6px;font-size:0.8125rem">${escapeHtml(preview.body)}</pre>
          ${preview.html_body ? `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-weight:700">HTML</summary><iframe style="width:100%;height:280px;border:1px solid var(--border);border-radius:6px;margin-top:0.5rem;background:white" srcdoc="${preview.html_body.replaceAll('"', '&quot;')}"></iframe></details>` : ''}
        </div>
      </div>
    `);
  } catch (error) {
    showToast(error.message, 'error');
  }
}


document.addEventListener('DOMContentLoaded', () => {
  injectAuthButton();
  const params = new URLSearchParams(location.search);
  const token = params.get('token');
  if (token && !params.get('page')) navigate('public-signing', {token});
});

// ── SCIM Connection CRUD ───────────────────────────────────────────────────

async function sso_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  if (typeof loadSSOConnections === 'function') await loadSSOConnections();
  await loadSCIMConnection();
}

function switchSSOTab(tab, el) {
  document.querySelectorAll('[id^="sso-"]').forEach(t => t.style.display = 'none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('sso-' + tab);
  if (target) target.style.display = 'block';
  el.classList.add('active');
  if (tab === 'scim') loadSCIMConnection();
}

async function loadSCIMConnection() {
  const panel = document.getElementById('scim-live-panel');
  if (!panel) return;
  if (!await ensureHanmakApi()) { panel.innerHTML = '<div class="empty-state"><div class="empty-state-title">Connect API to manage SCIM</div></div>'; return; }
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/scim-connections/?organization=${orgId}`);
    const connections = data.results || data;
    const conn = connections[0];
    if (conn) {
      localStorage.setItem('HANMAK_SCIM_CONNECTION_ID', conn.id);
      panel.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr auto;align-items:center;gap:0.5rem;margin-bottom:1rem">
          <div style="font-weight:700">SCIM Connection</div>
          <span class="badge badge-${conn.is_enabled ? 'success' : 'secondary'}">${conn.is_enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <div class="form-group"><label class="form-label">Base URL</label><input id="scim-base-url" class="form-input" value="${escapeHtml(conn.base_url || '')}"></div>
        <div style="padding:0.75rem 0;border-bottom:1px solid var(--border);margin-bottom:0.75rem">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Bearer Token Prefix</div>
          <code style="font-family:var(--font-mono)">${escapeHtml(conn.token_prefix || '(none — rotate to generate)')}</code>
        </div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="saveSCIMConnectionLive(${conn.id})">${icon('save')} Save</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleSCIMConnectionLive(${conn.id}, ${!conn.is_enabled})">${icon(conn.is_enabled ? 'toggle-right' : 'toggle-left')} ${conn.is_enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-ghost btn-sm" onclick="rotateSCIMTokenLive(${conn.id})">${icon('rotate')} Rotate Token</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteSCIMConnectionLive(${conn.id})">${icon('trash')} Delete</button>
        </div>`;
    } else {
      panel.innerHTML = `
        <div class="empty-state" style="padding:1.5rem 0">
          <div class="empty-state-title">No SCIM connection</div>
          <div class="empty-state-desc">Create a SCIM 2.0 connection to sync users and groups from your IdP.</div>
        </div>
        <button class="btn btn-primary" onclick="createSCIMConnectionLive()">${icon('plus')} Create SCIM Connection</button>`;
    }
  } catch (error) {
    panel.innerHTML = `<div style="color:var(--danger);font-size:0.875rem">Failed to load SCIM connection: ${escapeHtml(error.message)}</div>`;
  }
}

async function createSCIMConnectionLive() {
  const orgId = await firstOrganizationId();
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Create SCIM Connection</h3><button class="modal-close" onclick="closeModal()">×</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Base URL <span style="color:var(--text-muted);font-size:0.75rem">(leave blank to use HanMak default)</span></label>
        <input id="new-scim-base-url" class="form-input" placeholder="https://your-idp.example.com/scim/v2"></div>
      <label class="checkbox-wrap" style="margin-top:0.5rem"><input id="new-scim-enabled" type="checkbox" checked><span class="checkbox-label">Enable immediately</span></label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_doCreateSCIMConnection(${orgId})">${icon('plus')} Create</button>
    </div>
  `);
}

async function _doCreateSCIMConnection(orgId) {
  try {
    const conn = await hanmakApi('/scim-connections/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        base_url: document.getElementById('new-scim-base-url')?.value.trim() || '',
        is_enabled: document.getElementById('new-scim-enabled')?.checked ?? true,
        config: {},
      }),
    });
    closeModal();
    showToast('SCIM connection created', 'success');
    await loadSCIMConnection();
    if (conn.id) rotateSCIMTokenLive(conn.id);
  } catch (error) {
    showToast(error.message || 'Create failed', 'error');
  }
}

async function saveSCIMConnectionLive(id) {
  try {
    const base_url = document.getElementById('scim-base-url')?.value.trim() || '';
    await hanmakApi(`/scim-connections/${id}/`, {method: 'PATCH', body: JSON.stringify({base_url})});
    showToast('SCIM connection saved', 'success');
    loadSCIMConnection();
  } catch (error) {
    showToast(error.message || 'Save failed', 'error');
  }
}

async function toggleSCIMConnectionLive(id, enable) {
  try {
    await hanmakApi(`/scim-connections/${id}/`, {method: 'PATCH', body: JSON.stringify({is_enabled: enable})});
    showToast(`SCIM ${enable ? 'enabled' : 'disabled'}`, 'success');
    loadSCIMConnection();
  } catch (error) {
    showToast(error.message || 'Toggle failed', 'error');
  }
}

async function rotateSCIMTokenLive(id) {
  try {
    const result = await hanmakApi(`/scim-connections/${id}/rotate-token/`, {method: 'POST', body: JSON.stringify({})});
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('key')} New SCIM Bearer Token</h3><button class="modal-close" onclick="closeModal()">×</button></div>
      <div class="modal-body">
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:1rem">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">Copy this token now — it will not be shown again.</div>
          <code id="scim-token-display" style="word-break:break-all;font-family:var(--font-mono);font-size:0.875rem">${escapeHtml(result.token)}</code>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${escapeHtml(result.token)}');showToast('Copied!','success')">${icon('copy')} Copy Token</button>
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal();loadSCIMConnection()">Done</button></div>
    `);
  } catch (error) {
    showToast(error.message || 'Token rotation failed', 'error');
  }
}

async function deleteSCIMConnectionLive(id) {
  confirm('Delete this SCIM connection? All synced external identities will be removed.', async () => {
    try {
      await hanmakApi(`/scim-connections/${id}/`, {method: 'DELETE'});
      showToast('SCIM connection deleted', 'success');
      loadSCIMConnection();
    } catch (error) {
      showToast(error.message || 'Delete failed', 'error');
    }
  });
}
