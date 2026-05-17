// Compliance pages are registered here as backend-backed loading shells.
// The live implementations in live-wiring.js re-register these pages with
// full CRUD once the API helpers have loaded.

registerPage('legal-holds', () => `
<div class="page-header">
  <div><h1 class="page-title">Legal Holds</h1><p class="page-subtitle">Live document preservation holds and releases</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="legal_holds_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="openCreateLegalHoldModal()">${icon('plus')} Create Legal Hold</button>
  </div>
</div>
<div id="live-legal-holds">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading legal holds…</div>
</div>
`);

registerPage('retention', () => `
<div class="page-header">
  <div><h1 class="page-title">Retention Policies</h1><p class="page-subtitle">Live document retention and purge policy controls</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="retention_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="openCreateRetentionModal()">${icon('plus')} New Policy</button>
  </div>
</div>
<div id="live-retention-policies">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading retention policies…</div>
</div>
`);

registerPage('data-residency', () => `
<div class="page-header">
  <div><h1 class="page-title">Data Residency</h1><p class="page-subtitle">Live region catalog, organization policy, and backend enforcement</p></div>
  <button class="btn btn-ghost" onclick="data_residency_init()">${icon('refresh')} Refresh</button>
</div>
<div id="live-data-residency">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading data residency settings…</div>
</div>
`);

registerPage('compliance-exports', () => `
<div class="page-header">
  <div><h1 class="page-title">Compliance Exports</h1><p class="page-subtitle">Live audit and evidence export queue</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="compliance_exports_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="openCreateComplianceExportModal()">${icon('download')} Queue Export</button>
  </div>
</div>
<div id="live-compliance-exports">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading compliance exports…</div>
</div>
`);
