registerPage('api-keys', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">API Keys</h1>
    <p class="page-subtitle">Manage API credentials for programmatic access to HanMak</p>
  </div>
  <button class="btn btn-primary" onclick="createApiKey()">${icon('plus')} Create API Key</button>
</div>

<div style="display:grid;grid-template-columns:1fr 300px;gap:1.5rem">
  <div id="api-keys-list" class="flex flex-col gap-4">
    <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading API keys…</div>
  </div>

  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Usage Overview</div>
      ${['Today','This Week','This Month'].map((period,i)=>`
        <div style="margin-bottom:0.875rem">
          <div style="display:flex;justify-content:space-between;font-size:0.8125rem;margin-bottom:4px">
            <span style="color:var(--text-muted)">${period}</span>
            <span style="font-weight:600">${['4,821','38,442','1.24M'][i]}</span>
          </div>
          <div style="height:6px;background:var(--border);border-radius:3px"><div style="height:100%;width:${['22%','58%','82%'][i]};background:var(--primary);border-radius:3px"></div></div>
        </div>`).join('')}
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem">Rate limit: 10,000 req/hr per key</div>
    </div>

    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Available Scopes</div>
      <div class="flex flex-col gap-1" style="font-size:0.78rem">
        ${[['envelopes:read','Read envelope data'],['envelopes:write','Create & modify envelopes'],['templates:read','Read templates'],['templates:write','Create & modify templates'],['signatures:write','Place signatures via API'],['webhooks:read','Read webhook configs'],['webhooks:manage','Create & manage webhooks'],['users:read','Read user profiles'],['users:manage','Manage users & roles'],['audit:read','Read audit trail'],['admin:all','Full admin access']].map(([scope,desc])=>`
          <div style="padding:0.375rem 0;border-bottom:1px solid var(--border)">
            <code style="font-size:0.72rem;background:var(--bg-secondary);padding:1px 5px;border-radius:3px;color:var(--primary)">${scope}</code>
            <div style="color:var(--text-muted);margin-top:2px">${desc}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Security Best Practices</div>
      <div class="flex flex-col gap-2" style="font-size:0.8125rem;color:var(--text-secondary)">
        ${['Never commit keys to source control','Rotate keys every 90 days','Use test keys for development','Assign minimal required scopes','Enable IP allowlisting','Monitor usage for anomalies'].map(tip=>`<div style="display:flex;gap:0.5rem">${icon('shield')} ${tip}</div>`).join('')}
      </div>
    </div>
  </div>
</div>
`);

// ── Live wiring ──────────────────────────────────────────────────────────────

function _renderApiKeyCardLive(k) {
  const masked = (k.key_prefix || 'hm_???') + '••••••••••••••••••••';
  const scopes = Array.isArray(k.scopes) ? k.scopes : [];
  const statusBadge = k.status === 'active'
    ? `<span class="badge badge-success">Active</span>`
    : `<span class="badge badge-danger">${k.status}</span>`;
  const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never';
  return `<div class="card" style="padding:1.25rem" data-key-id="${k.id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div>
        <div style="font-weight:700;font-size:0.9375rem;margin-bottom:4px">${k.name}</div>
        <div style="display:flex;gap:0.5rem;align-items:center">
          ${statusBadge}
          <span style="font-size:0.75rem;color:var(--text-muted)">Created ${new Date(k.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm" onclick="rotateKeyLive(${k.id},'${k.name}')" title="Rotate">${icon('refresh')}</button>
        <button class="btn btn-ghost btn-sm" onclick="editKeyScopesLive(${k.id},${JSON.stringify(scopes).replace(/"/g,"'")})" title="Edit Scopes">${icon('edit')}</button>
        <button class="btn btn-ghost btn-sm" onclick="revokeKeyLive(${k.id})" title="Revoke" style="color:var(--danger)">${icon('trash')}</button>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:0.5rem;padding:0.625rem 0.75rem;background:var(--bg-secondary);border-radius:7px;font-family:var(--font-mono);font-size:0.8125rem;margin-bottom:1rem">
      <span id="live-key-${k.id}" style="flex:1;color:var(--text-muted)">${masked}</span>
      <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${masked}');showToast('Prefix copied (full key not stored)','info')" style="padding:2px 8px;font-size:0.75rem">${icon('copy')}</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem;text-align:center">
      ${[['Last Used',lastUsed],['Scopes',scopes.length],['Status',k.status]].map(([l,v])=>`<div style="padding:0.5rem;background:var(--bg-secondary);border-radius:6px"><div style="font-weight:600;font-size:0.875rem">${v}</div><div style="font-size:0.72rem;color:var(--text-muted)">${l}</div></div>`).join('')}
    </div>
    <div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.375rem">Scopes</div>
      <div class="flex" style="flex-wrap:wrap;gap:4px">
        ${scopes.map(s=>`<code style="font-size:0.72rem;background:var(--primary-light,#dbeafe);color:var(--primary);padding:2px 6px;border-radius:4px">${s}</code>`).join('')}
        ${scopes.length === 0 ? '<span style="font-size:0.75rem;color:var(--text-muted)">No scopes assigned</span>' : ''}
      </div>
    </div>
  </div>`;
}

async function api_keys_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  const list = document.getElementById('api-keys-list');
  if (!list) return;
  try {
    const data = await hanmakApi(`/api-keys/?organization=${orgId}`);
    const keys = data.results || data;
    list.innerHTML = keys.length
      ? keys.map(k => _renderApiKeyCardLive(k)).join('')
      : `<div style="padding:2rem;text-align:center;color:var(--text-muted)">${icon('key')} No API keys yet. Create one to get started.</div>`;
  } catch(e) {
    list.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--danger)">Failed to load API keys.</div>`;
  }
}

async function revokeKeyLive(id) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Revoke API Key</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="background:#fee2e2;border:1px solid var(--danger);border-radius:8px;padding:1rem;font-size:0.875rem">
        ${icon('x-circle')} <strong>Warning:</strong> Revoking this key immediately blocks all API requests using it. This cannot be undone.
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="_confirmRevokeKey(${id})">${icon('trash')} Revoke Key</button>
    </div>
  `);
}

async function _confirmRevokeKey(id) {
  closeModal();
  try {
    await hanmakApi(`/api-keys/${id}/revoke/`, {method:'POST'});
    showToast('Key revoked', 'error');
    api_keys_init();
  } catch(e) { showToast('Failed to revoke key', 'error'); }
}

async function rotateKeyLive(id, name) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('refresh')} Rotate API Key</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="background:#fef3c7;border:1px solid var(--warning);border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:0.875rem">
        ${icon('alert-triangle')} <strong>This will invalidate the current key immediately.</strong> Update all services using this key before rotating.
      </div>
      <p style="font-size:0.875rem;color:var(--text-secondary)">Rotating <strong>${name}</strong>. A new key will be issued with the same scopes.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-warning" onclick="_confirmRotateKey(${id})">${icon('refresh')} Rotate Key</button>
    </div>
  `);
}

async function _confirmRotateKey(id) {
  closeModal();
  try {
    const data = await hanmakApi(`/api-keys/${id}/rotate/`, {method:'POST'});
    const newKey = data.key || '';
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('check-circle')} Key Rotated!</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div style="background:#dcfce7;border:1px solid var(--success);border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:0.875rem">
          ${icon('alert-triangle')} <strong>Copy this key now.</strong> It will not be shown again.
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem;background:var(--bg-secondary);border-radius:7px;font-family:var(--font-mono);font-size:0.8125rem;word-break:break-all">
          <span style="flex:1">${newKey}</span>
          <button class="btn btn-primary btn-sm" onclick="copyToClipboard('${newKey}');showToast('Key copied!','success')">${icon('copy')}</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal();api_keys_init()">Done — I've Copied It</button>
      </div>
    `);
  } catch(e) { showToast('Failed to rotate key', 'error'); }
}

function editKeyScopesLive(id, currentScopes) {
  const allScopes = ['envelopes:read','envelopes:write','templates:read','templates:write','signatures:write','webhooks:read','webhooks:manage','users:read','users:manage','audit:read','admin:all'];
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Edit Scopes</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="flex flex-col gap-2" style="font-size:0.8125rem" id="scope-checkboxes">
        ${allScopes.map(s=>`
          <label style="display:flex;align-items:center;gap:0.625rem;cursor:pointer;padding:0.375rem;border-radius:5px" onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">
            <input type="checkbox" value="${s}" ${currentScopes.includes(s)?'checked':''}>
            <code style="font-size:0.75rem;color:var(--primary)">${s}</code>
          </label>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveScopesLive(${id})">Save Scopes</button>
    </div>
  `);
}

async function _saveScopesLive(id) {
  const checked = [...document.querySelectorAll('#scope-checkboxes input:checked')].map(el => el.value);
  closeModal();
  try {
    await hanmakApi(`/api-keys/${id}/`, {method:'PATCH', body: JSON.stringify({scopes: checked})});
    showToast('Scopes updated', 'success');
    api_keys_init();
  } catch(e) { showToast('Failed to update scopes', 'error'); }
}

function createApiKey() {
  const allScopes = ['envelopes:read','envelopes:write','templates:read','signatures:write','webhooks:manage','audit:read'];
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('plus')} Create API Key</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Key Name *</label>
        <input id="new-key-name" class="form-input" placeholder="e.g. Production Backend Integration">
      </div>
      <div class="form-group"><label class="form-label">Scopes *</label>
        <div class="flex flex-col gap-2" style="font-size:0.8125rem" id="new-scope-checkboxes">
          ${allScopes.map((s,i)=>`
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer"><input type="checkbox" value="${s}" ${i<2?'checked':''}> <code style="font-size:0.75rem;color:var(--primary)">${s}</code></label>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_createApiKeyLive()">${icon('key')} Generate Key</button>
    </div>
  `);
}

async function _createApiKeyLive() {
  const name = document.getElementById('new-key-name')?.value?.trim();
  if (!name) { showToast('Key name is required', 'error'); return; }
  const scopes = [...document.querySelectorAll('#new-scope-checkboxes input:checked')].map(el => el.value);
  closeModal();
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi('/api-keys/', {method:'POST', body: JSON.stringify({name, scopes, organization: orgId})});
    const newKey = data.key || '';
    openModal(`
      <div class="modal-header"><h3 class="modal-title">${icon('check-circle')} API Key Created!</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">
        <div style="background:#dcfce7;border:1px solid var(--success);border-radius:8px;padding:1rem;margin-bottom:1rem;font-size:0.875rem">
          ${icon('alert-triangle')} <strong>Copy this key now.</strong> It will not be shown again after you close this dialog.
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;padding:0.75rem;background:var(--bg-secondary);border-radius:7px;font-family:var(--font-mono);font-size:0.8125rem;word-break:break-all">
          <span style="flex:1">${newKey}</span>
          <button class="btn btn-primary btn-sm" onclick="copyToClipboard('${newKey}');showToast('Key copied!','success')">${icon('copy')}</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal();api_keys_init()">Done — I've Copied It</button>
      </div>
    `);
  } catch(e) { showToast('Failed to create key', 'error'); }
}
