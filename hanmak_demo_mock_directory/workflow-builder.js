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
<div id="live-workflow-stats" class="stats-grid" style="--cols:4;margin-bottom:1rem">
  <div class="stat-card"><div class="stat-label">Definitions</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Active</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Stages</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Running</div><div class="stat-value">—</div></div>
</div>
<div id="live-workflow-list">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading live workflows…</div>
</div>
`);
