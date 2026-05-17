registerPage('templates', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Templates</h1>
    <p class="page-subtitle">Live template library, versions, parties, and field mappings</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="templates_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="openCreateTemplateModal()">${icon('plus')} New Template</button>
  </div>
</div>
<div id="live-template-stats" class="stats-grid" style="margin-bottom:1rem">
  <div class="stat-card"><div class="stat-label">Templates</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Draft</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Versions</div><div class="stat-value">—</div></div>
</div>
<div id="live-template-list">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading live templates…</div>
</div>
`);
