registerPage('sso', () => `
<div class="page-header">
  <div><h1 class="page-title">SSO & Identity</h1><p class="page-subtitle">SAML, OIDC, LDAP, OAuth providers, SCIM provisioning, and JIT</p></div>
  <button class="btn btn-primary" onclick="saveActiveSSOConnection()">${icon('save')} Save</button>
</div>

<div class="card" style="margin-bottom:1.5rem;padding:0">
  <div class="tabs" style="padding:0 1.25rem;border-bottom:1px solid var(--border)">
    <button class="tab active" onclick="switchSSOTab('saml',this)">SAML 2.0</button>
    <button class="tab" onclick="switchSSOTab('oidc',this)">OIDC / OAuth 2.0</button>
    <button class="tab" onclick="switchSSOTab('ldap',this)">LDAP / AD</button>
    <button class="tab" onclick="switchSSOTab('scim',this)">SCIM Provisioning</button>
    <button class="tab" onclick="switchSSOTab('jit',this)">JIT Provisioning</button>
    <button class="tab" onclick="switchSSOTab('social',this)">Social Login</button>
  </div>

  <!-- SAML -->
  <div id="sso-saml" style="padding:1.5rem">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1.25rem">
      <div>
        <div style="font-weight:700;font-size:1rem">SAML 2.0 Single Sign-On</div>
        <div style="font-size:0.8125rem;color:var(--text-muted);margin-top:4px">Configure your Identity Provider for SAML-based SSO</div>
      </div>
      <div class="flex gap-2">
        <span class="badge badge-success">Active</span>
        <button class="btn btn-ghost btn-sm" onclick="testSAML()">${icon('play')} Test Connection</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <div>
        <h4 style="font-size:0.875rem;font-weight:700;margin-bottom:1rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">Identity Provider (IdP) Config</h4>
        <div class="form-group"><label class="form-label">Connection Name</label><input id="saml-name" class="form-input" value="Primary SAML"></div>
        <div class="form-group"><label class="form-label">IdP Entity ID</label><input id="saml-entity-id" class="form-input" placeholder="https://idp.example.com/saml/metadata" style="font-family:var(--font-mono);font-size:0.8rem"></div>
        <div class="form-group"><label class="form-label">IdP SSO URL</label><input id="saml-sso-url" class="form-input" placeholder="https://idp.example.com/saml/sso" style="font-family:var(--font-mono);font-size:0.8rem"></div>
        <div class="form-group"><label class="form-label">IdP Certificate (X.509)</label>
          <textarea id="saml-x509-cert" class="form-input" rows="4" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" style="font-family:var(--font-mono);font-size:0.72rem"></textarea>
        </div>
        <div class="form-group"><label class="form-label">Name ID Format</label>
          <select class="form-input"><option>Email Address</option><option>Persistent</option><option>Transient</option><option>Unspecified</option></select>
        </div>
        <div class="form-group"><label class="form-label">Attribute Mapping</label>
          <div class="flex flex-col gap-2" style="font-size:0.8125rem">
            ${[['Email','email'],['First Name','firstName'],['Last Name','lastName'],['Groups/Roles','groups']].map(([sf,attr])=>`
              <div class="flex gap-2 align-items-center">
                <span style="min-width:90px;color:var(--text-muted)">${sf}</span>
                <span style="color:var(--text-muted)">←</span>
                <input class="form-input" value="${attr}" style="flex:1">
              </div>`).join('')}
          </div>
        </div>
      </div>
      <div>
        <h4 style="font-size:0.875rem;font-weight:700;margin-bottom:1rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em">Service Provider (SP) Details</h4>
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;font-size:0.8125rem;margin-bottom:1rem">
          <div style="font-weight:600;margin-bottom:0.75rem">Provide these to your IdP:</div>
          ${[['SP Entity ID','https://app.hanmak.io/saml/metadata'],['ACS URL','https://app.hanmak.io/saml/acs'],['SLS URL','https://app.hanmak.io/saml/sls'],['Metadata URL','https://app.hanmak.io/saml/metadata.xml']].map(([k,v])=>`
            <div style="margin-bottom:0.625rem">
              <div style="color:var(--text-muted);font-size:0.75rem">${k}</div>
              <div style="display:flex;align-items:center;gap:0.5rem">
                <code style="font-family:var(--font-mono);font-size:0.75rem;flex:1;word-break:break-all">${v}</code>
                <button class="btn btn-ghost btn-sm" onclick="copyToClipboard('${v}');showToast('Copied!','success')" style="padding:2px 6px">${icon('copy')}</button>
              </div>
            </div>`).join('')}
        </div>
        <div class="form-group"><label class="form-label">Login Mode</label>
          <select class="form-input"><option>SP-Initiated (recommended)</option><option>IdP-Initiated</option><option>Both</option></select>
        </div>
        <div class="flex flex-col gap-2" style="font-size:0.875rem">
          ${[['Sign SAML requests','true','saml-sign-requests'],['Require signed assertions','true','saml-require-signed-assertions'],['Require encrypted assertions','false','saml-require-encrypted-assertions'],['Allow unsolicited IdP-initiated SSO','false','saml-allow-idp-initiated']].map(([l,d,id])=>`
            <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.375rem 0;border-bottom:1px solid var(--border)">
              <input id="${id}" type="checkbox" ${d==='true'?'checked':''}> ${l}
            </label>`).join('')}
        </div>
      </div>
    </div>

    <div style="margin-top:1.25rem">
      <div style="font-size:0.875rem;font-weight:700;margin-bottom:0.75rem">Quick Setup — Popular Providers</div>
      <div class="flex gap-3" style="flex-wrap:wrap">
        ${[['Okta','#007dc1'],['Azure AD','#0072c6'],['Google Workspace','#4285f4'],['OneLogin','#d71e28'],['JumpCloud','#00af4b'],['Ping Identity','#ee3028']].map(([name,color])=>`
          <button class="btn btn-ghost btn-sm" onclick="loadIdPPreset('${name}')" style="border-color:${color};color:${color}">${name}</button>`).join('')}
      </div>
    </div>
  </div>

  <!-- OIDC (hidden) -->
  <div id="sso-oidc" style="display:none;padding:1.5rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:1.25rem">OpenID Connect / OAuth 2.0</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="form-group"><label class="form-label">Connection Name</label><input id="oidc-name" class="form-input" value="Primary OIDC"></div>
      <div class="form-group"><label class="form-label">Discovery URL</label><input id="oidc-discovery-url" class="form-input" placeholder="https://accounts.google.com/.well-known/openid-configuration"></div>
      <div class="form-group"><label class="form-label">Client ID</label><input id="oidc-client-id" class="form-input" placeholder="your-client-id"></div>
      <div class="form-group"><label class="form-label">Client Secret</label><input id="oidc-client-secret" class="form-input" type="password" placeholder="••••••••••••"></div>
      <div class="form-group"><label class="form-label">Issuer</label><input id="oidc-issuer" class="form-input" placeholder="https://accounts.google.com"></div>
      <div class="form-group"><label class="form-label">JWKS URL</label><input id="oidc-jwks-uri" class="form-input" placeholder="https://www.googleapis.com/oauth2/v3/certs"></div>
      <div class="form-group"><label class="form-label">Authorization Endpoint</label><input id="oidc-authorization-endpoint" class="form-input" placeholder="https://accounts.google.com/o/oauth2/v2/auth"></div>
      <div class="form-group"><label class="form-label">Token Endpoint</label><input id="oidc-token-endpoint" class="form-input" placeholder="https://oauth2.googleapis.com/token"></div>
      <div class="form-group"><label class="form-label">Scopes</label><input id="oidc-scope" class="form-input" value="openid email profile groups"></div>
      <div class="form-group"><label class="form-label">Redirect URI</label><input id="oidc-redirect-uri" class="form-input" value="http://127.0.0.1:8080/mock/"></div>
    </div>
    <div class="flex gap-2">
      <button class="btn btn-primary btn-sm" onclick="saveOIDCConnection()">${icon('save')} Save OIDC</button>
      <button class="btn btn-ghost btn-sm" onclick="startOIDCTest()">${icon('play')} Start OIDC Test</button>
    </div>
    <div id="oidc-test-result" style="margin-top:1rem"></div>
  </div>

  <!-- LDAP (hidden) -->
  <div id="sso-ldap" style="display:none;padding:1.5rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:1.25rem">LDAP / Active Directory</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="form-group"><label class="form-label">Server URL</label><input id="ldap-server-url" class="form-input" placeholder="ldaps://ldap.acmecorp.com:636"></div>
      <div class="form-group"><label class="form-label">Base DN</label><input id="ldap-base-dn" class="form-input" placeholder="dc=acmecorp,dc=com"></div>
      <div class="form-group"><label class="form-label">Bind DN</label><input id="ldap-bind-dn" class="form-input" placeholder="cn=hanmak,ou=service,dc=acmecorp,dc=com"></div>
      <div class="form-group"><label class="form-label">Bind Password</label><input id="ldap-bind-password" class="form-input" type="password" placeholder="••••••••"></div>
      <div class="form-group"><label class="form-label">User Search Filter</label><input id="ldap-user-filter" class="form-input" value="(objectClass=user)"></div>
      <div class="form-group"><label class="form-label">Email Attribute</label><input id="ldap-email-attribute" class="form-input" value="mail"></div>
    </div>
    <div class="flex gap-2"><button class="btn btn-primary btn-sm" onclick="saveLDAPConnectionLive()">${icon('save')} Save LDAP</button><button class="btn btn-ghost btn-sm" onclick="testLDAPConnectionLive()">${icon('play')} Test LDAP Connection</button></div>
    <div id="ldap-test-result" style="margin-top:1rem"></div>
  </div>

  <!-- SCIM (hidden) -->
  <div id="sso-scim" style="display:none;padding:1.5rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">SCIM 2.0 Provisioning</div>
    <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1.25rem">Automatically sync users and groups from your IdP to HanMak.</p>
    <div id="scim-live-panel" class="card" style="padding:1rem;margin-bottom:1.25rem">
      <div class="empty-state"><div class="empty-state-title">Loading…</div></div>
    </div>
    <div style="margin-top:1.25rem;padding:1rem;border:1px solid var(--border);border-radius:8px">
      <div style="font-weight:700;font-size:0.875rem;margin-bottom:0.75rem">Test Provision User</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
        <div class="form-group"><label class="form-label">External ID</label><input id="scim-test-external-id" class="form-input" value="test-scim-user-1"></div>
        <div class="form-group"><label class="form-label">Email</label><input id="scim-test-email" class="form-input" type="email" value="scim.test@example.com"></div>
      </div>
      <div class="flex gap-2"><button class="btn btn-primary btn-sm" onclick="testSCIMProvisionLive(true)">${icon('user-plus')} Provision</button><button class="btn btn-ghost btn-sm" onclick="testSCIMProvisionLive(false)">${icon('user-x')} Deactivate</button></div>
      <div id="scim-test-result" style="margin-top:0.75rem"></div>
    </div>
  </div>

  <!-- JIT (hidden) -->
  <div id="sso-jit" style="display:none;padding:1.5rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem">Just-In-Time Provisioning</div>
    <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1.25rem">Automatically create and update user accounts when they sign in via SSO.</p>
    <div class="flex flex-col gap-3" style="font-size:0.875rem">
      ${[['Enable JIT provisioning','true'],['Auto-create user on first SSO login','true'],['Update user attributes on each login','true'],['Assign default role to JIT users','true'],['Restrict JIT to verified domains only','true'],['Require email domain match','true']].map(([l,d])=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
          <span>${l}</span><input id="jit-${l.toLowerCase().replaceAll(' ','-')}" type="checkbox" ${d==='true'?'checked':''}>
        </div>`).join('')}
    </div>
    <div class="form-group" style="margin-top:1rem"><label class="form-label">Default JIT Role</label>
      <select id="jit-default-role" class="form-input"><option value="signer">Signer</option><option value="viewer">Viewer</option><option value="manager">Manager</option><option value="admin">Admin</option></select>
    </div>
    <div class="form-group"><label class="form-label">Allowed JIT Domains</label>
      <input id="jit-allowed-domains" class="form-input" value="acmecorp.com, acme.io">
    </div>
    <button class="btn btn-primary btn-sm" onclick="saveJITSettingsLive()">${icon('save')} Save JIT Settings</button>
  </div>

  <!-- Social (hidden) -->
  <div id="sso-social" style="display:none;padding:1.5rem">
    <div style="font-weight:700;font-size:1rem;margin-bottom:1.25rem">Social Login Providers</div>
    <div id="social-provider-list" class="flex flex-col gap-3">
      <div class="empty-state"><div class="empty-state-title">Loading providers…</div></div>
    </div>
  </div>
</div>
`);

function switchSSOTab(tab, el) {
  document.querySelectorAll('[id^="sso-"]').forEach(t => t.style.display='none');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('sso-'+tab);
  if(target) target.style.display='block';
  el.classList.add('active');
}
async function sso_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  await Promise.all([
    loadSSOConnections(),
    loadLDAPConnectionLive(),
    loadJITSettingsLive(),
    loadSocialProvidersLive(),
  ]);
}

async function loadSSOConnections() {
  try {
    const data = await hanmakApi('/sso-connections/');
    const connections = data.results || data;
    const oidc = connections.find(item => item.provider_type === 'oidc');
    const saml = connections.find(item => item.provider_type === 'saml');
    if (oidc) hydrateOIDCConnection(oidc);
    if (saml) hydrateSAMLConnection(saml);
  } catch (error) {
    showToast(`SSO load failed: ${error.message}`, 'error', 7000);
  }
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (input && value !== undefined && value !== null) input.value = value;
}

function hydrateOIDCConnection(connection) {
  const config = connection.config || {};
  localStorage.setItem('HANMAK_OIDC_CONNECTION_ID', connection.id);
  setInputValue('oidc-name', connection.name);
  setInputValue('oidc-discovery-url', config.discovery_url || '');
  setInputValue('oidc-client-id', config.client_id || '');
  setInputValue('oidc-client-secret', config.client_secret || '');
  setInputValue('oidc-issuer', config.issuer || '');
  setInputValue('oidc-jwks-uri', config.jwks_uri || '');
  setInputValue('oidc-authorization-endpoint', config.authorization_endpoint || '');
  setInputValue('oidc-token-endpoint', config.token_endpoint || '');
  setInputValue('oidc-scope', config.scope || 'openid email profile groups');
  setInputValue('oidc-redirect-uri', config.redirect_uri || 'http://127.0.0.1:8080/mock/');
}

function hydrateSAMLConnection(connection) {
  const config = connection.config || {};
  localStorage.setItem('HANMAK_SAML_CONNECTION_ID', connection.id);
  setInputValue('saml-name', connection.name);
  setInputValue('saml-entity-id', config.entity_id || '');
  setInputValue('saml-sso-url', config.sso_url || '');
  setInputValue('saml-x509-cert', config.x509_cert || '');
  const setChecked = (id, value) => {
    const el = document.getElementById(id);
    if (el && value !== undefined) el.checked = !!value;
  };
  setChecked('saml-sign-requests', config.sign_requests);
  setChecked('saml-require-signed-assertions', config.require_signed_assertions);
  setChecked('saml-require-encrypted-assertions', config.require_encrypted_assertions);
  setChecked('saml-allow-idp-initiated', config.allow_idp_initiated);
}

function oidcPayload() {
  return {
    name: document.getElementById('oidc-name').value.trim() || 'Primary OIDC',
    provider_type: 'oidc',
    is_enabled: true,
    config: {
      discovery_url: document.getElementById('oidc-discovery-url').value.trim(),
      client_id: document.getElementById('oidc-client-id').value.trim(),
      client_secret: document.getElementById('oidc-client-secret').value.trim(),
      issuer: document.getElementById('oidc-issuer').value.trim(),
      jwks_uri: document.getElementById('oidc-jwks-uri').value.trim(),
      authorization_endpoint: document.getElementById('oidc-authorization-endpoint').value.trim(),
      token_endpoint: document.getElementById('oidc-token-endpoint').value.trim(),
      scope: document.getElementById('oidc-scope').value.trim() || 'openid email profile',
      redirect_uri: document.getElementById('oidc-redirect-uri').value.trim(),
      algorithms: ['RS256'],
    },
  };
}

function samlPayload() {
  return {
    name: document.getElementById('saml-name').value.trim() || 'Primary SAML',
    provider_type: 'saml',
    is_enabled: true,
    metadata_url: document.getElementById('saml-sso-url').value.trim(),
    config: {
      entity_id: document.getElementById('saml-entity-id').value.trim(),
      sso_url: document.getElementById('saml-sso-url').value.trim(),
      x509_cert: document.getElementById('saml-x509-cert').value.trim(),
      sign_requests: document.getElementById('saml-sign-requests')?.checked ?? true,
      require_signed_assertions: document.getElementById('saml-require-signed-assertions')?.checked ?? true,
      require_encrypted_assertions: document.getElementById('saml-require-encrypted-assertions')?.checked ?? false,
      allow_idp_initiated: document.getElementById('saml-allow-idp-initiated')?.checked ?? false,
    },
  };
}

async function upsertSSOConnection(storageKey, payload) {
  const organization = await firstOrganizationId();
  const id = Number(localStorage.getItem(storageKey) || 0);
  const body = JSON.stringify({...payload, organization});
  const connection = id
    ? await hanmakApi(`/sso-connections/${id}/`, {method: 'PATCH', body})
    : await hanmakApi('/sso-connections/', {method: 'POST', body});
  localStorage.setItem(storageKey, connection.id);
  return connection;
}

async function saveOIDCConnection() {
  try {
    const payload = oidcPayload();
    if (!payload.config.client_id) return showToast('OIDC client ID is required', 'error');
    if (!payload.config.issuer) return showToast('OIDC issuer is required', 'error');
    const connection = await upsertSSOConnection('HANMAK_OIDC_CONNECTION_ID', payload);
    await validateSSOConnectionLive(connection.id, 'oidc-test-result');
    showToast(`OIDC connection saved: ${connection.name}`, 'success');
  } catch (error) {
    showToast(`OIDC save failed: ${error.message}`, 'error', 8000);
  }
}

async function saveSAMLConnection() {
  try {
    const payload = samlPayload();
    if (!payload.config.entity_id) return showToast('SAML IdP entity ID is required', 'error');
    if (!payload.config.x509_cert) return showToast('SAML X.509 certificate is required', 'error');
    const connection = await upsertSSOConnection('HANMAK_SAML_CONNECTION_ID', payload);
    await validateSSOConnectionLive(connection.id);
    showToast(`SAML connection saved: ${connection.name}`, 'success');
  } catch (error) {
    showToast(`SAML save failed: ${error.message}`, 'error', 8000);
  }
}

async function saveActiveSSOConnection() {
  const visible = [...document.querySelectorAll('[id^="sso-"]')].find(node => node.style.display !== 'none');
  if (visible?.id === 'sso-oidc') return saveOIDCConnection();
  if (visible?.id === 'sso-saml') return saveSAMLConnection();
  if (visible?.id === 'sso-ldap') return saveLDAPConnectionLive();
  if (visible?.id === 'sso-jit') return saveJITSettingsLive();
  if (visible?.id === 'sso-social') return showToast('Use each provider row to save Social Login settings.', 'info');
  showToast('Select an identity tab to save.', 'info');
}

async function startOIDCTest() {
  try {
    const connection = await upsertSSOConnection('HANMAK_OIDC_CONNECTION_ID', oidcPayload());
    const validation = await validateSSOConnectionLive(connection.id, 'oidc-test-result');
    if (!validation.ok) return showToast('Fix OIDC validation errors before testing login', 'error', 8000);
    const started = await hanmakApi(`/sso-connections/${connection.id}/oidc_authorize/`, {
      method: 'POST',
      body: JSON.stringify({redirect_uri: document.getElementById('oidc-redirect-uri').value.trim()}),
    });
    const result = document.getElementById('oidc-test-result');
    if (result) result.innerHTML = `<div class="alert alert-success">${icon('check')} OIDC authorize URL generated. <a href="${started.authorization_url}" target="_blank">Open provider login</a></div>`;
    showToast('OIDC authorization URL generated', 'success');
  } catch (error) {
    document.getElementById('oidc-test-result').innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    showToast(`OIDC test failed: ${error.message}`, 'error', 8000);
  }
}

async function testSAML() {
  try {
    const connection = await upsertSSOConnection('HANMAK_SAML_CONNECTION_ID', samlPayload());
    const validation = await validateSSOConnectionLive(connection.id);
    if (!validation.ok) return showToast('Fix SAML validation errors before testing ACS', 'error', 8000);
    const response = await hanmakApi(`/sso-connections/${connection.id}/saml_acs/`, {
      method: 'POST',
      body: JSON.stringify({SAMLResponse: ''}),
    });
    showToast(`SAML test response: ${response.ok}`, 'success');
  } catch (error) {
    showToast(`SAML validation check: ${error.message}`, 'error', 8000);
  }
}
async function validateSSOConnectionLive(connectionId, resultElementId = '') {
  const validation = await hanmakApi(`/sso-connections/${connectionId}/validate_config/`);
  const html = validation.ok
    ? `<div class="alert alert-success">${icon('check')} ${escapeHtml(validation.message)}</div>`
    : `<div class="alert alert-danger">${escapeHtml(validation.message)} Missing: ${escapeHtml(validation.missing_fields.join(', '))}</div>`;
  const result = resultElementId ? document.getElementById(resultElementId) : null;
  if (result) result.innerHTML = html;
  else showToast(validation.ok ? validation.message : `${validation.message} ${validation.missing_fields.join(', ')}`, validation.ok ? 'success' : 'error', 8000);
  return validation;
}
async function testSCIMProvisionLive(active = true) {
  try {
    const organization = await firstOrganizationId();
    const response = await hanmakApi('/scim-identities/provision-user/', {
      method: 'POST',
      body: JSON.stringify({
        organization,
        externalId: document.getElementById('scim-test-external-id').value.trim(),
        userName: document.getElementById('scim-test-email').value.trim(),
        active,
      }),
    });
    const result = document.getElementById('scim-test-result');
    if (result) result.innerHTML = `<div class="alert alert-success">${escapeHtml(response.user.email)} · ${response.membership.is_active ? 'active' : 'deactivated'} · role ${escapeHtml(response.membership.role)}</div>`;
    showToast(`SCIM user ${active ? 'provisioned' : 'deactivated'}`, 'success');
  } catch (error) {
    const result = document.getElementById('scim-test-result');
    if (result) result.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    showToast(`SCIM test failed: ${error.message}`, 'error', 8000);
  }
}

function parseLDAPUrl(value) {
  const raw = (value || '').trim();
  try {
    const parsed = new URL(raw.includes('://') ? raw : `ldap://${raw}`);
    return {
      host: parsed.hostname,
      port: Number(parsed.port || (parsed.protocol === 'ldaps:' ? 636 : 389)),
      use_ssl: parsed.protocol === 'ldaps:',
    };
  } catch (_) {
    return {host: raw.replace(/^ldaps?:\/\//, ''), port: 389, use_ssl: raw.startsWith('ldaps://')};
  }
}

function ldapPayload() {
  const server = parseLDAPUrl(document.getElementById('ldap-server-url')?.value);
  return {
    host: server.host,
    port: server.port,
    use_ssl: server.use_ssl,
    use_tls: !server.use_ssl,
    bind_dn: document.getElementById('ldap-bind-dn')?.value.trim() || '',
    bind_password: document.getElementById('ldap-bind-password')?.value || '',
    base_dn: document.getElementById('ldap-base-dn')?.value.trim() || '',
    user_filter: document.getElementById('ldap-user-filter')?.value.trim() || '(objectClass=person)',
    email_attribute: document.getElementById('ldap-email-attribute')?.value.trim() || 'mail',
    username_attribute: 'sAMAccountName',
    is_enabled: true,
  };
}

async function loadLDAPConnectionLive() {
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/ldap-connections/?organization=${orgId}`);
    const item = (data.results || data)[0];
    if (!item) return;
    localStorage.setItem('HANMAK_LDAP_CONNECTION_ID', item.id);
    setInputValue('ldap-server-url', `${item.use_ssl ? 'ldaps' : 'ldap'}://${item.host}:${item.port}`);
    setInputValue('ldap-base-dn', item.base_dn || '');
    setInputValue('ldap-bind-dn', item.bind_dn || '');
    setInputValue('ldap-user-filter', item.user_filter || '(objectClass=person)');
    setInputValue('ldap-email-attribute', item.email_attribute || 'mail');
  } catch (error) {
    showToast(`LDAP load failed: ${error.message}`, 'error', 7000);
  }
}

async function saveLDAPConnectionLive() {
  try {
    const organization = await firstOrganizationId();
    const payload = {...ldapPayload(), organization};
    if (!payload.host) return showToast('LDAP server URL is required', 'error');
    const id = Number(localStorage.getItem('HANMAK_LDAP_CONNECTION_ID') || 0);
    const saved = id
      ? await hanmakApi(`/ldap-connections/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)})
      : await hanmakApi('/ldap-connections/', {method: 'POST', body: JSON.stringify(payload)});
    localStorage.setItem('HANMAK_LDAP_CONNECTION_ID', saved.id);
    showToast('LDAP settings saved', 'success');
    return saved;
  } catch (error) {
    showToast(`LDAP save failed: ${error.message}`, 'error', 8000);
  }
}

async function testLDAPConnectionLive() {
  const result = document.getElementById('ldap-test-result');
  try {
    const saved = await saveLDAPConnectionLive();
    if (!saved?.id) return;
    const tested = await hanmakApi(`/ldap-connections/${saved.id}/test/`, {method: 'POST', body: JSON.stringify({})});
    if (result) result.innerHTML = `<div class="alert alert-${tested.ok ? 'success' : 'danger'}">${escapeHtml(tested.message)}</div>`;
    showToast(tested.message, tested.ok ? 'success' : 'error', 8000);
  } catch (error) {
    if (result) result.innerHTML = `<div class="alert alert-danger">${escapeHtml(error.message)}</div>`;
    showToast(`LDAP test failed: ${error.message}`, 'error', 8000);
  }
}

function setChecked(id, checked) {
  const input = document.getElementById(id);
  if (input) input.checked = !!checked;
}

async function loadJITSettingsLive() {
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/jit-settings/?organization=${orgId}`);
    const item = (data.results || data)[0];
    if (!item) return;
    localStorage.setItem('HANMAK_JIT_SETTINGS_ID', item.id);
    setChecked('jit-enable-jit-provisioning', item.is_enabled);
    setChecked('jit-auto-create-user-on-first-sso-login', item.auto_create_user);
    setChecked('jit-update-user-attributes-on-each-login', item.update_on_login);
    setChecked('jit-require-email-domain-match', item.require_domain_match);
    setInputValue('jit-default-role', item.default_role || 'signer');
    setInputValue('jit-allowed-domains', (item.allowed_domains || []).join(', '));
  } catch (error) {
    showToast(`JIT load failed: ${error.message}`, 'error', 7000);
  }
}

async function saveJITSettingsLive() {
  try {
    const organization = await firstOrganizationId();
    const payload = {
      organization,
      is_enabled: document.getElementById('jit-enable-jit-provisioning')?.checked ?? false,
      auto_create_user: document.getElementById('jit-auto-create-user-on-first-sso-login')?.checked ?? true,
      update_on_login: document.getElementById('jit-update-user-attributes-on-each-login')?.checked ?? true,
      require_domain_match: document.getElementById('jit-require-email-domain-match')?.checked ?? true,
      default_role: document.getElementById('jit-default-role')?.value || 'signer',
      allowed_domains: (document.getElementById('jit-allowed-domains')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
    };
    const id = Number(localStorage.getItem('HANMAK_JIT_SETTINGS_ID') || 0);
    const saved = id
      ? await hanmakApi(`/jit-settings/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)})
      : await hanmakApi('/jit-settings/', {method: 'POST', body: JSON.stringify(payload)});
    localStorage.setItem('HANMAK_JIT_SETTINGS_ID', saved.id);
    showToast('JIT settings saved', 'success');
  } catch (error) {
    showToast(`JIT save failed: ${error.message}`, 'error', 8000);
  }
}

async function loadSocialProvidersLive() {
  const el = document.getElementById('social-provider-list');
  if (!el) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/social-providers/?organization=${orgId}`);
    const saved = new Map((data.results || data).map(item => [item.provider_type, item]));
    const providers = [
      ['google', 'Google', '#4285f4'],
      ['microsoft', 'Microsoft', '#0072c6'],
      ['github', 'GitHub', '#333'],
      ['linkedin', 'LinkedIn', '#0a66c2'],
      ['apple', 'Apple', '#000'],
    ];
    el.innerHTML = providers.map(([type, name, color]) => {
      const item = saved.get(type) || {};
      const configured = !!item.client_id;
      return `<div style="display:flex;align-items:center;gap:1rem;padding:1rem;border:1px solid var(--border);border-radius:8px">
        <div style="width:36px;height:36px;background:${color};border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.875rem;flex-shrink:0">${name[0]}</div>
        <div style="flex:1"><div style="font-weight:600">${name}</div><div style="font-size:0.78rem;color:var(--text-muted)">${configured ? `Client ${escapeHtml(item.client_id)}` : 'Not configured'}</div></div>
        <span class="badge badge-${item.is_enabled ? 'success' : 'secondary'}">${item.is_enabled ? 'Enabled' : 'Disabled'}</span>
        <button class="btn btn-ghost btn-sm" onclick="openSocialProviderModal('${type}','${name}',${item.id || 0},'${encodeURIComponent(item.client_id || '')}',${item.is_enabled ? 'true' : 'false'})">${icon('settings')}</button>
      </div>`;
    }).join('');
  } catch (error) {
    el.innerHTML = `<div style="color:var(--danger);font-size:0.875rem">Failed to load social providers: ${escapeHtml(error.message)}</div>`;
  }
}

function openSocialProviderModal(type, name, id, clientId, enabled) {
  const decodedClientId = decodeURIComponent(clientId || '');
  openModal(`<div class="modal-header"><h3 class="modal-title">${icon('settings')} ${escapeHtml(name)} Login</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Client ID</label><input id="social-client-id" class="form-input" value="${escapeHtml(decodedClientId)}"></div>
      <div class="form-group"><label class="form-label">Client Secret</label><input id="social-client-secret" type="password" class="form-input" placeholder="Leave blank to keep existing secret"></div>
      <div class="form-group"><label class="form-label">Allowed Domains</label><input id="social-allowed-domains" class="form-input" placeholder="example.com, example.org"></div>
      <label class="checkbox-wrap"><input id="social-enabled" type="checkbox" ${enabled ? 'checked' : ''}><span class="checkbox-label">Enable provider</span></label>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveSocialProviderLive('${type}',${id})">${icon('save')} Save</button></div>`);
}

async function saveSocialProviderLive(type, id) {
  try {
    const organization = await firstOrganizationId();
    const payload = {
      organization,
      provider_type: type,
      client_id: document.getElementById('social-client-id')?.value.trim() || '',
      client_secret: document.getElementById('social-client-secret')?.value || '',
      allowed_domains: (document.getElementById('social-allowed-domains')?.value || '').split(',').map(v => v.trim()).filter(Boolean),
      is_enabled: document.getElementById('social-enabled')?.checked ?? false,
    };
    if (id) await hanmakApi(`/social-providers/${id}/`, {method: 'PATCH', body: JSON.stringify(payload)});
    else await hanmakApi('/social-providers/', {method: 'POST', body: JSON.stringify(payload)});
    closeModal();
    showToast('Social provider saved', 'success');
    loadSocialProvidersLive();
  } catch (error) {
    showToast(`Social provider save failed: ${error.message}`, 'error', 8000);
  }
}
function loadIdPPreset(name) {
  const presets = {
    Okta: {
      entity: 'https://example.okta.com/app/hanmak/sso/saml/metadata',
      sso: 'https://example.okta.com/app/hanmak/sso/saml',
      name: 'Okta SAML',
    },
    'Azure AD': {
      entity: 'https://sts.windows.net/{tenant-id}/',
      sso: 'https://login.microsoftonline.com/{tenant-id}/saml2',
      name: 'Azure AD SAML',
    },
    'Google Workspace': {
      entity: 'https://accounts.google.com/o/saml2?idpid={idp-id}',
      sso: 'https://accounts.google.com/o/saml2/idp?idpid={idp-id}',
      name: 'Google Workspace SAML',
    },
    OneLogin: {
      entity: 'https://app.onelogin.com/saml/metadata/{app-id}',
      sso: 'https://your-subdomain.onelogin.com/trust/saml2/http-post/sso/{app-id}',
      name: 'OneLogin SAML',
    },
    JumpCloud: {
      entity: 'https://sso.jumpcloud.com/saml2/hanmak',
      sso: 'https://sso.jumpcloud.com/saml2/hanmak',
      name: 'JumpCloud SAML',
    },
    'Ping Identity': {
      entity: 'https://auth.pingone.com/{environment-id}',
      sso: 'https://auth.pingone.com/{environment-id}/saml20/idp/sso',
      name: 'Ping Identity SAML',
    },
  };
  const preset = presets[name];
  if (!preset) return showToast(`No preset found for ${name}`, 'error');
  setInputValue('saml-name', preset.name);
  setInputValue('saml-entity-id', preset.entity);
  setInputValue('saml-sso-url', preset.sso);
  showToast(`${name} preset loaded. Paste the IdP certificate, then Save.`, 'success', 6000);
}
