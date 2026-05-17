registerPage('audit', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Audit Trail</h1>
    <p class="page-subtitle">Immutable activity log and evidence bundles for legal admissibility</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="exportAuditReportLive()">${icon('download')} Export Report</button>
    <button class="btn btn-primary" onclick="generateEvidenceBundleLive()">${icon('package')} Evidence Bundle</button>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 340px;gap:1.5rem">
  <div>
    <div class="card" style="margin-bottom:1rem">
      <div class="table-toolbar" style="padding:0.75rem 1rem;flex-wrap:wrap;gap:0.5rem">
        <input id="audit-search" class="form-input" placeholder="Search messages…" style="width:260px" oninput="_auditFilterDebounce()">
        <select id="audit-event-type" class="form-input" style="width:180px" onchange="audit_init()">
          <option value="">All Event Types</option>
          <option value="envelope">Envelope Events</option>
          <option value="signature">Signature Events</option>
          <option value="approval">Approval Events</option>
          <option value="user">User Auth</option>
          <option value="api">API Events</option>
          <option value="webhook">Webhook Events</option>
          <option value="template">Template Events</option>
        </select>
        <input id="audit-date-from" class="form-input" type="date" style="width:140px" onchange="audit_init()">
        <input id="audit-date-to" class="form-input" type="date" style="width:140px" onchange="audit_init()">
        <button class="btn btn-ghost btn-sm" onclick="document.getElementById('audit-search').value='';document.getElementById('audit-event-type').value='';document.getElementById('audit-date-from').value='';document.getElementById('audit-date-to').value='';audit_init()">${icon('x')} Clear</button>
      </div>
    </div>

    <div class="card">
      <div style="padding:0.75rem 1.25rem;border-bottom:1px solid var(--border);font-size:0.8125rem;color:var(--text-muted);display:flex;justify-content:space-between">
        <span id="audit-event-count">Loading events…</span>
        <span>Immutable log</span>
      </div>
      <div id="audit-events-container" style="font-family:var(--font-mono)">
        <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading audit events…</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1.25rem;border-top:1px solid var(--border)">
        <span id="audit-page-info" style="font-size:0.8125rem;color:var(--text-muted)">Page 1</span>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" onclick="_auditPage(-1)">Prev</button>
          <button class="btn btn-ghost btn-sm" onclick="_auditPage(1)">Next</button>
        </div>
      </div>
    </div>
  </div>

  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Evidence Bundle</div>
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem">Generate a tamper-evident, court-admissible evidence package for any envelope.</p>
      <div class="form-group">
        <label class="form-label">Envelope ID</label>
        <input class="form-input" placeholder="ENV-2024-XXXX" value="ENV-2024-0889">
      </div>
      <div class="form-group">
        <label class="form-label">Include</label>
        <div class="flex flex-col gap-2" style="font-size:0.8125rem">
          ${['Signed PDF Document','Audit Trail PDF','Digital Certificate Chain','IP Geolocation Records','Device Fingerprints','Email Delivery Receipts','Signature Images','Timestamp Authority (TSA) Token'].map(item=>`
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
              <input type="checkbox" checked> ${item}
            </label>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="generateEvidenceBundle()">${icon('package')} Generate Bundle</button>
    </div>
    
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Integrity Verification</div>
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">Verify document hash to confirm no tampering.</p>
      <div class="form-group">
        <label class="form-label">Document Hash (SHA-256)</label>
        <input id="audit-hash-input" class="form-input" placeholder="Paste hash here..." style="font-family:var(--font-mono);font-size:0.75rem">
      </div>
      <button class="btn btn-ghost" style="width:100%" onclick="verifyEvidenceHashLive()">${icon('shield')} Verify Hash</button>
      <div id="audit-hash-result" style="margin-top:0.75rem;padding:0.625rem;background:var(--bg-secondary);border-radius:6px;font-size:0.75rem;font-family:var(--font-mono);color:var(--text-muted)">
        Paste a stored manifest or signed PDF hash to verify it.
      </div>
    </div>

    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Compliance Standards</div>
      <div class="flex flex-col gap-2" style="font-size:0.8125rem">
        ${[['ESIGN Act (US)','Compliant','success'],['eIDAS (EU)','Compliant','success'],['UETA (US)','Compliant','success'],['SOC 2 Type II','Audited','primary'],['ISO 27001','Certified','primary'],['HIPAA','Compliant','success']].map(([std,status,color])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0;border-bottom:1px solid var(--border)">
            <span style="color:var(--text-secondary)">${std}</span>
            <span class="badge badge-${color}">${status}</span>
          </div>`).join('')}
      </div>
    </div>
  </div>
</div>
`);

function auditEvent(ts,type,ref,user,ip,location,detail,severity) {
  const colors = {success:'var(--success)',info:'var(--primary)',warning:'var(--warning)',danger:'var(--danger)'};
  const icons = {success:'check-circle',info:'info',warning:'alert-triangle',danger:'x-circle'};
  return `<div style="display:grid;grid-template-columns:160px 180px 120px 1fr auto;gap:0.5rem;padding:0.625rem 1.25rem;border-bottom:1px solid var(--border);font-size:0.75rem;align-items:start" onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">
    <span style="color:var(--text-muted)">${ts}</span>
    <span style="color:${colors[severity]};font-weight:500">${icon(icons[severity])} ${type}</span>
    <span style="color:var(--primary)">${ref}</span>
    <div>
      <div style="color:var(--text-primary)">${detail}</div>
      <div style="color:var(--text-muted);margin-top:2px">${avatar(user,16)} ${user} · ${ip} · ${location}</div>
    </div>
    <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.7rem" onclick="copyToClipboard('${escapeHtml(`${ts} ${type} ${ref} ${user} ${ip} ${location} ${detail}`).replaceAll("'", "\\'")}');showToast('Event details copied','success')">${icon('copy')}</button>
  </div>`;
}

function generateEvidenceBundle() {
  generateEvidenceBundleLive();
}

// ── Live wiring ──────────────────────────────────────────────────────────────

let _auditPage_current = 1;
let _auditFilterTimer = null;
let _auditLatestEvents = [];

function _auditFilterDebounce() {
  clearTimeout(_auditFilterTimer);
  _auditFilterTimer = setTimeout(audit_init, 400);
}

function _auditPage(delta) {
  _auditPage_current = Math.max(1, _auditPage_current + delta);
  audit_init();
}

async function audit_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  const container = document.getElementById('audit-events-container');
  const countEl = document.getElementById('audit-event-count');
  const pageInfo = document.getElementById('audit-page-info');
  if (!container) return;

  const search = document.getElementById('audit-search')?.value || '';
  const eventPrefix = document.getElementById('audit-event-type')?.value || '';
  const dateFrom = document.getElementById('audit-date-from')?.value || '';
  const dateTo = document.getElementById('audit-date-to')?.value || '';

  const params = new URLSearchParams({organization: orgId, page: _auditPage_current, page_size: 25});
  if (search) params.set('search', search);
  if (eventPrefix) params.set('event_type__startswith', eventPrefix);
  if (dateFrom) params.set('created_at__gte', dateFrom);
  if (dateTo) params.set('created_at__lte', dateTo + 'T23:59:59');

  container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading…</div>';
  try {
    const data = await hanmakApi(`/audit-events/?${params}`);
    const events = data.results || data;
    _auditLatestEvents = events;
    const total = data.count || events.length;
    const pageSize = 25;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (countEl) countEl.textContent = `Showing page ${_auditPage_current} of ${totalPages} (${total} events)`;
    if (pageInfo) pageInfo.textContent = `Page ${_auditPage_current} of ${totalPages}`;
    if (!events.length) {
      container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No events match your filters.</div>';
      return;
    }
    const severityMeta = {
      info: {color:'var(--primary)', icon:'info'},
      warning: {color:'var(--warning)', icon:'alert-triangle'},
      critical: {color:'var(--danger)', icon:'x-circle'},
      debug: {color:'var(--text-muted)', icon:'info'},
    };
    container.innerHTML = events.map(e => {
      const ts = e.created_at ? new Date(e.created_at).toISOString().replace('T',' ').slice(0,19) : '—';
      const meta = severityMeta[e.severity] || severityMeta.info;
      const actor = e.actor_username || 'System';
      const ip = e.ip_address || '—';
      const envelope = e.envelope_name ? `<span style="color:var(--primary)">${e.envelope_name}</span>` : '<span style="color:var(--text-muted)">—</span>';
      return `<div style="display:grid;grid-template-columns:160px 180px 120px 1fr auto;gap:0.5rem;padding:0.625rem 1.25rem;border-bottom:1px solid var(--border);font-size:0.75rem;align-items:start" onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">
        <span style="color:var(--text-muted)">${ts}</span>
        <span style="color:${meta.color};font-weight:500">${icon(meta.icon)} ${e.event_type}</span>
        ${envelope}
        <div>
          <div style="color:var(--text-primary)">${e.message}</div>
          <div style="color:var(--text-muted);margin-top:2px">${avatar(actor,16)} ${actor} · ${ip}</div>
        </div>
        <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:0.7rem" onclick="copyToClipboard('${e.event_type}: ${(e.message||'').replace(/'/g,'')}');showToast('Copied','success')">${icon('copy')}</button>
      </div>`;
    }).join('');
  } catch(err) {
    container.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Failed to load audit events.</div>';
  }
}

function exportAuditReportLive() {
  const rows = _auditLatestEvents || [];
  if (!rows.length) return showToast('Load audit events before exporting.', 'info');
  const csv = ['id,event_type,message,actor,ip_address,created_at']
    .concat(rows.map(row => [
      row.id,
      `"${String(row.event_type || '').replaceAll('"', '""')}"`,
      `"${String(row.message || '').replaceAll('"', '""')}"`,
      `"${String(row.actor_username || 'System').replaceAll('"', '""')}"`,
      row.ip_address || '',
      row.created_at || '',
    ].join(','))).join('\n');
  downloadTextFile(`hanmak-audit-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
  showToast(`${rows.length} audit event(s) exported as CSV`, 'success');
}

async function verifyEvidenceHashLive() {
  const hash = document.getElementById('audit-hash-input')?.value.trim().toLowerCase();
  const resultEl = document.getElementById('audit-hash-result');
  if (!hash) return showToast('Paste a SHA-256 hash first', 'error');
  try {
    const data = await hanmakApi('/evidence-bundles/');
    const bundles = data.results || data;
    const match = bundles.find(bundle => [bundle.sha256, bundle.signed_pdf_sha256].filter(Boolean).map(v => String(v).toLowerCase()).includes(hash));
    if (!match) {
      if (resultEl) resultEl.innerHTML = `Status: NOT FOUND<br>Hash: ${escapeHtml(hash)}`;
      return showToast('Hash not found in stored evidence bundles', 'warning');
    }
    const verification = await hanmakApi(`/evidence-bundles/${match.id}/verify/`, {method:'POST'});
    if (resultEl) {
      resultEl.innerHTML = `Bundle: #${match.id}<br>Envelope: #${match.envelope}<br>Status: ${verification.valid ? 'VALID' : 'NEEDS REVIEW'}<br>Hash: ${escapeHtml(hash)}`;
    }
    showToast(verification.valid ? 'Hash verified against evidence bundle' : 'Bundle found but verification needs review', verification.valid ? 'success' : 'warning');
  } catch (error) {
    showToast(`Hash verification failed: ${error.message}`, 'error');
  }
}

async function generateEvidenceBundleLive() {
  // Get most recent envelope from audit events to show context
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('package')} Generate Evidence Bundle</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Envelope ID</label>
        <input id="evidence-envelope-input" class="form-input" placeholder="Enter envelope ID or number">
      </div>
      <div class="form-group">
        <label class="form-label">Include</label>
        <div class="flex flex-col gap-2" style="font-size:0.8125rem">
          ${['Signed PDF Document','Audit Trail PDF','Digital Certificate Chain','IP Geolocation Records','Signature Images'].map(item=>`
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
              <input type="checkbox" checked> ${item}
            </label>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_requestEvidenceBundle()">${icon('package')} Generate Bundle</button>
    </div>
  `);
}

async function _requestEvidenceBundle() {
  const envelopeInput = document.getElementById('evidence-envelope-input')?.value?.trim();
  if (!envelopeInput) { showToast('Enter an envelope ID', 'error'); return; }
  closeModal();
  try {
    const orgId = await firstOrganizationId();
    const envelopesData = await hanmakApi(`/envelopes/?organization=${orgId}`);
    const envelopes = envelopesData.results || envelopesData;
    const matched = envelopes.find(e => String(e.id) === envelopeInput || (e.name || '').toLowerCase().includes(envelopeInput.toLowerCase()));
    const envelopeId = matched ? matched.id : null;
    if (!envelopeId) { showToast('Envelope not found', 'error'); return; }
    const bundle = await hanmakApi('/evidence-bundles/', {method:'POST', body: JSON.stringify({envelope: envelopeId, organization: orgId})});
    showToast(`Evidence bundle #${bundle.id} created`, 'success');
  } catch(e) { showToast('Failed to create evidence bundle', 'error'); }
}

registerPage('evidence-bundles', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Evidence Bundles</h1>
    <p class="page-subtitle">Generate, verify, and inspect evidence packages for completed envelopes</p>
  </div>
  <button class="btn btn-primary" onclick="generateEvidenceBundleLive()">${icon('package')} New Bundle</button>
</div>
<div id="evidence-bundle-list" class="flex flex-col gap-3">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading evidence bundles…</div>
</div>
`);

async function evidence_bundles_init() {
  if (!await ensureHanmakApi()) return;
  const list = document.getElementById('evidence-bundle-list');
  if (!list) return;
  try {
    const data = await hanmakApi('/evidence-bundles/');
    const rows = data.results || data;
    list.innerHTML = rows.length ? rows.map(bundle => `
      <div class="card" style="padding:1rem">
        <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start">
          <div>
            <div style="font-weight:700">Bundle #${bundle.id} · Envelope #${bundle.envelope}</div>
            <div style="font-size:0.8125rem;color:var(--text-muted);margin-top:0.25rem">Status: ${titleCaseStatus(bundle.status)} · Generated ${apiDate(bundle.generated_at || bundle.created_at)}</div>
            <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted);margin-top:0.5rem">Manifest: ${bundle.sha256 || 'not generated'}<br>Signed PDF: ${bundle.signed_pdf_sha256 || 'not generated'}</div>
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" onclick="generateEvidenceManifestLive(${bundle.id})">${icon('file-text')} Generate Manifest</button>
            <button class="btn btn-ghost btn-sm" onclick="generateEvidencePdfLive(${bundle.id})">${icon('download')} Signed PDF</button>
            <button class="btn btn-ghost btn-sm" onclick="verifyEvidenceBundleLive(${bundle.id})">${icon('shield')} Verify</button>
            <button class="btn btn-ghost btn-sm" onclick="openEvidenceVisualQaLive(${bundle.id})">${icon('eye')} Visual QA</button>
          </div>
        </div>
      </div>
    `).join('') : '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No evidence bundles yet.</div>';
  } catch (error) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger)">Failed to load evidence bundles: ${escapeHtml(error.message)}</div>`;
  }
}

async function generateEvidenceManifestLive(id) {
  await hanmakApi(`/evidence-bundles/${id}/generate/`, {method:'POST'});
  showToast(`Evidence bundle #${id} manifest generated`, 'success');
  evidence_bundles_init();
}

async function generateEvidencePdfLive(id) {
  await hanmakApi(`/evidence-bundles/${id}/generate-signed-pdf/`, {method:'POST'});
  showToast(`Evidence bundle #${id} signed PDF generated`, 'success');
  evidence_bundles_init();
}

async function verifyEvidenceBundleLive(id) {
  const result = await hanmakApi(`/evidence-bundles/${id}/verify/`, {method:'POST'});
  openModal(`<div class="modal-header"><h3 class="modal-title">Evidence Verification</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="badge badge-${result.valid ? 'success' : 'danger'}" style="margin-bottom:1rem">${result.valid ? 'Valid' : 'Needs Review'}</div>
      <pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:1rem;border-radius:7px;font-size:0.75rem">${escapeHtml(JSON.stringify(result, null, 2))}</pre>
    </div>`);
}

async function openEvidenceVisualQaLive(id) {
  const qa = await hanmakApi(`/evidence-bundles/${id}/visual-qa/`);
  openModal(`<div class="modal-header"><h3 class="modal-title">Visual QA · Bundle #${id}</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="badge badge-${qa.status === 'ready' ? 'success' : 'warning'}" style="margin-bottom:1rem">${titleCaseStatus(qa.status)}</div>
      ${(qa.warnings || []).map(w => `<div style="color:var(--warning);font-size:0.8125rem;margin-bottom:0.35rem">${icon('alert-triangle')} ${escapeHtml(w)}</div>`).join('') || '<div style="color:var(--success);font-size:0.8125rem;margin-bottom:0.75rem">No visual QA warnings.</div>'}
      <pre style="white-space:pre-wrap;background:var(--bg-secondary);padding:1rem;border-radius:7px;font-size:0.75rem">${escapeHtml(JSON.stringify(qa.documents || [], null, 2))}</pre>
    </div>`);
}
