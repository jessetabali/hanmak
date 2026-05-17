// ==================== OAUTH APPS ====================
registerPage('oauth-apps', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">OAuth Applications</h1>
    <p class="page-subtitle">Manage OAuth 2.0 client applications and their permissions</p>
  </div>
  <button class="btn btn-primary" onclick="createOAuthApp()">${icon('plus')} New OAuth App</button>
</div>

<div id="oauth-apps-list" class="flex flex-col gap-4">
  <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading OAuth apps…</div>
</div>
`);

// ==================== WEBHOOKS ====================
registerPage('webhooks', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Webhooks</h1>
    <p class="page-subtitle">Configure HTTP endpoints to receive real-time event notifications</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openWebhookLab()">${icon('code')} Webhook Lab</button>
    <button class="btn btn-primary" onclick="addWebhookLive()">${icon('plus')} Add Endpoint</button>
  </div>
</div>

<div style="display:grid;grid-template-columns:1fr 300px;gap:1.5rem">
  <div id="webhooks-list" class="flex flex-col gap-4">
    <div style="padding:2rem;text-align:center;color:var(--text-muted)">Loading webhooks…</div>
  </div>

  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:1rem">Delivery Stats</div>
      <div id="webhook-delivery-stats">
        ${[['Delivered','—','success'],['Failed','—','danger'],['Pending','—','secondary']].map(([l,v,c])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.8125rem">${l}</span>
            <span class="badge badge-${c}" id="wh-stat-${l.toLowerCase()}">${v}</span>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.75rem">Retry Policy</div>
      <div class="flex flex-col gap-2" style="font-size:0.8125rem">
        <div>Retries: <strong>5 attempts</strong></div>
        <div>Backoff: <strong>Exponential (1m, 5m, 30m, 2h, 24h)</strong></div>
        <div>Timeout: <strong>30 seconds per attempt</strong></div>
      </div>
    </div>
  </div>
</div>
`);

function addWebhook() { addWebhookLive(); }

// ── Live wiring: OAuth Apps ───────────────────────────────────────────────────

function jsArg(value) {
  return JSON.stringify(String(value ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _renderOAuthAppCard(app) {
  const scopes = Array.isArray(app.scopes) ? app.scopes : [];
  const uris = Array.isArray(app.redirect_uris) ? app.redirect_uris : [];
  const statusBadge = app.status === 'active' ? 'success' : 'secondary';
  return `<div class="card" style="padding:1.25rem">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div>
        <div style="font-weight:700;font-size:0.9375rem;margin-bottom:4px">${app.name}</div>
        <div class="flex gap-2">
          <span class="badge badge-${statusBadge}">${app.status || 'draft'}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">Created ${new Date(app.created_at).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm" onclick="openOAuthAppEditModal(${app.id})" title="Edit">${icon('edit')}</button>
        <button class="btn btn-ghost btn-sm" onclick="showOAuthSecretPolicy(${app.id}, ${jsArg(app.name)}, ${jsArg(app.client_id || '')})" title="Secret">${icon('eye')}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteOAuthAppLive(${app.id}, ${jsArg(app.name)})" title="Delete">${icon('trash')}</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Client ID</div>
        <code style="font-size:0.8rem;font-family:var(--font-mono)">${app.client_id || '—'}</code>
      </div>
      <div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:4px">Redirect URIs</div>
        ${uris.map(u=>`<code style="font-size:0.75rem;font-family:var(--font-mono);display:block;color:var(--primary)">${u}</code>`).join('') || '<span style="font-size:0.75rem;color:var(--text-muted)">None</span>'}
      </div>
    </div>
    <div>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.375rem">Requested Scopes</div>
      <div class="flex" style="flex-wrap:wrap;gap:4px">
        ${scopes.map(s=>`<code style="font-size:0.72rem;background:var(--bg-secondary);padding:2px 6px;border-radius:4px;color:var(--primary)">${s}</code>`).join('')}
        ${scopes.length === 0 ? '<span style="font-size:0.75rem;color:var(--text-muted)">No scopes</span>' : ''}
      </div>
    </div>
  </div>`;
}

async function openOAuthAppEditModal(id) {
  try {
    const app = await hanmakApi(`/oauth-apps/${id}/`);
    const allScopes = ['envelopes:read','envelopes:write','templates:read','signatures:write','users:read'];
    const selectedScopes = new Set(app.scopes || []);
    openModal(`
      <div class="modal">
        <div class="modal-header"><h3 class="modal-title">Edit OAuth Application</h3><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <input id="oauth-edit-id" type="hidden" value="${app.id}">
          <div class="form-group"><label class="form-label">Application Name</label><input id="oauth-edit-name" class="form-input" value="${escapeHtml(app.name || '')}"></div>
          <div class="form-group"><label class="form-label">Status</label><select id="oauth-edit-status" class="form-input">
            ${['active','disabled'].map(status => `<option value="${status}" ${app.status === status ? 'selected' : ''}>${titleCaseStatus(status)}</option>`).join('')}
          </select></div>
          <div class="form-group"><label class="form-label">Redirect URIs</label><textarea id="oauth-edit-uris" class="form-input" rows="4">${escapeHtml((app.redirect_uris || []).join('\n'))}</textarea></div>
          <div class="form-group"><label class="form-label">Scopes</label><div id="oauth-edit-scopes" class="flex flex-wrap gap-2" style="font-size:0.8125rem">
            ${allScopes.map(scope => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="${scope}" ${selectedScopes.has(scope) ? 'checked' : ''}> ${scope}</label>`).join('')}
          </div></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveOAuthAppEditLive()">${icon('save')} Save</button></div>
      </div>
    `);
  } catch (error) {
    showToast(`OAuth app load failed: ${error.message}`, 'error', 7000);
  }
}

async function saveOAuthAppEditLive() {
  const id = document.getElementById('oauth-edit-id')?.value;
  const payload = {
    name: document.getElementById('oauth-edit-name')?.value.trim(),
    status: document.getElementById('oauth-edit-status')?.value || 'active',
    redirect_uris: (document.getElementById('oauth-edit-uris')?.value || '').split('\n').map(uri => uri.trim()).filter(Boolean),
    scopes: [...document.querySelectorAll('#oauth-edit-scopes input:checked')].map(input => input.value),
  };
  if (!payload.name) return showToast('Application name is required', 'error');
  if (!payload.redirect_uris.length) return showToast('At least one redirect URI is required', 'error');
  try {
    await hanmakApi(`/oauth-apps/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)});
    closeModal();
    showToast('OAuth app saved', 'success');
    oauth_apps_init();
  } catch (error) {
    showToast(`OAuth app save failed: ${error.message}`, 'error', 7000);
  }
}

function showOAuthSecretPolicy(id, name, clientId) {
  openModal(`
    <div class="modal">
      <div class="modal-header"><h3 class="modal-title">${icon('eye')} OAuth Client Secret</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Application</label><div class="form-input" style="height:auto;background:var(--bg-secondary)">${escapeHtml(name)}</div></div>
        <div class="form-group"><label class="form-label">Client ID</label><div class="form-input" style="height:auto;background:var(--bg-secondary);font-family:var(--font-mono)">${escapeHtml(clientId)}</div></div>
        <div id="oauth-secret-result" class="alert alert-info">${icon('lock')} Client secrets are stored hashed and cannot be revealed after creation. Rotate the secret to generate a replacement and copy it immediately.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn btn-primary" onclick="rotateOAuthSecretLive(${id})">${icon('refresh')} Rotate Secret</button>
      </div>
    </div>
  `);
}

async function rotateOAuthSecretLive(id) {
  try {
    const data = await hanmakApi(`/oauth-apps/${id}/rotate-secret/`, {method: 'POST'});
    const result = document.getElementById('oauth-secret-result');
    if (result) {
      result.className = 'alert alert-warning';
      result.innerHTML = `${icon('key')} Copy this client secret now. It will not be shown again.<br><code style="display:block;margin-top:0.75rem;white-space:normal;word-break:break-all;font-family:var(--font-mono)">${escapeHtml(data.client_secret || '')}</code>`;
    }
    showToast('OAuth secret rotated', 'success');
    oauth_apps_init();
  } catch (error) {
    showToast(`Secret rotation failed: ${error.message}`, 'error', 7000);
  }
}

async function oauth_apps_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  const list = document.getElementById('oauth-apps-list');
  if (!list) return;
  try {
    const data = await hanmakApi(`/oauth-apps/?organization=${orgId}`);
    const apps = data.results || data;
    list.innerHTML = apps.length
      ? apps.map(a => _renderOAuthAppCard(a)).join('')
      : `<div style="padding:2rem;text-align:center;color:var(--text-muted)">${icon('code')} No OAuth apps yet.</div>`;
  } catch(e) {
    list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Failed to load OAuth apps.</div>';
  }
}

async function deleteOAuthAppLive(id, name) {
  confirm(`Delete OAuth app "${name}"? This will immediately revoke all grants.`, async () => {
    try {
      await hanmakApi(`/oauth-apps/${id}/`, {method:'DELETE'});
      showToast('OAuth app deleted', 'error');
      oauth_apps_init();
    } catch(e) { showToast('Failed to delete app', 'error'); }
  });
}

function createOAuthApp() {
  const allScopes = ['envelopes:read','envelopes:write','templates:read','signatures:write','users:read'];
  openModal(`
    <div class="modal-header"><h3 class="modal-title">New OAuth Application</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Application Name *</label><input id="oauth-new-name" class="form-input" placeholder="My Integration"></div>
      <div class="form-group"><label class="form-label">Redirect URIs *</label>
        <textarea id="oauth-new-uris" class="form-input" rows="3" placeholder="https://yourapp.com/auth/callback"></textarea>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">One URI per line.</div>
      </div>
      <div class="form-group"><label class="form-label">Requested Scopes</label>
        <div id="oauth-new-scopes" class="flex flex-wrap gap-2" style="font-size:0.8125rem">
          ${allScopes.map(s=>`<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="checkbox" value="${s}"> ${s}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_createOAuthAppLive()">Create Application</button>
    </div>
  `);
}

async function _createOAuthAppLive() {
  const name = document.getElementById('oauth-new-name')?.value?.trim();
  const urisRaw = document.getElementById('oauth-new-uris')?.value || '';
  const uris = urisRaw.split('\n').map(u => u.trim()).filter(Boolean);
  const scopes = [...document.querySelectorAll('#oauth-new-scopes input:checked')].map(el => el.value);
  if (!name) { showToast('Application name is required', 'error'); return; }
  if (!uris.length) { showToast('At least one redirect URI is required', 'error'); return; }
  closeModal();
  try {
    const orgId = await firstOrganizationId();
    await hanmakApi('/oauth-apps/', {method:'POST', body: JSON.stringify({name, redirect_uris: uris, scopes, organization: orgId})});
    showToast('OAuth app created!', 'success');
    oauth_apps_init();
  } catch(e) { showToast('Failed to create OAuth app', 'error'); }
}

// ── Live wiring: Webhooks ─────────────────────────────────────────────────────

function _renderWebhookCardLive(wh) {
  const events = Array.isArray(wh.events) ? wh.events : [];
  const statusColor = wh.is_active ? 'success' : 'secondary';
  return `<div class="card" style="padding:1.25rem" data-wh-id="${wh.id}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem">
      <div style="flex:1;min-width:0">
        <div style="font-family:var(--font-mono);font-size:0.8125rem;font-weight:600;word-break:break-all;margin-bottom:6px">${wh.target_url}</div>
        <div class="flex gap-2">
          <span class="badge badge-${statusColor}">${wh.is_active ? 'active' : 'disabled'}</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">${wh.name || ''}</span>
        </div>
      </div>
      <div class="flex gap-1" style="margin-left:0.75rem;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="testWebhookEndpointLive(${wh.id})" title="Test">${icon('send')}</button>
        <button class="btn btn-ghost btn-sm" onclick="viewDeliveriesLive(${wh.id}, ${jsArg(wh.target_url)})" title="History">${icon('clock')}</button>
        <button class="btn btn-ghost btn-sm" onclick="openWebhookEditModal(${wh.id})" title="Edit">${icon('edit')}</button>
        <button class="btn btn-ghost btn-sm" onclick="deleteWebhookLive(${wh.id})" title="Delete" style="color:var(--danger)">${icon('trash')}</button>
      </div>
    </div>
    <div style="margin-bottom:0.75rem">
      <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.375rem">Subscribed Events</div>
      <div class="flex flex-wrap gap-1">
        ${events.map(e=>`<code style="font-size:0.72rem;background:var(--bg-secondary);padding:2px 6px;border-radius:4px">${e}</code>`).join('')}
        ${events.length === 0 ? '<span style="font-size:0.75rem;color:var(--text-muted)">No events subscribed</span>' : ''}
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.75rem;color:var(--text-muted)">
      ${icon('lock')} Signing secret: <code style="font-family:var(--font-mono)">${wh.signing_secret ? wh.signing_secret.slice(0,8)+'••••••••' : '—'}</code>
    </div>
  </div>`;
}

async function openWebhookEditModal(id) {
  try {
    const endpoint = await hanmakApi(`/webhook-endpoints/${id}/`);
    const eventList = ['envelope.sent','envelope.viewed','envelope.completed','envelope.voided','signature.applied','approval.granted','approval.declined','user.created'];
    const selectedEvents = new Set(endpoint.events || []);
    openModal(`
      <div class="modal">
        <div class="modal-header"><h3 class="modal-title">Edit Webhook Endpoint</h3><button class="modal-close" onclick="closeModal()">x</button></div>
        <div class="modal-body">
          <input id="wh-edit-id" type="hidden" value="${endpoint.id}">
          <div class="form-group"><label class="form-label">Name</label><input id="wh-edit-name" class="form-input" value="${escapeHtml(endpoint.name || '')}"></div>
          <div class="form-group"><label class="form-label">Target URL</label><input id="wh-edit-url" class="form-input" type="url" value="${escapeHtml(endpoint.target_url || '')}"></div>
          <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem"><input id="wh-edit-active" type="checkbox" ${endpoint.is_active ? 'checked' : ''}> Active</label>
          <div class="form-group"><label class="form-label">Events</label><div id="wh-edit-events" class="flex flex-col gap-2" style="font-size:0.8125rem">
            ${eventList.map(eventName => `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer"><input type="checkbox" value="${eventName}" ${selectedEvents.has(eventName) ? 'checked' : ''}> <code style="font-size:0.75rem">${eventName}</code></label>`).join('')}
          </div></div>
        </div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveWebhookEditLive()">${icon('save')} Save</button></div>
      </div>
    `);
  } catch (error) {
    showToast(`Webhook load failed: ${error.message}`, 'error', 7000);
  }
}

async function saveWebhookEditLive() {
  const id = document.getElementById('wh-edit-id')?.value;
  const payload = {
    name: document.getElementById('wh-edit-name')?.value.trim(),
    target_url: document.getElementById('wh-edit-url')?.value.trim(),
    is_active: document.getElementById('wh-edit-active')?.checked,
    events: [...document.querySelectorAll('#wh-edit-events input:checked')].map(input => input.value),
  };
  if (!payload.name) payload.name = payload.target_url;
  if (!payload.target_url) return showToast('Target URL is required', 'error');
  try {
    await hanmakApi(`/webhook-endpoints/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)});
    closeModal();
    showToast('Webhook endpoint saved', 'success');
    webhooks_init();
  } catch (error) {
    showToast(`Webhook save failed: ${error.message}`, 'error', 7000);
  }
}

async function testWebhookEndpointLive(id) {
  try {
    const endpoint = await hanmakApi(`/webhook-endpoints/${id}/`);
    const eventType = (endpoint.events || [])[0] || 'webhook.test';
    const orgId = endpoint.organization || await firstOrganizationId();
    const event = await hanmakApi('/event-outbox/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        event_type: eventType,
        aggregate_type: 'webhook_endpoint',
        aggregate_id: String(endpoint.id),
        payload: {event: eventType, endpoint_id: endpoint.id, test: true, queued_at: new Date().toISOString()},
      }),
    });
    await hanmakApi('/webhook-deliveries/', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: endpoint.id,
        event: event.id,
        status: 'pending',
        request_body: event.payload,
      }),
    });
    showToast('Webhook test delivery queued', 'success');
    webhooks_init();
  } catch (error) {
    showToast(`Webhook test failed: ${error.message}`, 'error', 7000);
  }
}

async function webhooks_init() {
  await ensureHanmakApi();
  const orgId = await firstOrganizationId();
  const list = document.getElementById('webhooks-list');
  if (!list) return;
  try {
    const [endpointsData, deliveriesData] = await Promise.all([
      hanmakApi(`/webhook-endpoints/?organization=${orgId}`),
      hanmakApi(`/webhook-deliveries/?page_size=100`),
    ]);
    const endpoints = endpointsData.results || endpointsData;
    const deliveries = deliveriesData.results || deliveriesData;
    list.innerHTML = endpoints.length
      ? endpoints.map(wh => _renderWebhookCardLive(wh)).join('')
      : `<div style="padding:2rem;text-align:center;color:var(--text-muted)">${icon('send')} No webhook endpoints configured.</div>`;
    // Update delivery stats
    const delivered = deliveries.filter(d => d.status === 'delivered').length;
    const failed = deliveries.filter(d => d.status === 'failed').length;
    const pending = deliveries.filter(d => d.status === 'pending').length;
    ['delivered','failed','pending'].forEach((s,i) => {
      const el = document.getElementById(`wh-stat-${s}`);
      if (el) el.textContent = [delivered,failed,pending][i];
    });
  } catch(e) {
    list.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--danger)">Failed to load webhooks.</div>';
  }
}

async function deleteWebhookLive(id) {
  confirm('Delete this webhook endpoint? All delivery history will be lost.', async () => {
    try {
      await hanmakApi(`/webhook-endpoints/${id}/`, {method:'DELETE'});
      showToast('Webhook deleted', 'error');
      webhooks_init();
    } catch(e) { showToast('Failed to delete webhook', 'error'); }
  });
}

async function viewDeliveriesLive(endpointId, url) {
  openModal(`<div class="modal-header"><h3 class="modal-title">Delivery History</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="deliveries-modal-body"><div style="text-align:center;color:var(--text-muted)">Loading…</div></div>`);
  try {
    const data = await hanmakApi(`/webhook-deliveries/?endpoint=${endpointId}&page_size=20`);
    const deliveries = data.results || data;
    document.getElementById('deliveries-modal-body').innerHTML = deliveries.length ? `
      <table class="table">
        <thead><tr><th>Time</th><th>Event</th><th>Status</th><th>Response</th><th></th></tr></thead>
        <tbody>
          ${deliveries.map(d => `<tr>
            <td style="font-size:0.78rem;color:var(--text-muted)">${new Date(d.created_at).toLocaleString()}</td>
            <td><code style="font-size:0.75rem">${d.event || '—'}</code></td>
            <td><span class="badge badge-${d.status==='delivered'?'success':d.status==='failed'?'danger':'secondary'}">${d.response_status || d.status}</span></td>
            <td style="font-size:0.78rem;color:var(--text-muted)">${d.error_message || '—'}</td>
            <td><button class="btn btn-ghost btn-sm" onclick="replayDeliveryLive(${d.id})" title="Replay">${icon('refresh')}</button></td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<div style="text-align:center;color:var(--text-muted);padding:2rem">No deliveries yet.</div>';
  } catch(e) {
    document.getElementById('deliveries-modal-body').innerHTML = '<div style="text-align:center;color:var(--danger)">Failed to load.</div>';
  }
}

async function replayDeliveryLive(id) {
  try {
    await hanmakApi(`/webhook-deliveries/${id}/replay/`, {method:'POST'});
    showToast('Delivery replayed', 'success');
  } catch(e) { showToast('Replay failed', 'error'); }
}

function addWebhookLive() {
  const eventList = ['envelope.sent','envelope.viewed','envelope.completed','envelope.voided','signature.applied','approval.granted','approval.declined','user.created'];
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Add Webhook Endpoint</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Endpoint URL *</label>
        <input id="wh-new-url" class="form-input" placeholder="https://yourapp.com/webhooks/hanmak" type="url">
      </div>
      <div class="form-group"><label class="form-label">Name (optional)</label>
        <input id="wh-new-name" class="form-input" placeholder="CRM integration">
      </div>
      <div class="form-group"><label class="form-label">Subscribe to Events</label>
        <div id="wh-new-events" class="flex flex-col gap-2" style="font-size:0.8125rem">
          ${eventList.map(e=>`<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer"><input type="checkbox" value="${e}"> <code style="font-size:0.75rem">${e}</code></label>`).join('')}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_saveWebhookLive()">Add Endpoint</button>
    </div>
  `);
}

async function _saveWebhookLive() {
  const url = document.getElementById('wh-new-url')?.value?.trim();
  const name = document.getElementById('wh-new-name')?.value?.trim() || url;
  const events = [...document.querySelectorAll('#wh-new-events input:checked')].map(el => el.value);
  if (!url) { showToast('Endpoint URL is required', 'error'); return; }
  closeModal();
  try {
    const orgId = await firstOrganizationId();
    await hanmakApi('/webhook-endpoints/', {method:'POST', body: JSON.stringify({name, target_url: url, events, organization: orgId, is_active: true})});
    showToast('Webhook endpoint created!', 'success');
    webhooks_init();
  } catch(e) { showToast('Failed to create webhook', 'error'); }
}

function openWebhookLab() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('code')} Webhook Lab</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem">Test your webhook endpoint without triggering real events. Inspect request/response in real time.</p>
      <div class="form-group"><label class="form-label">Target URL</label><input id="webhook-lab-url" class="form-input" value="https://api.acmecorp.com/hanmak/hooks"></div>
      <div class="form-group"><label class="form-label">Event Type</label>
        <select id="webhook-lab-event" class="form-input"><option>envelope.completed</option><option>signature.applied</option><option>approval.granted</option></select>
      </div>
      <div class="form-group"><label class="form-label">Custom Payload (JSON)</label>
        <textarea id="webhook-lab-payload" class="form-input" rows="5" style="font-family:var(--font-mono);font-size:0.75rem">{"event":"envelope.completed","envelope_id":"ENV-TEST-001","timestamp":"2026-05-03T14:00:00Z"}</textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="sendWebhookLabTestLive()">${icon('send')} Queue Test Delivery</button>
    </div>
  `);
}

async function sendWebhookLabTestLive() {
  const targetUrl = document.getElementById('webhook-lab-url')?.value?.trim();
  const eventType = document.getElementById('webhook-lab-event')?.value || 'envelope.completed';
  const payloadRaw = document.getElementById('webhook-lab-payload')?.value || '{}';
  if (!targetUrl) return showToast('Webhook target URL is required', 'error');
  let payload;
  try {
    payload = JSON.parse(payloadRaw);
  } catch (_) {
    return showToast('Webhook payload must be valid JSON', 'error');
  }
  try {
    const orgId = await firstOrganizationId();
    const endpoint = await hanmakApi('/webhook-endpoints/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        name: `Webhook Lab ${new Date().toLocaleTimeString()}`,
        target_url: targetUrl,
        events: [eventType],
        is_active: true,
      }),
    });
    const event = await hanmakApi('/event-outbox/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        event_type: eventType,
        aggregate_type: 'webhook_lab',
        aggregate_id: `lab-${Date.now()}`,
        payload,
      }),
    });
    await hanmakApi('/webhook-deliveries/', {
      method: 'POST',
      body: JSON.stringify({
        endpoint: endpoint.id,
        event: event.id,
        status: 'pending',
        request_body: payload,
      }),
    });
    closeModal();
    showToast('Webhook test delivery queued', 'success');
    if (currentPage === 'webhooks') webhooks_init();
  } catch (error) {
    showToast(`Webhook test failed: ${error.message}`, 'error', 7000);
  }
}

// ==================== RELEASE CONTROL ====================
const RELEASE_MODULES = ['core','signing','templates','workflow','developer','admin','compliance','billing','integrations','operations'];
const RELEASE_STAGES = ['planned','internal','beta','released','paused','retired'];
const RELEASE_EXPECTED_FEATURE_KEYS = [
  'core_dashboard','core_inbox','core_profile','auth_login_setup',
  'envelope_management','public_signing','signing_sessions_admin',
  'template_library','form_builder','file_library',
  'workflow_builder','approval_queue',
  'api_docs','api_keys','oauth_apps','webhook_lab','sdk_cli','test_lab',
  'email_messages',
  'admin_users','admin_organizations','admin_teams','admin_roles',
  'background_tasks','system_health',
  'settings_general','settings_branding','settings_email','settings_storage','settings_security','settings_notifications',
  'identity_sso_scim',
  'audit_evidence','legal_holds','retention_policies','data_residency','compliance_exports',
  'billing_usage','license_management','roadmap','operations_console','release_control',
];

function releaseBadgeClass(stage) {
  if (stage === 'released') return 'success';
  if (stage === 'beta') return 'warning';
  if (stage === 'paused' || stage === 'retired') return 'danger';
  return 'secondary';
}

registerPage('release-control', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Release Control</h1>
    <p class="page-subtitle">Enable, QA, stage, and roll out HanMak feature modules before everyone uses them</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="release_control_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-ghost" onclick="seedReleaseControlsLive()">${icon('plus')} Seed Defaults</button>
    <button class="btn btn-primary" onclick="openReleaseFeatureModal()">${icon('plus')} New Control</button>
  </div>
</div>
<div class="stats-grid" style="--cols:5;margin-bottom:1.25rem" id="release-control-stats">
  ${['Features','Enabled','Released','In QA','Avg Rollout'].map(label => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">-</div></div>`).join('')}
</div>
<div class="card" style="padding:1rem;margin-bottom:1rem">
  <div style="display:grid;grid-template-columns:180px 180px 1fr;gap:0.75rem;align-items:end">
    <div class="form-group" style="margin:0"><label class="form-label">Module</label><select id="release-filter-module" class="form-input" onchange="release_control_init()"><option value="">All modules</option>${RELEASE_MODULES.map(module => `<option value="${module}">${titleCaseStatus(module)}</option>`).join('')}</select></div>
    <div class="form-group" style="margin:0"><label class="form-label">Stage</label><select id="release-filter-stage" class="form-input" onchange="release_control_init()"><option value="">All stages</option>${RELEASE_STAGES.map(stage => `<option value="${stage}">${titleCaseStatus(stage)}</option>`).join('')}</select></div>
    <div style="font-size:0.8125rem;color:var(--text-muted)">Use this panel as a release gate: keep features internal while checking backend, UI, permissions, audit, and docs; then beta or release them with a rollout percentage.</div>
  </div>
</div>
<div style="display:grid;grid-template-columns:280px 1fr;gap:1rem;align-items:start">
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:800;margin-bottom:0.75rem">Modules</h3>
    <div id="release-module-summary" style="display:flex;flex-direction:column;gap:0.5rem"></div>
  </div>
  <div class="card" style="padding:1rem">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
      <h3 style="font-size:1rem;font-weight:800">Feature Controls</h3>
      <span id="release-control-count" style="font-size:0.8125rem;color:var(--text-muted)"></span>
    </div>
    <div id="release-control-list">Loading...</div>
  </div>
</div>
`);

async function release_control_init() {
  if (!await ensureHanmakApi()) return;
  const orgId = await firstOrganizationId();
  const moduleFilter = document.getElementById('release-filter-module')?.value || '';
  const stageFilter = document.getElementById('release-filter-stage')?.value || '';
  try {
    let [flagsData, summaryData] = await Promise.all([
      hanmakApi(`/feature-flags/?organization=${orgId}&page_size=250`),
      hanmakApi(`/feature-flags/summary/?organization=${orgId}`),
    ]);
    let flags = flagsData.results || flagsData;
    const existingKeys = new Set(flags.map(flag => flag.key));
    const missingExpected = RELEASE_EXPECTED_FEATURE_KEYS.filter(key => !existingKeys.has(key));
    if (!flags.length || missingExpected.length) {
      const seeded = await hanmakApi('/feature-flags/seed-defaults/', {method: 'POST', body: JSON.stringify({organization: orgId})});
      const message = missingExpected.length
        ? `Release controls refreshed: ${seeded.created} missing features added`
        : `Release controls seeded: ${seeded.created} created, ${seeded.updated} checked`;
      showToast(message, 'success');
      [flagsData, summaryData] = await Promise.all([
        hanmakApi(`/feature-flags/?organization=${orgId}&page_size=250`),
        hanmakApi(`/feature-flags/summary/?organization=${orgId}`),
      ]);
      flags = flagsData.results || flagsData;
    }
    localStorage.setItem('HANMAK_RELEASE_FLAGS', JSON.stringify(flags));
    if (moduleFilter) flags = flags.filter(flag => flag.module === moduleFilter);
    if (stageFilter) flags = flags.filter(flag => flag.release_stage === stageFilter);
    renderReleaseStats(flags);
    renderReleaseModuleSummary(summaryData.modules || []);
    renderReleaseControls(flags);
  } catch (error) {
    showToast(`Release control failed: ${error.message}`, 'error', 7000);
  }
}

function renderReleaseStats(flags) {
  const avg = flags.length ? Math.round(flags.reduce((sum, flag) => sum + Number(flag.rollout_percentage || 0), 0) / flags.length) : 0;
  const values = [flags.length, flags.filter(flag => flag.is_enabled).length, flags.filter(flag => flag.release_stage === 'released').length, flags.filter(flag => ['planned','internal','beta'].includes(flag.release_stage)).length, `${avg}%`];
  document.querySelectorAll('#release-control-stats .stat-value').forEach((node, index) => { node.textContent = values[index]; });
}

function renderReleaseModuleSummary(modules) {
  const target = document.getElementById('release-module-summary');
  if (!target) return;
  target.innerHTML = modules.length ? modules.map(module => `
    <button class="btn btn-ghost" style="justify-content:space-between;text-align:left" onclick="document.getElementById('release-filter-module').value='${escapeHtml(module.module)}';release_control_init()">
      <span><strong>${titleCaseStatus(module.module)}</strong><br><span style="font-size:0.72rem;color:var(--text-muted)">${module.enabled}/${module.total} enabled · ${module.average_rollout}% rollout</span></span>
      <span class="badge">${module.released} released</span>
    </button>
  `).join('') : '<div class="empty-state"><div class="empty-state-title">No modules yet</div></div>';
}

function renderReleaseControls(flags) {
  const target = document.getElementById('release-control-list');
  document.getElementById('release-control-count').textContent = `${flags.length} control${flags.length === 1 ? '' : 's'}`;
  if (!target) return;
  target.innerHTML = flags.length ? flags.map(flag => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:1rem;margin-bottom:0.75rem;background:var(--bg-card)">
      <div style="display:flex;justify-content:space-between;gap:1rem;align-items:flex-start">
        <div style="min-width:0">
          <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap;margin-bottom:0.25rem">
            <strong style="font-size:1rem">${escapeHtml(flag.name || flag.key)}</strong>
            <span class="badge">${titleCaseStatus(flag.module || 'core')}</span>
            <span class="badge badge-${releaseBadgeClass(flag.release_stage)}">${titleCaseStatus(flag.release_stage || 'planned')}</span>
            <span class="badge badge-${flag.is_enabled ? 'success' : 'secondary'}">${flag.is_enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem"><code>${escapeHtml(flag.key)}</code> · Owner: ${escapeHtml(flag.owner || '-')} · Reviewed ${apiDate(flag.last_reviewed_at)}</div>
          <div style="font-size:0.85rem;color:var(--text-secondary);line-height:1.45">${escapeHtml(flag.description || 'No description yet.')}</div>
        </div>
        <div style="display:flex;gap:0.4rem;flex-wrap:wrap;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" onclick="openReleaseFeatureModal(${flag.id})">${icon('edit')} Edit</button>
          <button class="btn btn-ghost btn-sm" onclick="openReleaseReviewModal(${flag.id})">${icon('check-circle')} QA</button>
          <button class="btn btn-primary btn-sm" onclick="releaseFeatureLive(${flag.id})">${icon('send')} Release</button>
        </div>
      </div>
      <div style="margin-top:0.85rem">
        <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem"><span>Rollout</span><strong>${Number(flag.rollout_percentage || 0)}%</strong></div>
        <div style="height:8px;background:var(--bg-secondary);border-radius:999px;overflow:hidden"><div style="height:100%;width:${Number(flag.rollout_percentage || 0)}%;background:var(--primary)"></div></div>
      </div>
      ${(flag.qa_checklist || []).length ? `<div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-top:0.85rem">${flag.qa_checklist.map(item => `<span class="badge badge-${item.done ? 'success' : 'secondary'}">${item.done ? '✓' : '○'} ${escapeHtml(item.label || item)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('') : '<div class="empty-state"><div class="empty-state-title">No release controls found</div><div class="empty-state-text">Seed defaults to create Core, Workflow, Developer, Admin, and other modules.</div></div>';
}

async function seedReleaseControlsLive() {
  const orgId = await firstOrganizationId();
  const result = await hanmakApi('/feature-flags/seed-defaults/', {method: 'POST', body: JSON.stringify({organization: orgId})});
  showToast(`Release controls seeded: ${result.created} created, ${result.updated} updated`, 'success');
  release_control_init();
}

async function openReleaseFeatureModal(id = null) {
  const orgId = await firstOrganizationId();
  const flag = id ? await hanmakApi(`/feature-flags/${id}/`) : {organization: orgId, module: 'core', release_stage: 'planned', rollout_percentage: 0, qa_checklist: []};
  openModal(`<div class="modal-header"><h3 class="modal-title">${id ? 'Edit' : 'New'} Release Control</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-grid two">
        <div class="form-group"><label class="form-label">Key</label><input id="release-key" class="form-input" value="${escapeHtml(flag.key || '')}" ${id ? 'disabled' : ''} placeholder="workflow_builder"></div>
        <div class="form-group"><label class="form-label">Name</label><input id="release-name" class="form-input" value="${escapeHtml(flag.name || '')}" placeholder="Workflow Builder"></div>
      </div>
      <div class="form-grid two">
        <div class="form-group"><label class="form-label">Module</label><select id="release-module" class="form-input">${RELEASE_MODULES.map(module => `<option value="${module}" ${flag.module === module ? 'selected' : ''}>${titleCaseStatus(module)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Stage</label><select id="release-stage" class="form-input">${RELEASE_STAGES.map(stage => `<option value="${stage}" ${flag.release_stage === stage ? 'selected' : ''}>${titleCaseStatus(stage)}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid two">
        <div class="form-group"><label class="form-label">Rollout %</label><input id="release-rollout" class="form-input" type="number" min="0" max="100" value="${Number(flag.rollout_percentage || 0)}"></div>
        <div class="form-group"><label class="form-label">Owner</label><input id="release-owner" class="form-input" value="${escapeHtml(flag.owner || '')}" placeholder="Product / Engineering"></div>
      </div>
      <div class="form-group"><label style="display:flex;gap:0.5rem;align-items:center"><input id="release-enabled" type="checkbox" ${flag.is_enabled ? 'checked' : ''}> Enabled</label></div>
      <div class="form-group"><label class="form-label">Description</label><textarea id="release-description" class="form-input" rows="3">${escapeHtml(flag.description || '')}</textarea></div>
      <div class="form-group"><label class="form-label">Release Notes</label><textarea id="release-notes" class="form-input" rows="3">${escapeHtml(flag.release_notes || '')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveReleaseFeatureLive(${id || 0})">${icon('save')} Save</button></div>`);
}

async function saveReleaseFeatureLive(id = 0) {
  const orgId = await firstOrganizationId();
  const payload = {
    organization: orgId,
    key: document.getElementById('release-key')?.value.trim(),
    name: document.getElementById('release-name')?.value.trim(),
    module: document.getElementById('release-module')?.value || 'core',
    is_enabled: document.getElementById('release-enabled')?.checked || false,
    release_stage: document.getElementById('release-stage')?.value || 'planned',
    rollout_percentage: Math.max(0, Math.min(100, Number(document.getElementById('release-rollout')?.value || 0))),
    owner: document.getElementById('release-owner')?.value.trim(),
    description: document.getElementById('release-description')?.value || '',
    release_notes: document.getElementById('release-notes')?.value || '',
  };
  if (!payload.key) return showToast('Feature key is required', 'error');
  await hanmakApi(id ? `/feature-flags/${id}/` : '/feature-flags/', {method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload)});
  closeModal();
  showToast('Release control saved', 'success');
  release_control_init();
}

async function openReleaseReviewModal(id) {
  const flag = await hanmakApi(`/feature-flags/${id}/`);
  const checklist = (flag.qa_checklist || [
    {label: 'Backend endpoint verified', done: false},
    {label: 'Frontend flow verified', done: false},
    {label: 'Permissions and audit behavior checked', done: false},
    {label: 'Release notes reviewed', done: false},
  ]);
  openModal(`<div class="modal-header"><h3 class="modal-title">${icon('check-circle')} QA Checklist</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div style="font-weight:800;margin-bottom:0.75rem">${escapeHtml(flag.name || flag.key)}</div>
      <div id="release-qa-list" style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">
        ${checklist.map(item => `<label style="display:flex;gap:0.5rem;align-items:center;font-size:0.9rem"><input class="release-qa-check" type="checkbox" data-label="${escapeHtml(item.label || item)}" ${item.done ? 'checked' : ''}> ${escapeHtml(item.label || item)}</label>`).join('')}
      </div>
      <div class="form-group"><label class="form-label">Review Notes</label><textarea id="release-review-notes" class="form-input" rows="4">${escapeHtml(flag.release_notes || '')}</textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveReleaseReviewLive(${id})">${icon('save')} Save Review</button></div>`);
}

async function saveReleaseReviewLive(id) {
  const qa_checklist = [...document.querySelectorAll('.release-qa-check')].map(input => ({label: input.dataset.label, done: input.checked}));
  await hanmakApi(`/feature-flags/${id}/review/`, {method: 'POST', body: JSON.stringify({qa_checklist, release_notes: document.getElementById('release-review-notes')?.value || ''})});
  closeModal();
  showToast('QA review saved', 'success');
  release_control_init();
}

async function releaseFeatureLive(id) {
  await hanmakApi(`/feature-flags/${id}/release/`, {method: 'POST', body: JSON.stringify({release_stage: 'released', rollout_percentage: 100})});
  showToast('Feature released to 100%', 'success');
  release_control_init();
}

// ==================== OPERATIONS CONSOLE ====================
registerPage('operations-console', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Operations Console</h1>
    <p class="page-subtitle">Backend-backed risk, policy, API, webhook, permission, feature flag, and search controls</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="operations_console_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="rebuildSearchIndexLive()">${icon('search')} Rebuild Search</button>
  </div>
</div>

<div class="stats-grid" style="--cols:6;margin-bottom:1.5rem" id="ops-stats">
  ${['Risks','Policy Rules','API Logs','Outbox','OAuth Grants','Feature Flags'].map(label => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value">—</div></div>`).join('')}
</div>

<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
  <div class="card" style="padding:1rem">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.75rem">
      <h3 style="font-size:1rem;font-weight:700">Risk Findings</h3>
      <button class="btn btn-ghost btn-sm" onclick="createPolicyRuleLive()">${icon('plus')} Policy Rule</button>
    </div>
    <div id="ops-risk-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Policy Rules & Feature Flags</h3>
    <div id="ops-policy-list" style="margin-bottom:1rem;font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
    <div id="ops-flag-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">API Request Logs</h3>
    <div id="ops-api-log-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Event Outbox & OAuth Grants</h3>
    <div id="ops-outbox-list" style="margin-bottom:1rem;font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
    <div id="ops-grant-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Object Permissions</h3>
    <div id="ops-permission-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
  <div class="card" style="padding:1rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Search Index</h3>
    <div id="ops-search-list" style="font-size:0.8125rem;color:var(--text-muted)">Loading…</div>
  </div>
</div>
`);

function _opsRows(items, columns, emptyText = 'No records yet.') {
  if (!items.length) return `<div style="padding:1rem;text-align:center;color:var(--text-muted)">${emptyText}</div>`;
  return `<table class="table"><tbody>${items.map(item => `<tr>${columns.map(column => `<td>${column(item)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

async function operations_console_init() {
  if (!await ensureHanmakApi()) return;
  const orgId = await firstOrganizationId();
  try {
    const [risks, policies, logs, outbox, grants, permissions, flags, search] = await Promise.all([
      hanmakApi(`/risk-findings/?organization=${orgId}&page_size=8`),
      hanmakApi(`/policy-rules/?organization=${orgId}&page_size=8`),
      hanmakApi(`/api-request-logs/?organization=${orgId}&page_size=8`),
      hanmakApi(`/event-outbox/?organization=${orgId}&page_size=8`),
      hanmakApi('/oauth-grants/?page_size=8'),
      hanmakApi(`/object-permissions/?organization=${orgId}&page_size=8`),
      hanmakApi(`/feature-flags/?organization=${orgId}&page_size=8`),
      hanmakApi(`/search-index/?organization=${orgId}&page_size=8`),
    ]);
    const datasets = [risks, policies, logs, outbox, grants, flags].map(data => data.count ?? (data.results || data).length);
    document.querySelectorAll('#ops-stats .stat-value').forEach((el, index) => { el.textContent = datasets[index] ?? 0; });
    if (!document.getElementById('ops-risk-list')) return;
    const riskRows = risks.results || risks;
    document.getElementById('ops-risk-list').innerHTML = _opsRows(riskRows, [
      item => `<div style="font-weight:600">${escapeHtml(item.title || 'Risk')}</div><div style="color:var(--text-muted)">${escapeHtml(item.description || '')}</div>`,
      item => `<span class="badge badge-${item.severity === 'critical' ? 'danger' : item.severity === 'high' ? 'warning' : 'secondary'}">${item.severity}</span>`,
      item => item.status === 'open' ? `<button class="btn btn-ghost btn-sm" onclick="resolveRiskFindingLive(${item.id})">Resolve</button>` : liveBadge(item.status),
    ]);
    document.getElementById('ops-policy-list').innerHTML = _opsRows(policies.results || policies, [
      item => `<div style="font-weight:600">${escapeHtml(item.name)}</div><div style="color:var(--text-muted)">${escapeHtml(item.rule_type || '')}</div>`,
      item => `<span class="badge badge-${item.is_active ? 'success' : 'secondary'}">${item.is_active ? 'active' : 'disabled'}</span>`,
    ], 'No policy rules configured.');
    document.getElementById('ops-flag-list').innerHTML = _opsRows(flags.results || flags, [
      item => `<code>${escapeHtml(item.key)}</code>`,
      item => `<button class="btn btn-ghost btn-sm" onclick="toggleFeatureFlagLive(${item.id}, ${item.is_enabled ? 'false' : 'true'})">${item.is_enabled ? 'Disable' : 'Enable'}</button>`,
    ], 'No feature flags configured.');
    document.getElementById('ops-api-log-list').innerHTML = _opsRows(logs.results || logs, [
      item => `<code>${escapeHtml(item.method)} ${escapeHtml(item.path)}</code><div style="color:var(--text-muted)">${apiDate(item.created_at)}</div>`,
      item => `<span class="badge badge-${Number(item.status_code) >= 400 ? 'danger' : 'success'}">${item.status_code}</span>`,
      item => `${item.duration_ms || 0}ms`,
    ], 'No API logs recorded.');
    document.getElementById('ops-outbox-list').innerHTML = _opsRows(outbox.results || outbox, [
      item => `<code>${escapeHtml(item.event_type)}</code><div style="color:var(--text-muted)">${escapeHtml(item.aggregate_type || '')} #${item.aggregate_id || '-'}</div>`,
      item => item.published_at ? liveBadge('published') : liveBadge('pending'),
    ], 'No outbox events.');
    document.getElementById('ops-grant-list').innerHTML = _opsRows(grants.results || grants, [
      item => `<div style="font-weight:600">${escapeHtml(item.application_name || `App #${item.application}`)}</div><div style="color:var(--text-muted)">User #${item.user}</div>`,
      item => item.revoked_at ? liveBadge('revoked') : `<button class="btn btn-ghost btn-sm" onclick="revokeOAuthGrantLive(${item.id})">Revoke</button>`,
    ], 'No OAuth grants.');
    document.getElementById('ops-permission-list').innerHTML = _opsRows(permissions.results || permissions, [
      item => `<code>${escapeHtml(item.scope)}</code><div style="color:var(--text-muted)">object ${item.object_id || '-'}</div>`,
      item => `user ${item.user || '-'} / team ${item.team || '-'}`,
    ], 'No object grants.');
    document.getElementById('ops-search-list').innerHTML = _opsRows(search.results || search, [
      item => `<div style="font-weight:600">${escapeHtml(item.title)}</div><div style="color:var(--text-muted)">${escapeHtml(item.object_type)} #${item.object_id}</div>`,
      item => `weight ${item.weight}`,
    ], 'Search index has no records.');
  } catch (error) {
    if (!document.getElementById('ops-risk-list')) return;
    showToast(`Operations console failed: ${error.message}`, 'error', 7000);
  }
}

async function resolveRiskFindingLive(id) {
  await hanmakApi(`/risk-findings/${id}/resolve/`, {method:'POST', body: JSON.stringify({})});
  showToast('Risk finding resolved', 'success');
  operations_console_init();
}

async function toggleFeatureFlagLive(id, enabled) {
  await hanmakApi(`/feature-flags/${id}/`, {method:'PATCH', body: JSON.stringify({is_enabled: enabled})});
  showToast(`Feature flag ${enabled ? 'enabled' : 'disabled'}`, 'success');
  operations_console_init();
}

async function revokeOAuthGrantLive(id) {
  await hanmakApi(`/oauth-grants/${id}/`, {method:'PATCH', body: JSON.stringify({revoked_at: new Date().toISOString()})});
  showToast('OAuth grant revoked', 'success');
  operations_console_init();
}

async function rebuildSearchIndexLive() {
  if (!await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const result = await hanmakApi('/search-index/rebuild/', {method:'POST', body: JSON.stringify({organization: orgId})});
    showToast(`Search index rebuilt: ${result.indexed || 0} record(s)`, 'success');
    operations_console_init();
  } catch (error) {
    showToast(`Search rebuild failed: ${error.message}`, 'error', 7000);
  }
}

async function createPolicyRuleLive() {
  const name = prompt('Policy rule name', 'Require signer authentication');
  if (!name) return;
  const orgId = await firstOrganizationId();
  await hanmakApi('/policy-rules/', {
    method:'POST',
    body: JSON.stringify({organization: orgId, name, rule_type: 'envelope', config: {require_email_verification: true}, is_active: true}),
  });
  showToast('Policy rule created', 'success');
  operations_console_init();
}

// ==================== SDK PAGE ====================
registerPage('sdk', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">SDKs & CLI</h1>
    <p class="page-subtitle">Official client libraries and command-line tools for HanMak</p>
  </div>
  <button class="btn btn-ghost" onclick="navigate('api-docs')">${icon('book')} API Reference</button>
</div>

<div class="stats-grid" style="--cols:4;margin-bottom:2rem">
  ${[['Node.js','npm install @hanmak/sdk','v2.4.1'],['Python','pip install hanmak','v1.9.0'],['PHP','composer require hanmak/sdk','v1.5.2'],['CLI','brew install hanmak-cli','v1.2.0']].map(([lang,cmd,ver])=>`
    <div class="card" style="padding:1.25rem">
      <div style="font-weight:700;margin-bottom:0.375rem">${lang}</div>
      <code style="font-size:0.75rem;font-family:var(--font-mono);background:var(--bg-secondary);padding:4px 8px;border-radius:4px;display:block;margin-bottom:0.5rem">${cmd}</code>
      <span class="badge badge-success">${ver} Latest</span>
    </div>`).join('')}
</div>

<div class="flex flex-col gap-4">
  <div class="card" style="padding:1.5rem">
    <h2 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Node.js / TypeScript</h2>
    <div class="tabs" style="margin-bottom:1rem">
      <button class="tab active" onclick="switchSdkTab('js-install',this)">Install</button>
      <button class="tab" onclick="switchSdkTab('js-quickstart',this)">Quick Start</button>
      <button class="tab" onclick="switchSdkTab('js-send-envelope',this)">Send Envelope</button>
      <button class="tab" onclick="switchSdkTab('js-webhooks',this)">Webhooks</button>
    </div>
    <div id="js-install" class="sdk-tab-content">
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:0.8125rem;position:relative">
        <button class="btn btn-ghost btn-sm" style="position:absolute;right:8px;top:8px" onclick="copySdkInstallSnippet()">${icon('copy')}</button>
        <div style="color:var(--text-muted)"># npm</div>
        <div>npm install @hanmak/sdk</div>
        <br>
        <div style="color:var(--text-muted)"># yarn</div>
        <div>yarn add @hanmak/sdk</div>
        <br>
        <div style="color:var(--text-muted)"># Initialize</div>
        <div><span style="color:var(--warning)">import</span> { HanMak } <span style="color:var(--warning)">from</span> <span style="color:var(--success)">'@hanmak/sdk'</span>;</div>
        <div><span style="color:var(--warning)">const</span> client = <span style="color:var(--warning)">new</span> <span style="color:var(--primary)">HanMak</span>({</div>
        <div style="padding-left:1.5rem">apiKey: process.env.<span style="color:var(--primary)">HANMAK_API_KEY</span></div>
        <div>});</div>
      </div>
    </div>
  </div>
  
  <div class="card" style="padding:1.5rem">
    <h2 style="font-size:1rem;font-weight:700;margin-bottom:1rem">CLI Reference</h2>
    <div style="background:var(--bg-secondary);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:0.8125rem">
      ${[['sf auth login','Authenticate with your API key'],['sf envelopes list','List recent envelopes'],['sf envelopes send --template nda --to email@example.com','Send envelope from template'],['sf envelopes get ENV-2024-0891','Get envelope details'],['sf templates list','List all templates'],['sf webhooks list','List webhook endpoints'],['sf audit export --from 2026-01-01 --to 2026-05-03','Export audit trail'],['sf config set api-key sk_live_...','Set API key'],['sf config get','Show current config']].map(([cmd,desc])=>`
        <div style="display:grid;grid-template-columns:auto 1fr;gap:1.5rem;padding:0.375rem 0;border-bottom:1px solid var(--border)">
          <code style="color:var(--primary)">${cmd}</code>
          <span style="color:var(--text-muted)">${desc}</span>
        </div>`).join('')}
    </div>
  </div>
</div>
`);

function switchSdkTab(tabId, el) {
  document.querySelectorAll('.sdk-tab-content').forEach(t => t.style.display='none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if(tab) tab.style.display='block';
  el.classList.add('active');
}

// ==================== TEST LAB ====================
const TEST_LAB_SUITES = [
  {suite:'Envelope CRUD', pass:28, fail:0, skip:0, dur:'4.2s', lastRun:'2 min ago', type:'API'},
  {suite:'Signature Placement', pass:22, fail:2, skip:1, dur:'12.8s', lastRun:'2 min ago', type:'UI'},
  {suite:'Template Engine', pass:35, fail:0, skip:0, dur:'3.1s', lastRun:'2 min ago', type:'API'},
  {suite:'Workflow Builder', pass:18, fail:3, skip:2, dur:'8.5s', lastRun:'2 min ago', type:'UI'},
  {suite:'Form Builder', pass:31, fail:0, skip:0, dur:'5.6s', lastRun:'2 min ago', type:'UI'},
  {suite:'Webhook Delivery', pass:24, fail:1, skip:0, dur:'22.4s', lastRun:'2 min ago', type:'Integration'},
  {suite:'OAuth & Auth', pass:19, fail:0, skip:0, dur:'6.2s', lastRun:'2 min ago', type:'API'},
  {suite:'Audit Trail', pass:14, fail:0, skip:0, dur:'2.8s', lastRun:'2 min ago', type:'API'},
  {suite:'SSO / SAML', pass:11, fail:2, skip:1, dur:'15.1s', lastRun:'2 min ago', type:'Integration'},
  {suite:'Email Delivery', pass:22, fail:0, skip:2, dur:'18.3s', lastRun:'2 min ago', type:'Integration'},
  {suite:'Billing & Usage', pass:8, fail:0, skip:0, dur:'1.4s', lastRun:'2 min ago', type:'API'},
  {suite:'Data Residency', pass:14, fail:0, skip:1, dur:'3.7s', lastRun:'2 min ago', type:'Integration'},
];

registerPage('test-lab', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">QA Test Lab</h1>
    <p class="page-subtitle">Automated test suite and manual test runner for HanMak modules</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openScheduleTestRunModal()">${icon('calendar')} Schedule Run</button>
    <button class="btn btn-primary" onclick="runAllTests()">${icon('play')} Run All Tests</button>
  </div>
</div>

<div class="stats-grid" id="test-lab-stats" style="--cols:5;margin-bottom:1.5rem">
  <div class="stat-card"><div class="stat-label">Queued Runs</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Running</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Succeeded</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Failed</div><div class="stat-value">—</div></div>
  <div class="stat-card"><div class="stat-label">Last Run</div><div class="stat-value">—</div></div>
</div>

<div class="card">
  <div class="table-toolbar">
    <div class="tabs">
      <button class="tab active" onclick="filterTestLabSuites('all',this)">All Suites</button>
      <button class="tab" style="color:var(--danger)" onclick="filterTestLabSuites('failed',this)">Failed Runs</button>
      <button class="tab" onclick="filterTestLabSuites('API',this)">API Tests</button>
      <button class="tab" onclick="filterTestLabSuites('UI',this)">UI Tests</button>
      <button class="tab" onclick="filterTestLabSuites('Integration',this)">Integration</button>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="downloadTestLabReport()">${icon('download')} Report</button>
  </div>
  <table class="table">
    <thead><tr><th>Suite</th><th>Backend Runs</th><th>Last Status</th><th>Queue</th><th>Last Run</th><th></th></tr></thead>
    <tbody id="test-lab-tbody">
      <tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">Loading test-lab task runs...</td></tr>
    </tbody>
  </table>
</div>
`);

let _testLabRuns = [];
let _testLabFilter = 'all';

function testRow(suiteInfo, runs = []) {
  const suiteRuns = runs.filter(run => (run.payload?.suite || '').toLowerCase() === suiteInfo.suite.toLowerCase() || (suiteInfo.suite === 'All Suites' && run.payload?.suite === 'all'));
  const lastRun = suiteRuns[0] || null;
  const failed = suiteRuns.filter(run => run.status === 'failed').length;
  return `<tr>
    <td>
      <div style="font-weight:600;font-size:0.875rem">${escapeHtml(suiteInfo.suite)}</div>
      <span class="badge badge-secondary" style="font-size:0.7rem">${escapeHtml(suiteInfo.type)}</span>
    </td>
    <td>${suiteRuns.length}</td>
    <td>${lastRun ? liveBadge(lastRun.status) : '<span style="color:var(--text-muted)">Not run</span>'}</td>
    <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(lastRun?.queue_name || 'default')}</td>
    <td style="font-size:0.8rem;color:var(--text-muted)">${lastRun ? apiDate(lastRun.queued_at || lastRun.created_at) : '—'}</td>
    <td>
      <div class="flex gap-1">
        <button class="btn btn-ghost btn-sm" onclick="runSuite('${escapeHtml(suiteInfo.suite)}')">${icon('play')}</button>
        <button class="btn btn-ghost btn-sm" onclick="viewTestDetails('${escapeHtml(suiteInfo.suite)}')">${icon('eye')}</button>
        ${failed ? `<span class="badge badge-danger">${failed} failed</span>` : ''}
      </div>
    </td>
  </tr>`;
}

async function test_lab_init() {
  if (!await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/task-runs/?page_size=100');
    _testLabRuns = (data.results || data).filter(run => run.related_object_type === 'test_lab');
    renderTestLabLive();
  } catch (error) {
    const tbody = document.getElementById('test-lab-tbody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:2rem">Could not load test-lab runs: ${escapeHtml(error.message)}</td></tr>`;
  }
}

function filterTestLabSuites(filter, tab) {
  _testLabFilter = filter;
  tab?.closest('.tabs')?.querySelectorAll('.tab').forEach(item => item.classList.remove('active'));
  tab?.classList.add('active');
  renderTestLabLive();
}

function renderTestLabLive() {
  const stats = document.getElementById('test-lab-stats');
  const counts = _testLabRuns.reduce((acc, run) => {
    acc[run.status] = (acc[run.status] || 0) + 1;
    return acc;
  }, {});
  if (stats) {
    const last = _testLabRuns[0];
    stats.innerHTML = [
      ['Queued Runs', counts.queued || 0, ''],
      ['Running', counts.running || 0, 'var(--warning)'],
      ['Succeeded', counts.succeeded || 0, 'var(--success)'],
      ['Failed', counts.failed || 0, 'var(--danger)'],
      ['Last Run', last ? apiDate(last.queued_at || last.created_at) : '—', ''],
    ].map(([label, value, color]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="${color ? `color:${color}` : ''}">${value}</div></div>`).join('');
  }
  const tbody = document.getElementById('test-lab-tbody');
  if (!tbody) return;
  let suites = TEST_LAB_SUITES;
  if (_testLabFilter && !['all', 'failed'].includes(_testLabFilter)) suites = suites.filter(suite => suite.type === _testLabFilter);
  if (_testLabFilter === 'failed') {
    suites = suites.filter(suite => _testLabRuns.some(run => (run.payload?.suite || '').toLowerCase() === suite.suite.toLowerCase() && run.status === 'failed'));
  }
  tbody.innerHTML = suites.length ? suites.map(suite => testRow(suite, _testLabRuns)).join('') : '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--text-muted)">No matching test-lab runs yet.</td></tr>';
}

function copySdkInstallSnippet() {
  copyToClipboard(`npm install @hanmak/sdk
yarn add @hanmak/sdk

import { HanMak } from '@hanmak/sdk';
const client = new HanMak({
  apiKey: process.env.HANMAK_API_KEY
});`);
  showToast('SDK install snippet copied', 'success');
}

async function queueTestLabRun(taskName, payload = {}) {
  if (!await ensureHanmakApi()) return null;
  const organization = await firstOrganizationId();
  return hanmakApi('/task-runs/', {
    method: 'POST',
    body: JSON.stringify({
      organization,
      task_name: taskName,
      queue_name: 'default',
      status: 'queued',
      related_object_type: 'test_lab',
      payload,
      result: {source: 'frontend_test_lab'},
    }),
  });
}

function openScheduleTestRunModal() {
  openModal(`
    <div class="modal">
      <div class="modal-header"><h3 class="modal-title">${icon('calendar')} Schedule Test Run</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Suite</label><select id="test-schedule-suite" class="form-input">
          <option value="all">All suites</option>
          ${TEST_LAB_SUITES.map(suite => `<option value="${escapeHtml(suite.suite)}">${escapeHtml(suite.suite)}</option>`).join('')}
        </select></div>
        <div class="form-group"><label class="form-label">Run At</label><input id="test-schedule-at" class="form-input" type="datetime-local"></div>
        <div class="form-group"><label class="form-label">Notes</label><textarea id="test-schedule-notes" class="form-input" rows="2" placeholder="Regression before release"></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="scheduleTestRunLive()">${icon('calendar')} Schedule</button></div>
    </div>
  `);
}

async function scheduleTestRunLive() {
  try {
    const suite = document.getElementById('test-schedule-suite')?.value || 'all';
    const scheduledAt = document.getElementById('test-schedule-at')?.value || '';
    const notes = document.getElementById('test-schedule-notes')?.value || '';
    const run = await queueTestLabRun('test_lab.scheduled_run', {suite, scheduled_at: scheduledAt, notes});
    closeModal();
    showToast(`Test run queued as task #${run.id}`, 'success');
    _testLabRuns.unshift(run);
    renderTestLabLive();
    navigate('tasks');
  } catch (error) {
    showToast(`Schedule failed: ${error.message}`, 'error', 7000);
  }
}

async function runAllTests() {
  try {
    const run = await queueTestLabRun('test_lab.run_all', {suite: 'all', total: TEST_LAB_SUITES.reduce((sum, suite) => sum + suite.pass + suite.fail + suite.skip, 0)});
    showToast(`All tests queued as task #${run.id}`, 'success');
    _testLabRuns.unshift(run);
    renderTestLabLive();
    navigate('tasks');
  } catch (error) {
    showToast(`Test run failed: ${error.message}`, 'error', 7000);
  }
}

async function runSuite(name) {
  try {
    const suite = TEST_LAB_SUITES.find(item => item.suite === name);
    const run = await queueTestLabRun('test_lab.run_suite', {suite: name, tests: suite ? suite.pass + suite.fail + suite.skip : null});
    showToast(`${name} queued as task #${run.id}`, 'success');
    _testLabRuns.unshift(run);
    renderTestLabLive();
    navigate('tasks');
  } catch (error) {
    showToast(`Suite run failed: ${error.message}`, 'error', 7000);
  }
}

function downloadTestLabReport() {
  const rows = _testLabRuns.map(run => [
    run.id,
    `"${String(run.payload?.suite || '').replaceAll('"', '""')}"`,
    run.task_name,
    run.status,
    run.queue_name,
    run.queued_at || '',
    run.finished_at || '',
    `"${String(run.error_message || '').replaceAll('"', '""')}"`,
  ].join(','));
  const csv = ['id,suite,task,status,queue,queued_at,finished_at,error'].concat(rows).join('\n');
  downloadTextFile(`hanmak-test-lab-${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
  showToast(`${_testLabRuns.length} backend test-lab run(s) exported as CSV`, 'success');
}
function viewTestDetails(name) {
  const runs = _testLabRuns.filter(run => (run.payload?.suite || '').toLowerCase() === name.toLowerCase()).slice(0, 8);
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Test Results — ${name}</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div style="font-family:var(--font-mono);font-size:0.8rem;background:var(--bg-secondary);padding:1rem;border-radius:8px;max-height:400px;overflow:auto">
        ${runs.length ? runs.map(run => `
          <div style="color:var(--${run.status === 'failed' ? 'danger' : run.status === 'succeeded' ? 'success' : 'warning'});margin-bottom:0.5rem">
            #${run.id} ${escapeHtml(run.task_name)} · ${escapeHtml(run.status)} · ${apiDate(run.queued_at || run.created_at)}
          </div>
          ${run.error_message ? `<div style="color:var(--text-muted);padding-left:1rem;margin-bottom:0.5rem">${escapeHtml(run.error_message)}</div>` : ''}
          ${(run.events || []).map(event => `<div style="color:var(--text-muted);padding-left:1rem">${escapeHtml(event.event_type)}: ${escapeHtml(event.message || '')}</div>`).join('')}
        `).join('') : '<div style="color:var(--text-muted)">No backend runs recorded for this suite yet. Use Run to queue one.</div>'}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      <button class="btn btn-primary" onclick="closeModal();runFailedSuiteTests('${escapeHtml(name)}')">${icon('refresh')} Re-run Failed</button>
    </div>
  `);
}

async function runFailedSuiteTests(name) {
  const failed = _testLabRuns.filter(run => (run.payload?.suite || '').toLowerCase() === name.toLowerCase() && run.status === 'failed');
  if (!failed.length) return showToast('No failed backend runs recorded for this suite.', 'info');
  try {
    const run = await queueTestLabRun('test_lab.rerun_failed', {suite: name, rerun_from: failed.map(item => item.id)});
    _testLabRuns.unshift(run);
    renderTestLabLive();
    showToast(`Failed tests queued as task #${run.id}`, 'success');
  } catch (error) {
    showToast(`Re-run failed: ${error.message}`, 'error', 7000);
  }
}
