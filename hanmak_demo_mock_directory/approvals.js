registerPage('approvals', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Approval Queue</h1>
    <p class="page-subtitle">Documents awaiting approval decisions across your organization</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="exportApprovalsLive()">${icon('download')} Export Report</button>
  </div>
</div>

<div class="stats-grid" style="--cols:5;margin-bottom:1.5rem">
  <div class="stat-card"><div class="stat-label">Pending Approvals</div><div class="stat-value" id="approvals-count-pending">—</div></div>
  <div class="stat-card"><div class="stat-label">Approved</div><div class="stat-value" id="approvals-count-approved">—</div></div>
  <div class="stat-card"><div class="stat-label">Rejected</div><div class="stat-value" id="approvals-count-rejected" style="color:var(--danger)">—</div></div>
  <div class="stat-card"><div class="stat-label">Changes Requested</div><div class="stat-value" id="approvals-count-changes">—</div></div>
  <div class="stat-card"><div class="stat-label">Delegated</div><div class="stat-value" id="approvals-count-delegated">—</div></div>
</div>

<div style="display:grid;grid-template-columns:1fr 320px;gap:1.5rem">
  <div>
    <div class="card">
      <div class="table-toolbar">
        <div class="tabs">
          <button class="tab active" onclick="loadApprovals('pending',this)">Pending</button>
          <button class="tab" onclick="loadApprovals('approved',this)">Approved</button>
          <button class="tab" onclick="loadApprovals('rejected',this)">Rejected</button>
          <button class="tab" onclick="loadApprovals('changes_requested',this)">Changes Requested</button>
          <button class="tab" onclick="loadApprovals('delegated',this)">Delegated</button>
        </div>
      </div>
      <table class="table">
        <thead><tr>
          <th>Document / Role</th>
          <th>Approver</th>
          <th>Status</th>
          <th>Created</th>
          <th>Actions</th>
        </tr></thead>
        <tbody id="approvals-tbody">
          <tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading…</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Approval Analytics</div>
      <div id="approval-analytics-live" style="display:flex;flex-direction:column;gap:0.75rem">
        <div class="empty-state"><div class="empty-state-title">Loading analytics...</div></div>
      </div>
    </div>
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">By Approver Load</div>
      <div id="approval-load-live">
        <div class="empty-state"><div class="empty-state-title">Loading approver load...</div></div>
      </div>
    </div>
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Quick Delegation</div>
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">Delegate all your pending approvals while out of office</p>
      <select id="quick-delegate-user" class="form-input" style="width:100%;margin-bottom:0.625rem"><option value="">Load users from API...</option></select>
      <input id="quick-delegate-until" class="form-input" type="date" style="width:100%;margin-bottom:0.625rem" placeholder="Delegation end date">
      <button class="btn btn-primary" style="width:100%" onclick="configureQuickApprovalDelegationLive()">Set Delegation</button>
    </div>
  </div>
</div>
`);

// ── Live wiring ──────────────────────────────────────────────────────────────

let _currentApprovalStatus = 'pending';

async function approvals_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  hydrateQuickDelegateUsers();
  hydrateApprovalSidebarLive(orgId);
  // Load counts for all statuses
  const statuses = ['pending','approved','rejected','changes_requested','delegated'];
  for (const s of statuses) {
    try {
      const d = await hanmakApi(`/approval-requests/?organization=${orgId}&status=${s}`);
      const count = d.count !== undefined ? d.count : (d.results || d).length;
      const el = document.getElementById(`approvals-count-${s === 'changes_requested' ? 'changes' : s}`);
      if (el) el.textContent = count;
    } catch(_) {}
  }
  loadApprovals('pending', document.querySelector('#approvals-tbody')?.closest('.card')?.querySelector('.tab.active'));
}

async function hydrateApprovalSidebarLive(orgId) {
  try {
    const [bottlenecks, pendingData] = await Promise.all([
      hanmakApi('/analytics/approval-bottlenecks/'),
      hanmakApi(`/approval-requests/?organization=${orgId}&status=pending&page_size=100`),
    ]);
    const analytics = document.getElementById('approval-analytics-live');
    if (analytics) {
      const totals = bottlenecks.reduce((acc, row) => {
        const status = row.status || 'unknown';
        acc[status] = (acc[status] || 0) + Number(row.count || 0);
        return acc;
      }, {});
      const total = Object.values(totals).reduce((sum, count) => sum + count, 0) || 1;
      const rows = [
        ['Approved', totals.approved || 0, 'success'],
        ['Rejected', totals.rejected || 0, 'danger'],
        ['Changes Requested', totals.changes_requested || 0, 'primary'],
        ['Delegated', totals.delegated || 0, 'secondary'],
        ['Pending', totals.pending || 0, 'warning'],
      ].filter(([, count]) => count > 0);
      analytics.innerHTML = rows.length ? rows.map(([label, count, color]) => {
        const percent = Math.round((count / total) * 100);
        return `
          <div>
            <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:4px"><span>${escapeHtml(label)}</span><span style="font-weight:600">${percent}%</span></div>
            <div style="height:7px;background:var(--border);border-radius:4px"><div style="width:${percent}%;height:100%;background:var(--${color});border-radius:4px"></div></div>
          </div>
        `;
      }).join('') : '<div class="empty-state"><div class="empty-state-title">No approval analytics yet</div></div>';
    }
    const load = document.getElementById('approval-load-live');
    if (load) {
      const pendingRows = pendingData.results || pendingData;
      const counts = pendingRows.reduce((acc, row) => {
        const key = row.approver_username || row.approver || 'Unassigned';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      const colors = ['warning', 'danger', 'primary', 'secondary', 'success'];
      const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
      load.innerHTML = rows.length ? rows.map(([name, count], index) => `
        <div style="display:flex;align-items:center;gap:0.625rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          ${avatar(name,30)}
          <span style="flex:1;font-size:0.8125rem">${escapeHtml(name)}</span>
          <span class="badge badge-${colors[index % colors.length]}">${count} pending</span>
        </div>
      `).join('') : '<div class="empty-state"><div class="empty-state-title">No pending approver load</div></div>';
    }
  } catch (error) {
    const analytics = document.getElementById('approval-analytics-live');
    const load = document.getElementById('approval-load-live');
    if (analytics) analytics.innerHTML = '<div class="empty-state"><div class="empty-state-title">Approval analytics unavailable</div></div>';
    if (load) load.innerHTML = '<div class="empty-state"><div class="empty-state-title">Approver load unavailable</div></div>';
  }
}

async function hydrateQuickDelegateUsers() {
  const select = document.getElementById('quick-delegate-user');
  if (!select) return;
  try {
    const data = await hanmakApi('/users/');
    const users = data.results || data;
    select.innerHTML = '<option value="">Select delegate...</option>' + users.map(user => `<option value="${user.id}">${user.display_name || user.username} · ${user.email || ''}</option>`).join('');
  } catch (_) {
    select.innerHTML = '<option value="">Could not load users</option>';
  }
}

async function configureQuickApprovalDelegationLive() {
  const user = document.getElementById('quick-delegate-user')?.value;
  const until = document.getElementById('quick-delegate-until')?.value;
  if (!user) return showToast('Select a delegate', 'error');
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/approval-requests/?organization=${orgId}&status=pending&page_size=100`);
    const approvals = data.results || data;
    let delegated = 0;
    for (const approval of approvals) {
      await hanmakApi(`/approval-requests/${approval.id}/delegate/`, {
        method: 'POST',
        body: JSON.stringify({
          user,
          notes: until ? `Delegated from approval queue until ${until}.` : 'Delegated from approval queue.',
        }),
      });
      delegated += 1;
    }
    showToast(`${delegated} pending approval(s) delegated`, 'success');
    approvals_init();
  } catch (error) {
    showToast(`Delegation failed: ${error.message}`, 'error', 7000);
  }
}

async function loadApprovals(status, tabEl) {
  _currentApprovalStatus = status;
  if (tabEl) {
    tabEl.closest('.tabs')?.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
  }
  const tbody = document.getElementById('approvals-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading…</td></tr>';
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/approval-requests/?organization=${orgId}&status=${status}`);
    const items = data.results || data;
    if (!items.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:2rem;color:var(--text-muted)">No ${status.replace('_',' ')} approvals.</td></tr>`;
      return;
    }
    tbody.innerHTML = items.map(a => {
      const statusColors = {pending:'warning',approved:'success',rejected:'danger',changes_requested:'primary',delegated:'secondary'};
      const badge = `<span class="badge badge-${statusColors[a.status]||'secondary'}">${a.status.replace('_',' ')}</span>`;
      const created = a.created_at ? new Date(a.created_at).toLocaleDateString() : '—';
      const actions = a.status === 'pending'
        ? `<div class="flex gap-1">
            <button class="btn btn-success btn-sm" onclick="doApproveLive(${a.id})" title="Approve">${icon('check')}</button>
            <button class="btn btn-ghost btn-sm" onclick="doDeclineLive(${a.id})" title="Reject">${icon('x')}</button>
            <button class="btn btn-ghost btn-sm" onclick="doRequestChangesLive(${a.id})" title="Request Changes">${icon('edit')}</button>
            <button class="btn btn-ghost btn-sm" onclick="doDelegateLive(${a.id})" title="Delegate">${icon('user')}</button>
            <button class="btn btn-ghost btn-sm" onclick="openApprovalDetailLive(${a.id})" title="View">${icon('eye')}</button>
           </div>`
        : `<div class="flex gap-1" style="align-items:center"><span style="font-size:0.75rem;color:var(--text-muted)">${a.decided_at ? new Date(a.decided_at).toLocaleDateString() : '—'}</span><button class="btn btn-ghost btn-sm" onclick="openApprovalDetailLive(${a.id})" title="View">${icon('eye')}</button></div>`;
      return `<tr>
        <td>
          <div style="font-weight:600;font-size:0.875rem">${a.envelope ? `Envelope #${a.envelope}` : '—'}</div>
          <div style="font-size:0.75rem;color:var(--text-muted)">${a.approval_role}</div>
        </td>
        <td style="font-size:0.8125rem">${a.approver_username || a.approver || '—'}</td>
        <td>${badge}</td>
        <td style="font-size:0.8rem;color:var(--text-muted)">${created}</td>
        <td>${actions}</td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--danger)">Failed to load approvals.</td></tr>`;
  }
}

async function openApprovalDetailLive(id) {
  try {
    const approval = await hanmakApi(`/approval-requests/${id}/`);
    let envelope = null;
    if (approval.envelope) {
      try {
        envelope = await hanmakApi(`/envelopes/${approval.envelope}/`);
      } catch (_) {}
    }
    const rows = [
      ['Approval ID', `#${approval.id}`],
      ['Status', titleCaseStatus(approval.status || '-')],
      ['Role', approval.approval_role || '-'],
      ['Approver', approval.approver_username || approval.approver || '-'],
      ['Delegated To', approval.delegated_to || '-'],
      ['Created', approval.created_at ? apiDate(approval.created_at) : '-'],
      ['Due', approval.due_at ? apiDate(approval.due_at) : '-'],
      ['Decided', approval.decided_at ? apiDate(approval.decided_at) : '-'],
    ];
    openModal(`
      <div class="modal">
        <div class="modal-header"><h3 class="modal-title">${icon('check-circle')} Approval Detail</h3><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">
            ${rows.map(([label, value]) => `<div style="padding:0.625rem;background:var(--bg-secondary);border-radius:6px"><div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:2px">${escapeHtml(label)}</div><div style="font-weight:600;font-size:0.85rem">${escapeHtml(String(value))}</div></div>`).join('')}
          </div>
          ${envelope ? `<div class="form-group"><label class="form-label">Envelope</label><div class="form-input" style="height:auto;background:var(--bg-secondary)"><strong>${escapeHtml(envelope.name || `Envelope #${envelope.id}`)}</strong><div style="font-size:0.75rem;color:var(--text-muted);margin-top:3px">Status: ${escapeHtml(titleCaseStatus(envelope.status || '-'))} · Completion ${envelope.completion_percent || 0}%</div></div></div>` : ''}
          <div class="form-group"><label class="form-label">Notes</label><div class="form-input" style="height:auto;min-height:64px;background:var(--bg-secondary);white-space:pre-wrap">${escapeHtml(approval.notes || 'No notes recorded.')}</div></div>
        </div>
        <div class="modal-footer">
          ${approval.envelope ? `<button class="btn btn-ghost" onclick="closeModal();navigate('envelopes');setTimeout(()=>openLiveEnvelopeDrawer(${approval.envelope}),300)">${icon('eye')} Open Envelope</button>` : ''}
          ${approval.status === 'pending' ? `<button class="btn btn-success" onclick="closeModal();doApproveLive(${approval.id})">${icon('check')} Approve</button>` : ''}
          <button class="btn btn-primary" onclick="closeModal()">Close</button>
        </div>
      </div>
    `);
  } catch (error) {
    showToast(`Approval detail failed: ${error.message}`, 'error', 7000);
  }
}

async function exportApprovalsLive() {
  if (!await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/approval-requests/?organization=${orgId}&page_size=100`);
    const rows = data.results || data;
    const csv = ['id,envelope,role,approver,status,created_at,decided_at']
      .concat(rows.map(row => [row.id, row.envelope, `"${String(row.approval_role || '').replaceAll('"', '""')}"`, row.approver, row.status, row.created_at || '', row.decided_at || ''].join(',')))
      .join('\n');
    downloadTextFile(`hanmak-approvals-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
    showToast(`${rows.length} approval row(s) exported as CSV`, 'success');
  } catch (error) {
    showToast(`Approval export failed: ${error.message}`, 'error');
  }
}

function doApproveLive(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('check-circle')} Approve</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Comment (optional)</label>
        <textarea id="approval-comment" class="form-input" rows="3" placeholder="Approved. Please proceed."></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-success" onclick="_submitApprovalAction(${id},'approve',document.getElementById('approval-comment').value)">${icon('check')} Confirm Approval</button>
    </div>
  `);
}

function doDeclineLive(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('x-circle')} Reject</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Reason *</label>
        <textarea id="rejection-notes" class="form-input" rows="3" placeholder="Please revise section 4.2 and resubmit…"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="_submitApprovalAction(${id},'reject',document.getElementById('rejection-notes').value)">${icon('x')} Reject</button>
    </div>
  `);
}

function doRequestChangesLive(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('edit')} Request Changes</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Changes Required *</label>
        <textarea id="changes-notes" class="form-input" rows="3" placeholder="Please update the payment terms in section 3…"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_submitApprovalAction(${id},'request_changes',document.getElementById('changes-notes').value)">Request Changes</button>
    </div>
  `);
}

async function doDelegateLive(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Delegate Approval</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Delegate To</label><select id="approval-delegate-user" class="form-input"><option value="">Loading users...</option></select></div>
      <div class="form-group"><label class="form-label">Message</label><textarea id="approval-delegate-notes" class="form-input" rows="2" placeholder="Please review on my behalf."></textarea></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitApprovalDelegateLive(${id})">Delegate</button>
    </div>
  `);
  try {
    const data = await hanmakApi('/users/');
    const users = data.results || data;
    const select = document.getElementById('approval-delegate-user');
    if (select) select.innerHTML = '<option value="">Select user...</option>' + users.map(user => `<option value="${user.id}">${user.display_name || user.username} · ${user.email || ''}</option>`).join('');
  } catch (error) {
    showToast(`Could not load users: ${error.message}`, 'error');
  }
}

async function submitApprovalDelegateLive(id) {
  const user = document.getElementById('approval-delegate-user')?.value;
  if (!user) return showToast('Select a delegate', 'error');
  await hanmakApi(`/approval-requests/${id}/delegate/`, {
    method: 'POST',
    body: JSON.stringify({user, notes: document.getElementById('approval-delegate-notes')?.value || ''}),
  });
  closeModal();
  showToast('Approval delegated', 'success');
  approvals_init();
}

async function _submitApprovalAction(id, action, notes) {
  closeModal();
  try {
    const apiAction = action === 'request_changes' ? 'request-changes' : action;
    await hanmakApi(`/approval-requests/${id}/${apiAction}/`, {method:'POST', body: JSON.stringify({notes: notes || ''})});
    const labels = {approve:'Approved!',reject:'Rejected',request_changes:'Changes requested'};
    showToast(labels[action] || 'Done', action === 'approve' ? 'success' : 'info');
    approvals_init();
  } catch(e) { showToast('Action failed', 'error'); }
}
