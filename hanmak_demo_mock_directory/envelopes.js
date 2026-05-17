registerPage('envelopes', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Envelopes</h1>
    <p class="page-subtitle">All document envelopes across your organization</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="exportEnvelopeListLive()">${icon('download')} Export</button>
    <button class="btn btn-primary" onclick="openCreateEnvelopeModal()">${icon('plus')} New Envelope</button>
  </div>
</div>

<div class="stats-grid" style="--cols:5;margin-bottom:1.5rem">
  <div class="stat-card"><div class="stat-label">Total</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Draft</div><div class="stat-value" style="color:var(--text-muted)">—</div></div>
  <div class="stat-card"><div class="stat-label">In Progress</div><div class="stat-value" style="color:var(--warning)">—</div></div>
  <div class="stat-card"><div class="stat-label">Completed</div><div class="stat-value" style="color:var(--success)">—</div></div>
  <div class="stat-card"><div class="stat-label">Voided/Expired</div><div class="stat-value" style="color:var(--danger)">—</div></div>
</div>

<div class="card">
  <div class="table-toolbar">
    <div class="flex gap-2" style="flex-wrap:wrap">
      <div class="table-search" style="width:260px;flex:none">
        ${icon('search')}
        <input id="envelope-search" placeholder="Search envelopes..." oninput="envelopeFilterDebounce()">
      </div>
      <select id="envelope-status-filter" class="form-input" style="width:140px" onchange="envelopes_init()">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="sent">Sent</option>
        <option value="viewed">Viewed</option>
        <option value="partially_signed">Partially Signed</option>
        <option value="completed">Completed</option>
        <option value="declined">Declined</option>
        <option value="voided">Voided</option>
        <option value="expired">Expired</option>
      </select>
      <select id="envelope-sort" class="form-input" style="width:140px" onchange="envelopes_init()">
        <option value="-created_at">Date: Newest</option>
        <option value="created_at">Date: Oldest</option>
        <option value="name">Name A-Z</option>
        <option value="due_date">Due Date</option>
      </select>
      <input id="envelope-due-from" class="form-input" type="date" style="width:150px" title="From due date" onchange="envelopes_init()">
      <input id="envelope-due-to" class="form-input" type="date" style="width:150px" title="To due date" onchange="envelopes_init()">
    </div>
    <div class="flex gap-2">
      <button class="btn btn-ghost btn-sm" onclick="openEnvelopeBulkActions()">${icon('check-square')} Bulk Actions</button>
    </div>
  </div>
  <table class="table">
    <thead><tr>
      <th style="width:40px"><input type="checkbox" onchange="toggleAllEnvelopes(this)"></th>
      <th>Envelope</th>
      <th>Status</th>
      <th>Recipients</th>
      <th>Template</th>
      <th>Sent</th>
      <th>Due</th>
      <th>Completion</th>
      <th></th>
    </tr></thead>
    <tbody>
      <tr><td colspan="9"><div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading live envelopes…</div></td></tr>
    </tbody>
  </table>
  <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-top:1px solid var(--border);font-size:0.8125rem;color:var(--text-muted)">
    <span>Showing envelopes</span>
    <div class="flex gap-1">
      <button class="btn btn-ghost btn-sm" data-env-prev disabled onclick="envelopes_init(_envelopePrev)">Previous</button>
      <button class="btn btn-ghost btn-sm" data-env-next disabled onclick="envelopes_init(_envelopeNext)">Next</button>
    </div>
  </div>
</div>
`);

function toggleAllEnvelopes(cb) {
  document.querySelectorAll('.env-check').forEach(c => c.checked = cb.checked);
}

function openCreateEnvelopeModal() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Live Wiring Required</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <p style="font-size:0.875rem;color:var(--text-muted)">The backend-backed envelope creator is loaded from <code>live-wiring.js</code>. If you see this message, refresh the page and check the browser console for script errors.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
    </div>
  `);
}
