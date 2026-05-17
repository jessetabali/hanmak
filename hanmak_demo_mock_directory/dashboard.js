/* ===== Dashboard Page ===== */
registerPage('dashboard', () => `
<div class="page-header">
  <div>
    <div class="page-title" id="dashboard-greeting">Good morning</div>
    <div class="page-subtitle">Here's what's happening with HanMak today — ${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</div>
  </div>
  <div class="page-actions">
    <button class="btn btn-secondary" onclick="exportDashboardReportLive()">${icon('download')} Export Report</button>
    <button class="btn btn-primary" onclick="dashboardOpenNewEnvelope()">${icon('plus')} New Envelope</button>
  </div>
</div>

<!-- Stats -->
<div class="stats-grid">
  ${[
    {label:'Total Envelopes',value:'—',change:'Loading live API',dir:'up',color:'#4f8ef7'},
    {label:'Completed',value:'—',change:'Loading live API',dir:'up',color:'#10b981'},
    {label:'Pending Signatures',value:'—',change:'Loading inbox',dir:'down',color:'#f59e0b'},
    {label:'In Approval',value:'—',change:'Loading approvals',dir:'down',color:'#ef4444'},
    {label:'Search Hits',value:'—',change:'Loading search',dir:'up',color:'#8b5cf6'},
    {label:'Completion Rate',value:'—',change:'Loading live API',dir:'up',color:'#14b8a6'},
  ].map(s => `
    <div class="stat-card">
      <div class="stat-card-accent" style="background:${s.color}"></div>
      <div class="stat-label">${s.label}</div>
      <div class="stat-value">${s.value}</div>
      <div class="stat-change ${s.dir}">${s.dir==='up'?'▲':'▼'} ${s.change}</div>
    </div>
  `).join('')}
</div>

<!-- 2-col grid -->
<div class="grid-2" style="margin-bottom:24px;align-items:start;">

  <!-- Recent Activity -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Recent Activity</span>
      <button class="btn btn-ghost btn-sm" onclick="navigate('audit')">View audit ${icon('chevron-right')}</button>
    </div>
    <div id="dashboard-activity-list" style="padding:0 4px;max-height:430px;overflow:auto;overscroll-behavior:contain;">
      <div class="empty-state"><div class="empty-state-title">Loading live activity...</div></div>
    </div>
    <div class="card-footer" style="text-align:center;">
      <button id="dashboard-load-more-activity" class="btn btn-ghost btn-sm" style="width:100%" onclick="dashboardLoadMoreActivity()">Load more activity</button>
    </div>
  </div>

  <!-- Right column -->
  <div style="display:flex;flex-direction:column;gap:20px;">

    <!-- AI Risk Radar -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">⚡ AI Risk Radar</span>
        <span class="badge badge-purple">Beta</span>
      </div>
      <div class="card-body" id="dashboard-risk-radar" style="padding:16px;">
        <div class="empty-state"><div class="empty-state-title">Loading risk findings...</div></div>
      </div>
    </div>

    <!-- Workflow Snapshot -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Workflow Snapshot</span>
        <button class="btn btn-ghost btn-sm" onclick="navigate('approvals')">View queue ${icon('chevron-right')}</button>
      </div>
      <div class="card-body" id="dashboard-workflow-snapshot" style="padding:16px;">
        <div class="empty-state"><div class="empty-state-title">Loading workflow snapshot...</div></div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="card">
      <div class="card-header"><span class="card-title">Quick Actions</span></div>
      <div class="card-body" style="padding:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px;">
        ${[
          {label:'New Envelope',icon:'send',action:'dashboardOpenNewEnvelope()',color:'#4f8ef7'},
          {label:'Build Form',icon:'file',action:"navigate('form-builder')",color:'#8b5cf6'},
          {label:'Approval Queue',icon:'check',action:"navigate('approvals')",color:'#f59e0b'},
          {label:'System Health',icon:'activity',action:"navigate('system-health')",color:'#10b981'},
        ].map(a => `
          <button class="btn btn-secondary" style="justify-content:flex-start;gap:10px;padding:10px 12px;" onclick="${a.action}">
            <span style="color:${a.color};">${icon(a.icon, 15)}</span>
            <span style="font-size:12px;">${a.label}</span>
          </button>
        `).join('')}
      </div>
    </div>

  </div>
</div>

<!-- Bottom row: Pending tasks + Webhook health -->
<div class="grid-2">
  <div class="card">
    <div class="card-header">
      <span class="card-title">Needs Your Attention</span>
      <span class="badge badge-warning" id="dashboard-attention-count">Loading</span>
    </div>
    <div id="dashboard-attention-list" style="padding:0 4px;">
      <div class="empty-state"><div class="empty-state-title">Loading your tasks...</div></div>
    </div>
    <div class="card-footer">
      <button class="btn btn-ghost btn-sm" onclick="navigate('inbox')">View all in Inbox</button>
    </div>
  </div>

  <!-- Webhook health -->
  <div class="card">
    <div class="card-header">
      <span class="card-title">Webhook Health (24h)</span>
      <button class="btn btn-ghost btn-sm" onclick="navigate('webhooks')">Lab ${icon('chevron-right')}</button>
    </div>
    <div class="card-body" id="dashboard-webhook-health">
      <div class="empty-state"><div class="empty-state-title">Loading webhook health...</div></div>
    </div>
  </div>
</div>
`);

async function dashboard_init() {
  if (!window.hanmakApi || !localStorage.getItem('HANMAK_ACCESS_TOKEN')) return;
  try {
    const summary = await hanmakLoadDashboardSummary();
    console.debug('HanMak API dashboard summary', summary);
  } catch (error) {
    console.warn('HanMak API dashboard summary unavailable', error.message);
  }
}
