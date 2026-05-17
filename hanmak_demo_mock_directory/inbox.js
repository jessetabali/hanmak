registerPage('inbox', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">My Inbox</h1>
    <p class="page-subtitle">Tasks and documents waiting for your action</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="markAllRead()">Mark all read</button>
    <button class="btn btn-primary" onclick="inbox_init()">${icon('refresh')} Refresh</button>
  </div>
</div>

<div class="stats-grid" style="--cols:4;margin-bottom:1.5rem">
  <div class="stat-card">
    <div class="stat-label">Pending Signatures</div>
    <div id="inbox-sign-count" class="stat-value">—</div>
    <div class="stat-delta delta-up">+2 since yesterday</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Pending Approvals</div>
    <div id="inbox-approval-count" class="stat-value">—</div>
    <div class="stat-delta delta-neutral">No change</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Overdue</div>
    <div id="inbox-failed-count" class="stat-value" style="color:var(--danger)">—</div>
    <div class="stat-delta delta-down">+1 since yesterday</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Completed Today</div>
    <div id="inbox-total-count" class="stat-value">—</div>
    <div class="stat-delta delta-up">+5</div>
  </div>
</div>

<div class="card" style="margin-bottom:1rem">
  <div class="card-header" style="padding-bottom:0;border-bottom:none">
    <div class="tabs">
      <button class="tab active" onclick="filterInbox('all',this)">All <span id="inbox-tab-all" class="badge badge-primary" style="margin-left:4px">—</span></button>
      <button class="tab" onclick="filterInbox('sign',this)">Sign <span id="inbox-tab-sign" class="badge" style="margin-left:4px">—</span></button>
      <button class="tab" onclick="filterInbox('approve',this)">Approve <span id="inbox-tab-approve" class="badge" style="margin-left:4px">—</span></button>
      <button class="tab" onclick="filterInbox('task',this)">Tasks <span id="inbox-tab-task" class="badge" style="margin-left:4px">—</span></button>
      <button class="tab" onclick="filterInbox('complete',this)">Completed</button>
    </div>
    <div class="flex gap-2" style="margin-left:auto;padding-bottom:0.75rem">
      <input id="inbox-search" class="form-input" placeholder="Search tasks..." style="width:220px" oninput="renderInboxLive()">
      <select id="inbox-work-type-filter" class="form-input" style="width:150px" onchange="renderInboxLive()">
        <option value="">All Work</option>
        <option value="document">Documents</option>
        <option value="task">System Tasks</option>
      </select>
      <select id="inbox-priority-filter" class="form-input" style="width:150px" onchange="renderInboxLive()">
        <option value="">All Priorities</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>
    </div>
  </div>
  <div id="inbox-bulk-toolbar" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;padding:0 1rem 1rem">
    <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-secondary)">
      <input id="inbox-select-all" type="checkbox" onchange="toggleInboxSelectAll(this.checked)"> Select visible
    </label>
    <span id="inbox-selection-count" class="badge">0 selected</span>
    <button class="btn btn-ghost btn-sm" onclick="bulkInboxMarkRead()">${icon('check-circle')} Mark read</button>
    <button class="btn btn-ghost btn-sm" onclick="bulkInboxSnooze()">${icon('clock')} Snooze</button>
    <button class="btn btn-ghost btn-sm" onclick="bulkInboxRetryTasks()">${icon('refresh')} Retry failed</button>
    <button class="btn btn-ghost btn-sm" onclick="bulkInboxCancelTasks()">${icon('x')} Cancel failed</button>
    <button class="btn btn-ghost btn-sm" onclick="bulkInboxClearSelection()">Clear</button>
  </div>
</div>

<div id="inbox-list" class="flex flex-col gap-3">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading live inbox…</div>
</div>
`);

function inboxItem({id,type,priority,title,desc,from,fromRole,time,due,overdue,pages,fields}) {
  const typeColors = {sign:'primary',approve:'warning',review:'secondary'};
  const typeLabels = {sign:'Sign Required',approve:'Approval Needed',review:'Review Required'};
  const prioColors = {high:'danger',medium:'warning',low:'success'};
  return `
  <div class="card inbox-item" style="cursor:pointer;transition:box-shadow 0.15s" onclick="openEnvelopeDetail('${id}')" onmouseenter="this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.boxShadow=''">
    <div style="display:flex;gap:1rem;align-items:flex-start;padding:1.25rem">
      <div style="margin-top:2px">${avatar(from, 40)}</div>
      <div style="flex:1;min-width:0">
        <div class="flex" style="gap:0.5rem;margin-bottom:0.375rem;flex-wrap:wrap;align-items:center">
          <span class="badge badge-${typeColors[type]}">${typeLabels[type]}</span>
          <span class="badge badge-${prioColors[priority]}">${priority.charAt(0).toUpperCase()+priority.slice(1)} Priority</span>
          ${overdue ? '<span class="badge badge-danger">OVERDUE</span>' : ''}
          <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto">${id}</span>
        </div>
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;font-size:0.9375rem">${title}</div>
        <div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">${desc}</div>
        <div class="flex" style="gap:1.5rem;font-size:0.8rem;color:var(--text-muted);flex-wrap:wrap">
          <span>${icon('user')} ${from} (${fromRole})</span>
          <span>${icon('clock')} ${time}</span>
          <span style="${overdue?'color:var(--danger);font-weight:600':''}">${icon('calendar')} Due: ${due}</span>
          <span>${icon('file-text')} ${pages} pages</span>
          ${fields > 0 ? `<span>${icon('edit')} ${fields} fields remaining</span>` : ''}
        </div>
      </div>
      <div class="flex flex-col gap-2" style="flex-shrink:0">
        ${type === 'sign' ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();navigate('signing')" style="white-space:nowrap">${icon('pen-tool')} Sign Now</button>` : ''}
        ${type === 'approve' ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();quickApprove('${id}')" style="white-space:nowrap">${icon('check')} Approve</button>` : ''}
        ${type === 'review' ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();navigate('signing')" style="white-space:nowrap">${icon('eye')} Review</button>` : ''}
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delegateTask('${id}')" style="white-space:nowrap">${icon('user')} Delegate</button>
        <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();snoozeTask('${id}')" style="white-space:nowrap">${icon('clock')} Snooze</button>
      </div>
    </div>
  </div>`;
}

let inboxItemsLive = [];
let inboxFilterLive = 'all';
let inboxVisibleRowsLive = [];
let inboxSelectedKeysLive = new Set();

function filterInbox(filter, el) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  inboxFilterLive = filter;
  renderInboxLive();
}

async function inbox_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/inbox/');
    inboxItemsLive = [
      ...(data.signing || []).map(item => ({...item, uiType:'sign'})),
      ...(data.approvals || []).map(item => ({...item, uiType:'approve'})),
      ...(data.failed_tasks || []).map(item => ({...item, uiType:'task'})),
      ...(data.completed || []).map(item => ({...item, uiType:'complete'})),
    ];
    const counts = data.counts || {};
    const activeTotal = (counts.signing || 0) + (counts.approvals || 0) + (counts.failed_tasks || 0);
    [['inbox-sign-count', counts.signing || 0], ['inbox-approval-count', counts.approvals || 0], ['inbox-failed-count', counts.failed_tasks || 0], ['inbox-total-count', counts.completed_today || 0], ['inbox-tab-all', activeTotal], ['inbox-tab-sign', counts.signing || 0], ['inbox-tab-approve', counts.approvals || 0], ['inbox-tab-task', counts.failed_tasks || 0]].forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });
    renderInboxLive();
  } catch (error) {
    document.getElementById('inbox-list').innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger)">Inbox failed: ${escapeHtml(error.message)}</div>`;
  }
}

function renderInboxLive() {
  const query = (document.getElementById('inbox-search')?.value || '').toLowerCase();
  const workType = document.getElementById('inbox-work-type-filter')?.value || '';
  const priority = document.getElementById('inbox-priority-filter')?.value || '';
  const list = document.getElementById('inbox-list');
  if (!list) return;
  const rows = inboxItemsLive.filter(item => {
    const typeOk = inboxFilterLive === 'all' ? item.uiType !== 'complete' : item.uiType === inboxFilterLive;
    const workOk = !workType || (workType === 'task' ? item.uiType === 'task' : ['sign','approve','complete'].includes(item.uiType));
    const priorityOk = !priority || String(item.priority || '').toLowerCase() === priority;
    const text = [
      item.action_key, item.envelope_name, item.task_name, item.role, item.error_message,
      item.recipient_name, item.recipient, item.email, item.queue_name, item.status,
    ].filter(Boolean).join(' ').toLowerCase();
    return typeOk && workOk && priorityOk && (!query || text.includes(query));
  });
  inboxVisibleRowsLive = rows;
  inboxSelectedKeysLive = new Set([...inboxSelectedKeysLive].filter(key => rows.some(row => inboxItemKey(row) === key)));
  list.innerHTML = rows.length ? rows.map(renderInboxLiveItem).join('') : '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No inbox items match this view.</div>';
  updateInboxSelectionUi();
}

function renderInboxLiveItem(item) {
  const isApproval = item.uiType === 'approve';
  const isSigning = item.uiType === 'sign';
  const isTask = item.uiType === 'task';
  const isComplete = item.uiType === 'complete';
  const title = item.envelope_name || item.task_name || `Task #${item.id}`;
  const desc = isApproval ? `Approval role: ${item.role}${item.assigned_to_me_as_delegate ? ' · delegated to you' : ''}` : isSigning ? `Signing task for ${item.recipient_name || 'recipient'}` : isTask ? item.error_message : `Completed ${item.status || ''}`;
  const due = item.due_at ? apiDate(item.due_at) : 'No due date';
  const typeLabel = isApproval ? 'Approval Needed' : isSigning ? 'Sign Required' : isTask ? 'Failed Task' : 'Completed';
  const typeColor = isApproval ? 'warning' : isSigning ? 'primary' : isTask ? 'danger' : 'success';
  const priorityColor = item.priority === 'high' ? 'danger' : item.priority === 'low' ? 'success' : 'warning';
  const key = inboxItemKey(item);
  const checked = inboxSelectedKeysLive.has(key) ? 'checked' : '';
  return `<div class="card inbox-item" style="cursor:pointer;transition:box-shadow 0.15s;${item.unread ? 'border-left:4px solid var(--primary)' : ''}" onclick="openInboxItemLive('${key}')" onmouseenter="this.style.boxShadow='var(--shadow-lg)'" onmouseleave="this.style.boxShadow=''">
    <div style="display:flex;gap:1rem;align-items:flex-start;padding:1.25rem">
      <label style="padding-top:0.25rem" onclick="event.stopPropagation()">
        <input type="checkbox" ${checked} onchange="toggleInboxSelection('${key}', this.checked)">
      </label>
      <div style="margin-top:2px">${avatar(isSigning ? item.recipient_name || 'Signer' : 'HanMak', 40)}</div>
      <div style="flex:1;min-width:0">
        <div class="flex" style="gap:0.5rem;margin-bottom:0.375rem;flex-wrap:wrap;align-items:center">
          <span class="badge badge-${typeColor}">${typeLabel}</span>
          ${item.priority && !isComplete ? `<span class="badge badge-${priorityColor}">${titleCaseStatus(item.priority)} Priority</span>` : ''}
          ${item.overdue ? '<span class="badge badge-danger">Overdue</span>' : ''}
          ${item.unread ? '<span class="badge badge-primary">Unread</span>' : ''}
          <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto">${item.action_key}</span>
        </div>
        <div style="font-weight:600;color:var(--text-primary);margin-bottom:0.25rem;font-size:0.9375rem">${escapeHtml(title)}</div>
        <div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">${escapeHtml(desc || '')}</div>
        <div class="flex" style="gap:1.5rem;font-size:0.8rem;color:var(--text-muted);flex-wrap:wrap">
          <span>${icon('clock')} ${apiDate(item.created_at)}</span>
          <span>${icon('calendar')} Due: ${due}</span>
          ${isComplete ? `<span>${icon('check')} Completed: ${apiDate(item.completed_at)}</span>` : ''}
        </div>
      </div>
      <div class="flex flex-col gap-2" style="flex-shrink:0">
        ${isSigning ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();openPublicSigningToken('${item.token}')" style="white-space:nowrap">${icon('pen-tool')} Sign Now</button>` : ''}
        ${isApproval ? `<button class="btn btn-success btn-sm" onclick="event.stopPropagation();quickApprove(${item.id})" style="white-space:nowrap">${icon('check')} Approve</button>` : ''}
        ${isApproval ? `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();rejectInboxApproval(${item.id})" style="white-space:nowrap">${icon('x')} Reject</button>` : ''}
        ${isApproval ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();delegateTask(${item.id})" style="white-space:nowrap">${icon('user')} Delegate</button>` : ''}
        ${isTask ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation();restartInboxTask(${item.id})" style="white-space:nowrap">${icon('refresh')} Retry</button>` : ''}
        ${isTask ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();cancelInboxTask(${item.id})" style="white-space:nowrap">${icon('x')} Cancel</button>` : ''}
        ${isTask ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteInboxTask(${item.id})" style="white-space:nowrap;color:var(--danger)">${icon('trash')} Delete</button>` : ''}
        ${!isComplete ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();markInboxItemRead('${item.action_key}')" style="white-space:nowrap">${icon('check-circle')} Read</button>` : ''}
        ${!isComplete ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();snoozeTask('${item.action_key}')" style="white-space:nowrap">${icon('clock')} Snooze</button>` : ''}
      </div>
    </div>
  </div>`;
}

function inboxItemKey(item) {
  return item.action_key || `${item.uiType}:${item.id}`;
}

function inboxFindByKey(key) {
  return inboxItemsLive.find(item => inboxItemKey(item) === key);
}

function openInboxItemLive(key) {
  const item = inboxFindByKey(key);
  if (!item) return;
  if (item.uiType === 'sign') return openPublicSigningToken(item.token);
  if (item.uiType === 'approve') {
    if (typeof openApprovalDetailLive === 'function') return openApprovalDetailLive(item.id);
    return navigate('approvals');
  }
  if (item.uiType === 'task') return navigate('tasks');
  if (item.envelope) return openInboxEnvelopeLive(item.envelope);
  markInboxItemRead(item.action_key || key);
}

function openInboxEnvelopeLive(envelopeId) {
  navigate('envelopes');
  if (envelopeId && typeof openLiveEnvelopeDrawer === 'function') {
    setTimeout(() => openLiveEnvelopeDrawer(envelopeId), 250);
  }
}

function toggleInboxSelection(key, checked) {
  if (checked) inboxSelectedKeysLive.add(key);
  else inboxSelectedKeysLive.delete(key);
  updateInboxSelectionUi();
}

function toggleInboxSelectAll(checked) {
  inboxVisibleRowsLive.forEach(item => {
    const key = inboxItemKey(item);
    if (checked) inboxSelectedKeysLive.add(key);
    else inboxSelectedKeysLive.delete(key);
  });
  renderInboxLive();
}

function updateInboxSelectionUi() {
  const count = inboxSelectedKeysLive.size;
  const countEl = document.getElementById('inbox-selection-count');
  if (countEl) countEl.textContent = `${count} selected`;
  const selectAll = document.getElementById('inbox-select-all');
  if (selectAll) {
    const visibleKeys = inboxVisibleRowsLive.map(inboxItemKey);
    selectAll.checked = visibleKeys.length > 0 && visibleKeys.every(key => inboxSelectedKeysLive.has(key));
    selectAll.indeterminate = visibleKeys.some(key => inboxSelectedKeysLive.has(key)) && !selectAll.checked;
  }
}

function selectedInboxItemsLive() {
  return [...inboxSelectedKeysLive].map(inboxFindByKey).filter(Boolean);
}

function bulkInboxClearSelection() {
  inboxSelectedKeysLive.clear();
  renderInboxLive();
}

async function bulkInboxMarkRead() {
  const items = selectedInboxItemsLive();
  if (!items.length) return showToast('Select at least one inbox item.', 'info');
  for (const item of items) {
    if (item.action_key) await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'mark_read', key:item.action_key})});
  }
  showToast(`${items.length} inbox item(s) marked read`, 'success');
  bulkInboxClearSelection();
  inbox_init();
}

function bulkInboxSnooze() {
  const items = selectedInboxItemsLive().filter(item => item.action_key);
  if (!items.length) return showToast('Select at least one active inbox item.', 'info');
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Snooze Selected Items</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:1rem">${items.length} selected item(s) will be snoozed.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        ${[['1 hour',60],['3 hours',180],['Tomorrow 9am',1440],['Monday 9am',4320]].map(([label, minutes]) => `<button class="btn btn-ghost" onclick="submitBulkInboxSnooze(${minutes}, '${label}')">${icon('clock')} ${label}</button>`).join('')}
      </div>
    </div>
  `);
}

async function submitBulkInboxSnooze(minutes, label) {
  const items = selectedInboxItemsLive().filter(item => item.action_key);
  for (const item of items) {
    await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'snooze', key:item.action_key, minutes})});
  }
  closeModal();
  showToast(`${items.length} item(s) snoozed until ${label}`, 'success');
  bulkInboxClearSelection();
  inbox_init();
}

async function bulkInboxRetryTasks() {
  const tasks = selectedInboxItemsLive().filter(item => item.uiType === 'task');
  if (!tasks.length) return showToast('Select failed task rows to retry.', 'info');
  for (const task of tasks) {
    await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'restart_task', id:task.id})});
  }
  showToast(`${tasks.length} task(s) queued for retry`, 'success');
  bulkInboxClearSelection();
  inbox_init();
}

async function bulkInboxCancelTasks() {
  const tasks = selectedInboxItemsLive().filter(item => item.uiType === 'task');
  if (!tasks.length) return showToast('Select failed task rows to cancel.', 'info');
  for (const task of tasks) {
    await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'cancel_task', id:task.id})});
  }
  showToast(`${tasks.length} task(s) cancelled`, 'success');
  bulkInboxClearSelection();
  inbox_init();
}

function openPublicSigningToken(token) {
  if (!token) return showToast('No signer token is available for this task.', 'error');
  window.open(`${location.origin}${location.pathname}?token=${encodeURIComponent(token)}`, '_blank');
}

async function markAllRead() {
  await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'mark_all_read'})});
  showToast('All current inbox items marked read', 'success');
  inbox_init();
}
async function markInboxItemRead(key) {
  await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'mark_read', key})});
  showToast('Task marked read', 'success');
  inbox_init();
}
function quickApprove(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Approve Document</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:1rem">You are about to approve <strong>${id}</strong>. This will send it to the next workflow stage.</p>
      <div class="form-group">
        <label class="form-label">Add a comment (optional)</label>
        <textarea class="form-input" rows="3" placeholder="Approved. Looks good to proceed."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="submitInboxApproval(${id})">${icon('check')} Confirm Approval</button>
    </div>
  `);
}
function rejectInboxApproval(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Reject Approval</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:1rem">Reject this approval request and stop it from proceeding.</p>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <textarea id="inbox-reject-notes" class="form-input" rows="3" placeholder="Reason for rejection..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="submitInboxRejection(${id})">${icon('x')} Reject</button>
    </div>
  `);
}
async function submitInboxRejection(id) {
  const notes = document.getElementById('inbox-reject-notes')?.value || '';
  await hanmakApi(`/approval-requests/${id}/reject/`, {method:'POST', body: JSON.stringify({notes})});
  closeModal();
  showToast(`Approval #${id} rejected`, 'success');
  inbox_init();
}
async function submitInboxApproval(id) {
  const notes = document.querySelector('.modal-body textarea')?.value || '';
  await hanmakApi(`/approval-requests/${id}/approve/`, {method:'POST', body: JSON.stringify({notes})});
  closeModal();
  showToast(`Approval #${id} completed`, 'success');
  inbox_init();
}
async function restartInboxTask(id) {
  await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'restart_task', id})});
  showToast(`Task #${id} queued for retry`, 'success');
  inbox_init();
}
async function cancelInboxTask(id) {
  await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'cancel_task', id})});
  showToast(`Task #${id} cancelled`, 'success');
  inbox_init();
}
async function deleteInboxTask(id) {
  confirm(`Delete task #${id}? This removes the task run and its log events.`, async () => {
    await hanmakApi(`/task-runs/${id}/`, {method:'DELETE'});
    showToast(`Task #${id} deleted`, 'success');
    inbox_init();
  });
}
function delegateTask(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Delegate Task</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Delegate to</label>
        <select id="inbox-delegate-user" class="form-input">
          <option value="">Select team member...</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Reason</label>
        <textarea id="inbox-delegate-reason" class="form-input" rows="2" placeholder="Out of office / Not my area..."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitInboxDelegation(${id})">Delegate</button>
    </div>
  `);
  loadInboxDelegateUsers();
}
async function loadInboxDelegateUsers() {
  const select = document.getElementById('inbox-delegate-user');
  if (!select) return;
  const data = await hanmakApi('/users/');
  const users = data.results || data;
  select.innerHTML += users.map(user => `<option value="${user.id}">${escapeHtml(user.display_name || user.username || user.email)}</option>`).join('');
}
async function submitInboxDelegation(id) {
  const user = document.getElementById('inbox-delegate-user')?.value;
  const notes = document.getElementById('inbox-delegate-reason')?.value || '';
  if (!user) return showToast('Select a delegate.', 'error');
  await hanmakApi(`/approval-requests/${id}/delegate/`, {method:'POST', body: JSON.stringify({user, notes})});
  closeModal();
  showToast(`Approval #${id} delegated`, 'success');
  inbox_init();
}
function snoozeTask(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Snooze Task</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:1rem">When should this task reappear in your inbox?</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        ${[['1 hour',60],['3 hours',180],['Tomorrow 9am',1440],['Monday 9am',4320],['Next week',10080]].map(([o,m])=>`<button class="btn btn-ghost" style="justify-content:flex-start" onclick="submitInboxSnooze('${id}',${m},'${o}')">${icon('clock')} ${o}</button>`).join('')}
      </div>
    </div>
  `);
}
async function submitInboxSnooze(key, minutes, label) {
  await hanmakApi('/inbox/', {method:'POST', body: JSON.stringify({action:'snooze', key, minutes})});
  closeModal();
  showToast(`Snoozed until ${label}`, 'success');
  inbox_init();
}
function openEnvelopeDetail(id) { navigate('envelopes'); }
