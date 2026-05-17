// ==================== SETTINGS GENERAL ====================
registerPage('settings-general', () => `
<div class="page-header">
  <div><h1 class="page-title">General Settings</h1><p class="page-subtitle">Core application configuration and preferences</p></div>
  <button class="btn btn-primary" onclick="saveGeneralSettings()">${icon('save')} Save Changes</button>
</div>
<div class="settings-layout">
  ${settingsNav('general')}
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Application Settings</h3>
      <div class="form-group"><label class="form-label">Application Name</label><input id="gs-app-name" class="form-input" value="HanMak"></div>
      <div class="form-group"><label class="form-label">Support Email</label><input id="gs-support-email" class="form-input" type="email" value="support@yourorg.com"></div>
      <div class="form-group"><label class="form-label">Default Language</label>
        <select id="gs-locale" class="form-input"><option value="en-US">English (US)</option><option value="en-GB">English (UK)</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="ja">Japanese</option></select>
      </div>
      <div class="form-group"><label class="form-label">Date Format</label>
        <select id="gs-date-format" class="form-input"><option value="MM/DD/YYYY">MM/DD/YYYY</option><option value="DD/MM/YYYY">DD/MM/YYYY</option><option value="YYYY-MM-DD">YYYY-MM-DD (ISO 8601)</option></select>
      </div>
      <div class="form-group"><label class="form-label">Time Format</label>
        <select id="gs-time-format" class="form-input"><option value="12h">12-hour (AM/PM)</option><option value="24h">24-hour</option></select>
      </div>
      <div class="form-group"><label class="form-label">Default Timezone</label>
        <select id="gs-timezone" class="form-input"><option value="America/Los_Angeles">UTC-8 Pacific</option><option value="America/New_York">UTC-5 Eastern</option><option value="UTC">UTC+0 London</option><option value="Asia/Singapore">UTC+8 Singapore</option></select>
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Envelope Defaults</h3>
      <div class="form-group"><label class="form-label">Default Expiration (days)</label>
        <input id="gs-envelope-expiration-days" class="form-input" type="number" value="30" min="1" style="width:120px">
      </div>
      <div class="form-group"><label class="form-label">Default Reminder Schedule</label>
        <select id="gs-reminder-schedule" class="form-input"><option value="every_2_days">Every 2 days</option><option value="daily">Daily</option><option value="every_3_days">Every 3 days</option><option value="none">None</option></select>
      </div>
      <div class="form-group"><label class="form-label">Signing Order</label>
        <select id="gs-signing-order" class="form-input"><option value="sequential">Sequential (one at a time)</option><option value="parallel">Parallel (all at once)</option></select>
      </div>
      <div class="flex flex-col gap-2" style="font-size:0.875rem">
        ${[['Require email verification before signing','true','gs-require-email-verification'],['Allow signing on mobile devices','true','gs-allow-mobile-signing'],['Enable completion certificates','true','gs-enable-completion-certificates'],['Send audit trail on completion','true','gs-send-audit-trail'],['Allow bulk send','true','gs-allow-bulk-send']].map(([label,def,id])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <span>${label}</span>
            <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
              <input id="${id}" type="checkbox" ${def==='true'?'checked':''} style="opacity:0;width:0;height:0" onchange="this.nextElementSibling.style.background=this.checked?'var(--primary)':'var(--border)'">
              <span style="position:absolute;inset:0;background:${def==='true'?'var(--primary)':'var(--border)'};border-radius:11px;transition:0.2s"></span>
            </label>
          </div>`).join('')}
      </div>
    </div>
  </div>
</div>
`);

// ==================== SETTINGS BRANDING ====================
registerPage('settings-branding', () => `
<div class="page-header">
  <div><h1 class="page-title">Branding</h1><p class="page-subtitle">Customize the look and feel for signers and emails</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="settings_branding_init()">${icon('refresh')} Refresh</button>
    <button class="btn btn-primary" onclick="saveBrandingSettings()">${icon('save')} Save</button>
  </div>
</div>
<div class="settings-layout">
  ${settingsNav('branding')}
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Logo & Identity</h3>
      <div class="form-group">
        <label class="form-label">Organization Logo</label>
        <div style="display:flex;gap:1.5rem;align-items:flex-start">
          <div id="brand-logo-preview" style="width:80px;height:80px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.5rem;flex-shrink:0">A</div>
          <div>
            <button class="btn btn-ghost btn-sm" onclick="uploadOrgLogoLive()">${icon('upload')} Upload Logo</button>
            <input type="file" id="brand-logo-file" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none" onchange="submitOrgLogoLive(this)">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.375rem">PNG or JPEG · Max 2MB · Recommended: 200×60px</div>
          </div>
        </div>
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Color Palette</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        ${[['Primary Color','#4f8ef7','brand-primary-color','primary_color'],['Accent Color','#0d1117','brand-accent-color','accent_color'],['Button Color','#4f8ef7','brand-button-color','button_color'],['Link Color','#4f8ef7','brand-link-color','link_color'],['Background','#ffffff','brand-bg-color','background_color'],['Email Header BG','#0d1117','brand-email-header-color','email_header_bg']].map(([label,color,id])=>`
          <div class="form-group">
            <label class="form-label">${label}</label>
            <div class="flex gap-2 align-items-center">
              <input type="color" id="${id}-picker" value="${color}" style="width:40px;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px" oninput="document.getElementById('${id}').value=this.value">
              <input id="${id}" class="form-input" value="${color}" style="flex:1;font-family:var(--font-mono);font-size:0.875rem" oninput="document.getElementById('${id}-picker').value=this.value">
            </div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Custom Domain</h3>
      <div class="form-group">
        <label class="form-label">Signing Portal Domain</label>
        <div class="flex gap-2">
          <input id="brand-portal-domain" class="form-input" value="" placeholder="sign.yourorg.com" style="flex:1">
          <button class="btn btn-ghost" onclick="showToast('Domain verification is managed in Admin → Domains','info')">${icon('info')} Info</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">Add a CNAME record pointing your domain → portal.hanmak.io</div>
      </div>
      <div class="form-group">
        <label class="form-label">Email From Domain</label>
        <input id="brand-email-domain" class="form-input" value="" placeholder="sign@yourorg.com">
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Custom Email Footer</h3>
      <textarea id="brand-email-footer" class="form-input" rows="4" placeholder="This email was sent by your organization. If you have questions, contact your support team."></textarea>
      <div style="font-size:0.75rem;color:var(--text-muted);margin-top:4px">HTML is supported. Leave blank to use default HanMak footer.</div>
    </div>
  </div>
</div>
`);

function uploadOrgLogoLive() {
  const input = document.getElementById('brand-logo-file');
  if (input) input.click();
}

async function submitOrgLogoLive(input) {
  if (!input.files || !input.files[0]) return;
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const formData = new FormData();
    formData.append('logo', input.files[0]);
    const data = await hanmakApi(`/organizations/${orgId}/upload_logo/`, {
      method: 'POST',
      headers: {},
      body: formData,
    });
    const preview = document.getElementById('brand-logo-preview');
    if (preview && data.logo_url) {
      preview.innerHTML = `<img src="${data.logo_url}" style="width:80px;height:80px;object-fit:contain;border-radius:12px">`;
    }
    if (data.logo_url) applyBrandingThemeLive({}, data.logo_url);
    showToast('Logo uploaded', 'success');
  } catch (error) {
    showToast(`Logo upload failed: ${error.message}`, 'error');
  }
}

async function settings_branding_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/organizations/${orgId}/branding/`);
    const v = (data.value && typeof data.value === 'object') ? data.value : {};
    const colorMap = {
      'brand-primary-color': v.primary_color,
      'brand-accent-color': v.accent_color,
      'brand-button-color': v.button_color,
      'brand-link-color': v.link_color,
      'brand-bg-color': v.background_color,
      'brand-email-header-color': v.email_header_bg,
    };
    for (const [id, value] of Object.entries(colorMap)) {
      if (!value) continue;
      const textEl = document.getElementById(id);
      const pickerEl = document.getElementById(`${id}-picker`);
      if (textEl) textEl.value = value;
      if (pickerEl) pickerEl.value = value;
    }
    const portalDomain = document.getElementById('brand-portal-domain');
    if (portalDomain) portalDomain.value = v.signing_portal_domain || '';
    const emailDomain = document.getElementById('brand-email-domain');
    if (emailDomain) emailDomain.value = v.email_from_domain || '';
    const footer = document.getElementById('brand-email-footer');
    if (footer) footer.value = v.email_footer || '';
    if (data.logo_url) {
      const preview = document.getElementById('brand-logo-preview');
      if (preview) preview.innerHTML = `<img src="${data.logo_url}" style="width:80px;height:80px;object-fit:contain;border-radius:12px">`;
    }
    applyBrandingThemeLive(v, data.logo_url);
  } catch (error) {
    showToast(`Could not load branding: ${error.message}`, 'error');
  }
}

async function saveBrandingSettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const value = {
      primary_color: document.getElementById('brand-primary-color')?.value || '',
      accent_color: document.getElementById('brand-accent-color')?.value || '',
      button_color: document.getElementById('brand-button-color')?.value || '',
      link_color: document.getElementById('brand-link-color')?.value || '',
      background_color: document.getElementById('brand-bg-color')?.value || '',
      email_header_bg: document.getElementById('brand-email-header-color')?.value || '',
      signing_portal_domain: document.getElementById('brand-portal-domain')?.value.trim() || '',
      email_from_domain: document.getElementById('brand-email-domain')?.value.trim() || '',
      email_footer: document.getElementById('brand-email-footer')?.value || '',
    };
    await hanmakApi(`/organizations/${orgId}/branding/`, {
      method: 'PATCH',
      body: JSON.stringify({value}),
    });
    applyBrandingThemeLive(value);
    showToast('Branding saved', 'success');
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}

function applyBrandingThemeLive(value = {}, logoUrl = '') {
  const root = document.documentElement;
  if (value.primary_color) root.style.setProperty('--primary', value.primary_color);
  if (value.button_color) root.style.setProperty('--accent', value.button_color);
  if (value.link_color) root.style.setProperty('--info', value.link_color);
  if (value.background_color) root.style.setProperty('--bg-primary', value.background_color);
  const logoIcon = document.querySelector('.sidebar-logo-icon');
  if (logoIcon && logoUrl) {
    logoIcon.innerHTML = `<img src="${escapeHtml(logoUrl)}" alt="Logo" style="width:100%;height:100%;object-fit:contain;border-radius:8px">`;
  }
}

// ==================== SETTINGS EMAIL ====================
registerPage('settings-email', () => `
<div class="page-header">
  <div><h1 class="page-title">Email Settings</h1><p class="page-subtitle">Configure SMTP provider and email templates</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="testEmailSend()">${icon('send')} Send Test Email</button>
    <button class="btn btn-primary" onclick="saveEmailSettings()">${icon('save')} Save</button>
  </div>
</div>
<div class="settings-layout">
${settingsNav('email')}
<div class="flex flex-col gap-4">
  <div class="card" style="padding:1.5rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Email Provider</h3>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.25rem">
      ${[['sendgrid','SendGrid','Active'],['postmark','Postmark',''],['ses','AWS SES',''],['smtp','Custom SMTP','']].map(([val,name,provider_active])=>`
        <div data-provider="${val}" style="padding:0.875rem;border:2px solid ${provider_active?'var(--primary)':'var(--border)'};border-radius:8px;text-align:center;cursor:pointer;background:${provider_active?'var(--primary-light,#dbeafe)':''}"
          onclick="selectEmailProvider('${val}',this)">
          <div style="font-weight:600;font-size:0.875rem">${name}</div>
          ${provider_active?'<span class="badge badge-primary" style="font-size:0.7rem;margin-top:4px">Active</span>':''}
        </div>`).join('')}
    </div>
    <input type="hidden" id="em-provider" value="sendgrid">
    <div class="form-group"><label class="form-label">API Key / SMTP Password</label>
      <input class="form-input" type="password" value="SG.xxxxxxxxxxxxxxxxxxx" style="font-family:var(--font-mono)">
    </div>
    <div class="form-group"><label class="form-label">From Name</label><input id="em-from-name" class="form-input" value="Acme Corp Documents"></div>
    <div class="form-group"><label class="form-label">From Email</label><input id="em-from-email" class="form-input" value="sign@acmecorp.com"></div>
    <div class="form-group"><label class="form-label">Reply-To</label><input id="em-reply-to" class="form-input" value="legal@acmecorp.com"></div>
  </div>
  <div class="card" style="padding:1.5rem">
    <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Email Templates</h3>
    <div id="email-template-list" class="flex flex-col gap-2">
      ${[['Invitation to Sign','Active'],['Reminder — Pending Signature','Active'],['Signature Completed','Active'],['Approval Requested','Active'],['Approval Granted/Declined','Active'],['Envelope Voided','Active'],['Envelope Expired','Active'],['Welcome / Onboarding','Active']].map(([name,status])=>`
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem;border:1px solid var(--border);border-radius:7px">
          <div style="flex:1"><div style="font-weight:500;font-size:0.875rem">${name}</div></div>
          <span class="badge badge-success">${status}</span>
          <button class="btn btn-ghost btn-sm" onclick="editEmailTemplate('${name}')">${icon('edit')}</button>
          <button class="btn btn-ghost btn-sm" onclick="previewEmailTemplateByName('${name}')">${icon('eye')}</button>
        </div>`).join('')}
    </div>
  </div>
</div>
</div>
`);

function selectEmailProvider(value, el) {
  document.querySelectorAll('[data-provider]').forEach(e => { e.style.border='2px solid var(--border)'; e.style.background=''; });
  el.style.border='2px solid var(--primary)'; el.style.background='var(--primary-light,#dbeafe)';
  const hidden = document.getElementById('em-provider');
  if (hidden) hidden.value = value;
  showToast('Switched to '+value,'success');
}
function testEmailSend() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Send Test Email</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Send to</label><input id="email-test-to" class="form-input" type="email" value="admin@yourorg.com"></div>
      <div class="form-group"><label class="form-label">Template</label>
        <select id="email-test-kind" class="form-input"><option value="envelope_invite">Invitation to Sign</option><option value="reminder">Reminder</option><option value="completed">Completion</option></select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitEmailTestLive()">${icon('send')} Send Test</button>
    </div>
  `);
}
async function submitEmailTestLive() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const result = await hanmakApi('/email-messages/test_smtp/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        to_email: document.getElementById('email-test-to')?.value.trim() || '',
        kind: document.getElementById('email-test-kind')?.value || 'envelope_invite',
      }),
    });
    closeModal();
    showToast(`SMTP test sent to ${result.to_email}`, 'success');
  } catch (error) {
    showToast(`SMTP test failed: ${error.message}`, 'error', 8000);
  }
}

function emailTemplateKindForName(name) {
  const key = String(name || '').toLowerCase();
  if (key.includes('reminder')) return 'reminder';
  if (key.includes('completed') || key.includes('completion')) return 'completed';
  if (key.includes('welcome') || key.includes('onboarding')) return 'invitation';
  return 'envelope_invite';
}

async function loadEmailTemplatesLive(orgId) {
  const list = document.getElementById('email-template-list');
  if (!list) return;
  try {
    const data = await hanmakApi(`/email-templates/?organization=${orgId}`);
    const templates = data.results || data;
    if (!templates.length) {
      list.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:1rem">No email templates yet. Use Edit on a default row to create one.</div>';
      return;
    }
    list.innerHTML = templates.map(template => `
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem;border:1px solid var(--border);border-radius:7px">
        <div style="flex:1;min-width:0">
          <div style="font-weight:500;font-size:0.875rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(template.name)}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(template.kind)} · updated ${apiDate(template.updated_at)}</div>
        </div>
        <span class="badge badge-${template.is_active ? 'success' : 'secondary'}">${template.is_active ? 'Active' : 'Inactive'}</span>
        <button class="btn btn-ghost btn-sm" onclick="editEmailTemplateById(${template.id})">${icon('edit')}</button>
        <button class="btn btn-ghost btn-sm" onclick="previewEmailTemplateLive(${template.id})">${icon('eye')}</button>
      </div>`).join('');
  } catch (error) {
    list.innerHTML = `<div style="text-align:center;color:var(--danger);padding:1rem">Email templates failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function previewEmailTemplateByName(name) {
  const orgId = await firstOrganizationId();
  const data = await hanmakApi(`/email-templates/?organization=${orgId}&kind=${emailTemplateKindForName(name)}`);
  const template = (data.results || data)[0];
  if (!template) return editEmailTemplate(name);
  return previewEmailTemplateLive(template.id);
}

async function previewEmailTemplateLive(id) {
  try {
    const preview = await hanmakApi(`/email-templates/${id}/preview/`, {method:'POST', body: JSON.stringify({})});
    openModal(`
      <div class="modal-header"><h3 class="modal-title">Email Preview</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div style="font-weight:700;margin-bottom:0.5rem">${escapeHtml(preview.subject)}</div>
        <pre style="white-space:pre-wrap;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:0.75rem;font-size:0.8125rem">${escapeHtml(preview.body)}</pre>
        ${preview.html_body ? `<iframe style="width:100%;height:260px;border:1px solid var(--border);border-radius:6px;margin-top:0.75rem;background:white" srcdoc="${preview.html_body.replaceAll('"', '&quot;')}"></iframe>` : ''}
      </div>
      <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Close</button></div>
    `);
  } catch (error) {
    showToast(`Preview failed: ${error.message}`, 'error', 7000);
  }
}

async function editEmailTemplateById(id) {
  try {
    const template = await hanmakApi(`/email-templates/${id}/`);
    openEmailTemplateEditor(template);
  } catch (error) {
    showToast(`Template load failed: ${error.message}`, 'error', 7000);
  }
}

async function editEmailTemplate(name) {
  const orgId = await firstOrganizationId();
  const data = await hanmakApi(`/email-templates/?organization=${orgId}&kind=${emailTemplateKindForName(name)}`);
  const template = (data.results || data).find(item => item.name === name) || (data.results || data)[0] || {
    id: '',
    organization: orgId,
    kind: emailTemplateKindForName(name),
    name,
    subject_template: `${name} - {{ envelope_name }}`,
    body_template: `Hello {{ recipient_name }},\n\nPlease review {{ envelope_name }}.\n\n{{ signing_url }}`,
    html_template: '',
    is_active: true,
  };
  openEmailTemplateEditor(template);
}

function openEmailTemplateEditor(template) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Edit Email Template</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <input id="email-template-id" type="hidden" value="${escapeHtml(template.id || '')}">
      <input id="email-template-org" type="hidden" value="${escapeHtml(template.organization || '')}">
      <div class="form-group"><label class="form-label">Kind</label><select id="email-template-kind" class="form-input">
        ${['invitation','envelope_invite','reminder','completed'].map(kind => `<option value="${kind}" ${template.kind === kind ? 'selected' : ''}>${kind}</option>`).join('')}
      </select></div>
      <div class="form-group"><label class="form-label">Name</label><input id="email-template-name" class="form-input" value="${escapeHtml(template.name || '')}"></div>
      <div class="form-group"><label class="form-label">Subject</label><input id="email-template-subject" class="form-input" value="${escapeHtml(template.subject_template || '')}"></div>
      <div class="form-group"><label class="form-label">Text Body</label><textarea id="email-template-body" class="form-input" rows="6">${escapeHtml(template.body_template || '')}</textarea></div>
      <div class="form-group"><label class="form-label">HTML Body</label><textarea id="email-template-html" class="form-input" rows="5">${escapeHtml(template.html_template || '')}</textarea></div>
      <label style="display:flex;align-items:center;gap:0.5rem"><input id="email-template-active" type="checkbox" ${template.is_active !== false ? 'checked' : ''}> Active</label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="saveEmailTemplateLive()">${icon('save')} Save Template</button>
    </div>
  `);
}

async function saveEmailTemplateLive() {
  try {
    const id = document.getElementById('email-template-id')?.value || '';
    const orgId = Number(document.getElementById('email-template-org')?.value || await firstOrganizationId());
    const payload = {
      organization: orgId,
      kind: document.getElementById('email-template-kind')?.value || 'envelope_invite',
      name: document.getElementById('email-template-name')?.value.trim() || 'Email Template',
      subject_template: document.getElementById('email-template-subject')?.value || '',
      body_template: document.getElementById('email-template-body')?.value || '',
      html_template: document.getElementById('email-template-html')?.value || '',
      is_active: document.getElementById('email-template-active')?.checked ?? true,
    };
    await hanmakApi(id ? `/email-templates/${id}/` : '/email-templates/', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    closeModal();
    showToast('Email template saved', 'success');
    settings_email_init();
  } catch (error) {
    showToast(`Template save failed: ${error.message}`, 'error', 8000);
  }
}

// ==================== SETTINGS STORAGE ====================
registerPage('settings-storage', () => `
<div class="page-header">
  <div><h1 class="page-title">Storage</h1><p class="page-subtitle">Configure document storage backend and encryption</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="testStorageConnection()">${icon('check-circle')} Test Connection</button>
    <button class="btn btn-primary" onclick="saveStorageSettings()">${icon('save')} Save</button>
  </div>
</div>
<div class="settings-layout">
  ${settingsNav('storage')}
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Storage Provider</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem;margin-bottom:1.25rem">
        ${[['s3','AWS S3','Active'],['minio','MinIO',''],['azure','Azure Blob',''],['local','Local Disk','']].map(([val,name,active])=>`
          <div data-backend="${val}" style="padding:0.875rem;border:2px solid ${active?'var(--primary)':'var(--border)'};border-radius:8px;text-align:center;cursor:pointer;background:${active?'var(--primary-light,#dbeafe)':''}"
            onclick="selectStorage('${val}',this)">
            <div style="font-weight:600;font-size:0.875rem">${name}</div>
            ${active?'<span class="badge badge-primary" style="font-size:0.7rem;margin-top:4px">Active</span>':''}
          </div>`).join('')}
      </div>
      <input type="hidden" id="st-backend" value="s3">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group"><label class="form-label">AWS Region / Endpoint Region</label>
          <select id="st-region" class="form-input"><option value="us-east-1">us-east-1</option><option value="us-west-2">us-west-2</option><option value="eu-west-1">eu-west-1</option><option value="ap-southeast-1">ap-southeast-1</option></select>
        </div>
        <div class="form-group"><label class="form-label">Bucket Name</label><input id="st-bucket" class="form-input" value="hanmak-prod-documents"></div>
        <div class="form-group"><label class="form-label">Access Key ID</label><input class="form-input" value="AKIA••••••••••••••••" style="font-family:var(--font-mono)"></div>
        <div class="form-group"><label class="form-label">Secret Access Key</label><input class="form-input" type="password" value="••••••••••••••••••••••••" style="font-family:var(--font-mono)"></div>
      </div>
      <div class="form-group"><label class="form-label">Endpoint URL (MinIO / custom S3-compatible)</label><input id="st-endpoint" class="form-input" placeholder="https://minio.yourhost.com"></div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Encryption</h3>
      <div id="storage-encryption-list" class="flex flex-col gap-3">
        <div style="padding:0.75rem;color:var(--text-muted);font-size:0.8125rem">Loading saved encryption policy…</div>
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Usage</h3>
      <div id="storage-usage-live">
        <div style="padding:0.75rem;color:var(--text-muted);font-size:0.8125rem">Loading live storage metrics…</div>
      </div>
    </div>
  </div>
</div>
`);

function selectStorage(value, el) {
  document.querySelectorAll('[data-backend]').forEach(e => { e.style.border='2px solid var(--border)'; e.style.background=''; });
  el.style.border='2px solid var(--primary)'; el.style.background='var(--primary-light,#dbeafe)';
  const hidden = document.getElementById('st-backend');
  if (hidden) hidden.value = value;
  showToast('Switched to '+value,'success');
}
async function testStorageConnection() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const summary = await hanmakApi('/health-checks/summary/');
    const metrics = summary.metrics || {};
    const configured = metrics.object_storage_configured ? 'configured' : 'not configured';
    const reachable = metrics.minio_reachable === null || metrics.minio_reachable === undefined ? 'not checked' : (metrics.minio_reachable ? 'reachable' : 'unreachable');
    showToast(`Storage check: local media OK · object storage ${configured} · MinIO ${reachable}`, metrics.minio_reachable === false ? 'warning' : 'success', 7000);
  } catch (error) {
    showToast(`Storage check failed: ${error.message}`, 'error', 7000);
  }
}

function storageBytesLabel(value) {
  if (typeof bytesLabel === 'function') return bytesLabel(value);
  const bytes = Number(value || 0);
  if (!bytes) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

function renderStorageRuntime(settings = {}, metrics = {}) {
  const encryption = document.getElementById('storage-encryption-list');
  if (encryption) {
    const rows = [
      ['Encryption at Rest', settings.encrypt_at_rest ? 'Enabled' : 'Disabled', settings.encrypt_at_rest ? 'success' : 'warning'],
      ['Storage Backend', titleCaseStatus(settings.backend || 'local'), 'secondary'],
      ['Object Storage Credentials', metrics.object_storage_configured ? 'Configured in environment' : 'Not configured', metrics.object_storage_configured ? 'success' : 'secondary'],
      ['MinIO Health', metrics.minio_reachable === true ? `Reachable${metrics.minio_latency_ms ? ` · ${metrics.minio_latency_ms}ms` : ''}` : metrics.minio_reachable === false ? 'Unreachable' : 'Not checked', metrics.minio_reachable === false ? 'danger' : metrics.minio_reachable === true ? 'success' : 'secondary'],
    ];
    encryption.innerHTML = rows.map(([label, value, color]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.625rem 0;border-bottom:1px solid var(--border)">
        <span style="font-size:0.875rem">${escapeHtml(label)}</span>
        <span class="badge badge-${color}">${escapeHtml(value)}</span>
      </div>`).join('');
  }

  const usage = document.getElementById('storage-usage-live');
  if (usage) {
    const used = Number(metrics.used_bytes || 0);
    const total = Number(metrics.total_bytes || 0);
    const free = Number(metrics.free_bytes || 0);
    const percent = Number(metrics.used_percent || 0);
    const safePercent = Math.min(100, Math.max(0, percent));
    usage.innerHTML = `
      <div style="margin-bottom:1rem">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.875rem">
          <span>${storageBytesLabel(used)} used</span>
          <span style="color:var(--text-muted)">of ${storageBytesLabel(total)}</span>
        </div>
        <div style="height:10px;background:var(--border);border-radius:5px"><div style="width:${safePercent}%;height:100%;background:${safePercent > 80 ? 'var(--danger)' : safePercent > 60 ? 'var(--warning)' : 'var(--primary)'};border-radius:5px"></div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;font-size:0.8125rem">
        ${[
          ['Free Space', storageBytesLabel(free)],
          ['Used Percent', total ? `${safePercent.toFixed(1)}%` : 'n/a'],
          ['Media Root', metrics.media_root || 'n/a'],
          ['Object Endpoint', metrics.object_storage_endpoint || metrics.minio_endpoint || 'n/a'],
        ].map(([cat, size]) => `
          <div style="padding:0.5rem;background:var(--bg-secondary);border-radius:6px;min-width:0">
            <div style="color:var(--text-muted);font-size:0.75rem">${escapeHtml(cat)}</div>
            <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(size)}">${escapeHtml(size)}</div>
          </div>`).join('')}
      </div>`;
  }
}

// ==================== SETTINGS SECURITY ====================
registerPage('settings-security', () => `
<div class="page-header">
  <div><h1 class="page-title">Security</h1><p class="page-subtitle">Authentication, access control, and security policies</p></div>
  <button class="btn btn-primary" onclick="saveSecuritySettings()">${icon('save')} Save</button>
</div>
<div class="settings-layout">
  ${settingsNav('security')}
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Multi-Factor Authentication</h3>
      <div class="flex flex-col gap-3">
        ${[['sec-require-mfa','Require MFA for all users',false],['sec-require-admin-mfa','Require MFA for Admin users only',false],['sec-allow-sms-mfa','Allow SMS as MFA method',false],['sec-allow-totp-mfa','Allow TOTP apps (Google Auth, Authy)',true],['sec-allow-passkeys','Allow hardware keys (FIDO2/WebAuthn)',true],['sec-remember-device','Remember device for 30 days',true]].map(([id,label,def])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0;border-bottom:1px solid var(--border)">
            <span style="font-size:0.875rem">${label}</span>
            <label style="position:relative;display:inline-block;width:40px;height:22px;cursor:pointer">
              <input type="checkbox" ${id?`id="${id}"`:''} ${def?'checked':''} style="opacity:0;width:0;height:0" onchange="this.nextElementSibling.style.background=this.checked?'var(--primary)':'var(--border)'">
              <span style="position:absolute;inset:0;background:${def?'var(--primary)':'var(--border)'};border-radius:11px;transition:0.2s"></span>
            </label>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Password Policy</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group"><label class="form-label">Minimum Length</label><input id="sec-password-min-length" class="form-input" type="number" value="12" style="width:100px"></div>
        <div class="form-group"><label class="form-label">Password Expiry (days)</label><input id="sec-password-expiry" class="form-input" type="number" value="90" style="width:100px"></div>
      </div>
      <div class="flex flex-col gap-2" style="font-size:0.875rem">
        ${[['sec-require-uppercase','Require uppercase letter'],['sec-require-number','Require number'],['sec-require-special-char','Require special character'],['sec-prevent-reuse','Prevent password reuse (last 10)']].map(([pid,l])=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0;border-bottom:1px solid var(--border)">
            <span>${l}</span><input id="${pid}" type="checkbox" checked>
          </div>`).join('')}
      </div>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">IP Allowlist</h3>
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem">Restrict login to these IP ranges. Leave empty to allow all.</p>
      <div id="ip-list" class="flex flex-col gap-2">
        ${['192.168.1.0/24','10.0.0.0/8','203.0.113.42'].map(ip=>`
          <div style="display:flex;align-items:center;gap:0.5rem">
            <input class="form-input" value="${ip}" style="flex:1;font-family:var(--font-mono)">
            <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">${icon('x')}</button>
          </div>`).join('')}
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onclick="addIpRow()">${icon('plus')} Add IP Range</button>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Session Management</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div class="form-group"><label class="form-label">Session Timeout (minutes)</label><input id="sec-session-timeout" class="form-input" type="number" value="480" style="width:120px"></div>
        <div class="form-group"><label class="form-label">Max Concurrent Sessions</label><input id="sec-max-sessions" class="form-input" type="number" value="5" style="width:120px"></div>
      </div>
      <button class="btn btn-danger btn-sm" onclick="revokeAllSessionsLive()">${icon('x-circle')} Revoke All Active Sessions</button>
    </div>
  </div>
</div>
`);

function addIpRow() {
  const list = document.getElementById('ip-list');
  if(list) list.insertAdjacentHTML('beforeend',`<div style="display:flex;align-items:center;gap:0.5rem"><input class="form-input" placeholder="192.168.x.x/24" style="flex:1;font-family:var(--font-mono)"><button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">${icon('x')}</button></div>`);
}

async function revokeAllSessionsLive() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  confirm('Revoke all visible active sessions? You may need to sign in again on other devices.', async () => {
    try {
      const data = await hanmakApi('/user-sessions/?page_size=100');
      const sessions = (data.results || data).filter(session => !session.revoked_at);
      await Promise.all(sessions.map(session => hanmakApi(`/user-sessions/${session.id}/revoke/`, {method:'POST', body: JSON.stringify({})})));
      showToast(`Revoked ${sessions.length} active session(s)`, 'success');
    } catch (error) {
      showToast(`Session revoke failed: ${error.message}`, 'error', 7000);
    }
  });
}

// ==================== SETTINGS NOTIFICATIONS ====================
const _notifEvents = [
  ['Envelope sent to me for signing','envelope.sent_for_signing',true,true],
  ['Envelope completed','envelope.completed',true,true],
  ['Approval request received','approval.requested',true,true],
  ['Approval decision made','approval.decided',true,false],
  ['Envelope overdue / expiring soon','envelope.expiring',true,true],
  ['Signature declined','signature.declined',true,true],
  ['New user joined org','user.joined',false,true],
  ['API key created/revoked','api_key.changed',false,true],
  ['Webhook failure','webhook.failed',false,true],
  ['System alerts','system.alert',true,false],
];

registerPage('settings-notifications', () => `
<div class="page-header">
  <div><h1 class="page-title">Notifications</h1><p class="page-subtitle">Configure alert preferences and digest emails</p></div>
  <button class="btn btn-primary" onclick="saveNotificationSettings()">${icon('save')} Save</button>
</div>
<div class="settings-layout">
  ${settingsNav('notifications')}
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Event Notifications</h3>
      <table style="width:100%;font-size:0.875rem;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:0.5rem 0;color:var(--text-muted);font-weight:600">Event</th>
          <th style="text-align:center;padding:0.5rem;color:var(--text-muted);font-weight:600">Email</th>
          <th style="text-align:center;padding:0.5rem;color:var(--text-muted);font-weight:600">In-App</th>
          <th style="text-align:center;padding:0.5rem;color:var(--text-muted);font-weight:600">Digest</th>
        </tr></thead>
        <tbody>
          ${_notifEvents.map(([label,eventType,defEmail,defInApp])=>`
            <tr data-event="${eventType}" style="border-bottom:1px solid var(--border)">
              <td style="padding:0.625rem 0">${label}</td>
              <td style="text-align:center"><input type="checkbox" data-channel="email" ${defEmail?'checked':''}></td>
              <td style="text-align:center"><input type="checkbox" data-channel="in_app" ${defInApp?'checked':''}></td>
              <td style="text-align:center"><input type="checkbox" data-channel="digest"></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>
    <div class="card" style="padding:1.5rem">
      <h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem">Digest Email</h3>
      <div class="form-group"><label class="form-label">Frequency</label>
        <select id="notif-digest-frequency" class="form-input"><option value="daily_8am">Daily at 8am</option><option value="weekly_monday">Weekly on Monday</option><option value="disabled">Disabled</option></select>
      </div>
      <div class="flex flex-col gap-2" style="font-size:0.875rem">
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.25rem 0"><input type="checkbox" id="digest-include-pending-signatures" checked> Include pending signatures</label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.25rem 0"><input type="checkbox" id="digest-include-overdue" checked> Include overdue items</label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.25rem 0"><input type="checkbox" id="digest-include-completed" checked> Include completed this period</label>
        <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;padding:0.25rem 0"><input type="checkbox" id="digest-include-team-activity"> Include team activity summary</label>
      </div>
    </div>
  </div>
</div>
`);

let _notifPrefIds = {};

async function settings_notifications_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  _notifPrefIds = {};
  try {
    const profile = await hanmakApi('/profiles/me/');
    const prefs = profile.preferences || {};
    settingsSetSelect('notif-digest-frequency', prefs.digest_frequency || 'daily_8am');
    const setCb = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };
    setCb('digest-include-pending-signatures', prefs.digest_include_pending_signatures ?? true);
    setCb('digest-include-overdue', prefs.digest_include_overdue ?? true);
    setCb('digest-include-completed', prefs.digest_include_completed ?? true);
    setCb('digest-include-team-activity', prefs.digest_include_team_activity ?? false);
    const data = await hanmakApi('/notification-preferences/');
    const notifPrefs = data.results || data;
    notifPrefs.forEach(pref => {
      _notifPrefIds[pref.event_type] = pref.id;
      const row = document.querySelector(`tr[data-event="${pref.event_type}"]`);
      if (!row) return;
      const emailCb = row.querySelector('[data-channel="email"]');
      const inAppCb = row.querySelector('[data-channel="in_app"]');
      const digestCb = row.querySelector('[data-channel="digest"]');
      if (emailCb) emailCb.checked = pref.email_enabled;
      if (inAppCb) inAppCb.checked = pref.in_app_enabled;
      if (digestCb) digestCb.checked = pref.digest_enabled;
    });
  } catch (error) {
    showToast(`Could not load notification preferences: ${error.message}`, 'error');
  }
}

async function saveNotificationSettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const rows = document.querySelectorAll('tr[data-event]');
    const saves = Array.from(rows).map(async row => {
      const eventType = row.dataset.event;
      const payload = {
        event_type: eventType,
        email_enabled: row.querySelector('[data-channel="email"]')?.checked ?? true,
        in_app_enabled: row.querySelector('[data-channel="in_app"]')?.checked ?? true,
        digest_enabled: row.querySelector('[data-channel="digest"]')?.checked ?? false,
      };
      const existingId = _notifPrefIds[eventType];
      if (existingId) {
        const updated = await hanmakApi(`/notification-preferences/${existingId}/`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        return updated;
      } else {
        const created = await hanmakApi('/notification-preferences/', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        _notifPrefIds[eventType] = created.id;
        return created;
      }
    });
    await Promise.all(saves);
    const profile = await hanmakApi('/profiles/me/');
    await hanmakApi('/profiles/me/', {
      method: 'PATCH',
      body: JSON.stringify({
        preferences: {
          ...(profile.preferences || {}),
          digest_frequency: document.getElementById('notif-digest-frequency')?.value || 'daily_8am',
          digest_include_pending_signatures: document.getElementById('digest-include-pending-signatures')?.checked ?? true,
          digest_include_overdue: document.getElementById('digest-include-overdue')?.checked ?? true,
          digest_include_completed: document.getElementById('digest-include-completed')?.checked ?? true,
          digest_include_team_activity: document.getElementById('digest-include-team-activity')?.checked ?? false,
        },
      }),
    });
    showToast('Notification preferences saved', 'success');
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}

function settingsNav(active) {
  const items = [
    ['settings-general','General','settings'],
    ['settings-branding','Branding','image'],
    ['settings-email','Email','mail'],
    ['settings-storage','Storage','database'],
    ['settings-security','Security','shield'],
    ['settings-notifications','Notifications','bell'],
    ['sso','SSO / Identity','lock'],
  ];
  const activeId = items.some(([id]) => id === active) ? active : `settings-${active}`;
  return `<nav class="card" style="padding:1rem;height:fit-content;min-width:200px">
    ${items.map(([id,label,ic])=>`
      <div style="padding:0.5rem 0.625rem;border-radius:6px;cursor:pointer;font-size:0.875rem;display:flex;align-items:center;gap:0.5rem;margin-bottom:2px;background:${id===activeId?'var(--primary-light)':''};color:${id===activeId?'var(--primary)':'var(--text-secondary)'}"
        onclick="navigate('${id}');this.parentElement.querySelectorAll('div').forEach(d=>{d.style.background='';d.style.color='var(--text-secondary)';});this.style.background='var(--primary-light)';this.style.color='var(--primary)'">
        ${icon(ic)} ${label}
      </div>`).join('')}
  </nav>`;
}

// ==================== SETTINGS LIVE WIRING ====================

function settingsSetSelect(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  for (const opt of el.options) {
    if (opt.value === value || opt.text === value) { el.value = opt.value; return; }
  }
}

function settingsSetCheckbox(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.checked = !!value;
  if (el.nextElementSibling) el.nextElementSibling.style.background = el.checked ? 'var(--primary)' : 'var(--border)';
}

async function settings_general_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/general-settings/?organization=${orgId}`);
    const s = (data.results || data)[0];
    if (!s) return;
    const appName = document.getElementById('gs-app-name');
    if (appName) appName.value = s.application_name || 'HanMak';
    const email = document.getElementById('gs-support-email');
    if (email) email.value = s.support_email || '';
    settingsSetSelect('gs-locale', s.default_locale || 'en-US');
    settingsSetSelect('gs-date-format', s.date_format || 'YYYY-MM-DD');
    settingsSetSelect('gs-time-format', s.time_format || '12h');
    settingsSetSelect('gs-timezone', s.default_timezone || 'UTC');
    const expiration = document.getElementById('gs-envelope-expiration-days');
    if (expiration) expiration.value = s.default_envelope_expiration_days || 30;
    settingsSetSelect('gs-reminder-schedule', s.default_reminder_schedule || 'every_2_days');
    settingsSetSelect('gs-signing-order', s.default_signing_order || 'sequential');
    settingsSetCheckbox('gs-require-email-verification', s.require_email_verification ?? true);
    settingsSetCheckbox('gs-allow-mobile-signing', s.allow_mobile_signing ?? true);
    settingsSetCheckbox('gs-enable-completion-certificates', s.enable_completion_certificates ?? true);
    settingsSetCheckbox('gs-send-audit-trail', s.send_audit_trail_on_completion ?? true);
    settingsSetCheckbox('gs-allow-bulk-send', s.allow_bulk_send ?? true);
  } catch (error) {
    showToast(`Could not load general settings: ${error.message}`, 'error');
  }
}

async function saveGeneralSettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    await hanmakApi('/general-settings/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        application_name: document.getElementById('gs-app-name')?.value.trim() || 'HanMak',
        support_email: document.getElementById('gs-support-email')?.value.trim() || '',
        default_locale: document.getElementById('gs-locale')?.value || 'en-US',
        date_format: document.getElementById('gs-date-format')?.value || 'YYYY-MM-DD',
        time_format: document.getElementById('gs-time-format')?.value || '12h',
        default_timezone: document.getElementById('gs-timezone')?.value || 'UTC',
        default_envelope_expiration_days: Number(document.getElementById('gs-envelope-expiration-days')?.value || 30),
        default_reminder_schedule: document.getElementById('gs-reminder-schedule')?.value || 'every_2_days',
        default_signing_order: document.getElementById('gs-signing-order')?.value || 'sequential',
        require_email_verification: document.getElementById('gs-require-email-verification')?.checked ?? true,
        allow_mobile_signing: document.getElementById('gs-allow-mobile-signing')?.checked ?? true,
        enable_completion_certificates: document.getElementById('gs-enable-completion-certificates')?.checked ?? true,
        send_audit_trail_on_completion: document.getElementById('gs-send-audit-trail')?.checked ?? true,
        allow_bulk_send: document.getElementById('gs-allow-bulk-send')?.checked ?? true,
      }),
    });
    showToast('General settings saved', 'success');
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}

async function settings_email_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/email-settings/?organization=${orgId}`);
    const s = (data.results || data)[0];
    if (!s) return;
    const fromEmail = document.getElementById('em-from-email');
    if (fromEmail) fromEmail.value = s.from_email || '';
    const replyTo = document.getElementById('em-reply-to');
    if (replyTo) replyTo.value = s.reply_to_email || '';
    if (s.bounce_provider) {
      const providerEl = document.querySelector(`[data-provider="${s.bounce_provider}"]`);
      if (providerEl) {
        document.querySelectorAll('[data-provider]').forEach(e => { e.style.border = '2px solid var(--border)'; e.style.background = ''; });
        providerEl.style.border = '2px solid var(--primary)';
        providerEl.style.background = 'var(--primary-light,#dbeafe)';
        const hidden = document.getElementById('em-provider');
        if (hidden) hidden.value = s.bounce_provider;
      }
    }
    await loadEmailTemplatesLive(orgId);
  } catch (error) {
    showToast(`Could not load email settings: ${error.message}`, 'error');
  }
}

async function saveEmailSettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    await hanmakApi('/email-settings/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        from_email: document.getElementById('em-from-email')?.value.trim() || 'no-reply@hanmak.local',
        reply_to_email: document.getElementById('em-reply-to')?.value.trim() || '',
        bounce_provider: document.getElementById('em-provider')?.value || '',
      }),
    });
    showToast('Email settings saved', 'success');
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}

async function settings_storage_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const [data, healthSummary] = await Promise.all([
      hanmakApi(`/storage-settings/?organization=${orgId}`),
      hanmakApi('/health-checks/summary/').catch(() => ({metrics: {}})),
    ]);
    const s = (data.results || data)[0];
    if (!s) {
      renderStorageRuntime({backend: 'local', encrypt_at_rest: true}, healthSummary.metrics || {});
      return;
    }
    const bucketEl = document.getElementById('st-bucket');
    if (bucketEl) bucketEl.value = s.bucket_name || '';
    const endpointEl = document.getElementById('st-endpoint');
    if (endpointEl) endpointEl.value = s.endpoint_url || '';
    if (s.backend) {
      const backendEl = document.querySelector(`[data-backend="${s.backend}"]`);
      if (backendEl) {
        document.querySelectorAll('[data-backend]').forEach(e => { e.style.border = '2px solid var(--border)'; e.style.background = ''; });
        backendEl.style.border = '2px solid var(--primary)';
        backendEl.style.background = 'var(--primary-light,#dbeafe)';
        const hidden = document.getElementById('st-backend');
        if (hidden) hidden.value = s.backend;
      }
    }
    renderStorageRuntime(s, healthSummary.metrics || {});
  } catch (error) {
    showToast(`Could not load storage settings: ${error.message}`, 'error');
    renderStorageRuntime({backend: 'local', encrypt_at_rest: true}, {});
  }
}

async function saveStorageSettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    await hanmakApi('/storage-settings/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        backend: document.getElementById('st-backend')?.value || 'local',
        bucket_name: document.getElementById('st-bucket')?.value.trim() || '',
        endpoint_url: document.getElementById('st-endpoint')?.value.trim() || '',
        encrypt_at_rest: true,
      }),
    });
    showToast('Storage settings saved', 'success');
    settings_storage_init();
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}

async function settings_security_init() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const data = await hanmakApi(`/security-settings/?organization=${orgId}`);
    const s = (data.results || data)[0];
    if (!s) return;
    const setBool = (id, val) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = Boolean(val);
      const knob = el.nextElementSibling;
      if (knob && knob.style) knob.style.background = el.checked ? 'var(--primary)' : 'var(--border)';
    };
    setBool('sec-require-mfa', s.require_mfa);
    setBool('sec-require-admin-mfa', s.require_admin_mfa);
    setBool('sec-allow-sms-mfa', s.allow_sms_mfa);
    setBool('sec-allow-totp-mfa', s.allow_totp_mfa !== false);
    setBool('sec-allow-passkeys', s.allow_passkeys !== false);
    setBool('sec-remember-device', s.remember_device !== false);
    setBool('sec-require-uppercase', s.require_uppercase !== false);
    setBool('sec-require-number', s.require_number !== false);
    setBool('sec-require-special-char', s.require_special_char !== false);
    setBool('sec-prevent-reuse', s.prevent_password_reuse !== false);
    const setNum = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || el.value; };
    setNum('sec-password-min-length', s.password_min_length);
    setNum('sec-password-expiry', s.password_expiry_days);
    setNum('sec-session-timeout', s.session_timeout_minutes);
    setNum('sec-max-sessions', s.max_concurrent_sessions);
    const ipList = document.getElementById('ip-list');
    if (ipList && Array.isArray(s.allowed_ip_ranges) && s.allowed_ip_ranges.length) {
      ipList.innerHTML = s.allowed_ip_ranges.map(ip => `
        <div style="display:flex;align-items:center;gap:0.5rem">
          <input class="form-input" value="${escapeHtml ? escapeHtml(ip) : ip}" style="flex:1;font-family:var(--font-mono)">
          <button class="btn btn-ghost btn-sm" onclick="this.parentElement.remove()">${icon('x')}</button>
        </div>`).join('');
    }
  } catch (error) {
    showToast(`Could not load security settings: ${error.message}`, 'error');
  }
}

async function saveSecuritySettings() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const orgId = await firstOrganizationId();
    const ipInputs = document.querySelectorAll('#ip-list input[type="text"], #ip-list input:not([type])');
    const allowedIpRanges = Array.from(ipInputs).map(el => el.value.trim()).filter(Boolean);
    await hanmakApi('/security-settings/', {
      method: 'POST',
      body: JSON.stringify({
        organization: orgId,
        require_mfa: document.getElementById('sec-require-mfa')?.checked || false,
        require_admin_mfa: document.getElementById('sec-require-admin-mfa')?.checked || false,
        allow_sms_mfa: document.getElementById('sec-allow-sms-mfa')?.checked || false,
        allow_totp_mfa: document.getElementById('sec-allow-totp-mfa')?.checked !== false,
        allow_passkeys: document.getElementById('sec-allow-passkeys')?.checked !== false,
        remember_device: document.getElementById('sec-remember-device')?.checked !== false,
        require_uppercase: document.getElementById('sec-require-uppercase')?.checked !== false,
        require_number: document.getElementById('sec-require-number')?.checked !== false,
        require_special_char: document.getElementById('sec-require-special-char')?.checked !== false,
        prevent_password_reuse: document.getElementById('sec-prevent-reuse')?.checked !== false,
        password_min_length: Number(document.getElementById('sec-password-min-length')?.value) || 8,
        password_expiry_days: Number(document.getElementById('sec-password-expiry')?.value) || 90,
        session_timeout_minutes: Number(document.getElementById('sec-session-timeout')?.value) || 480,
        max_concurrent_sessions: Number(document.getElementById('sec-max-sessions')?.value) || 5,
        allowed_ip_ranges: allowedIpRanges,
      }),
    });
    showToast('Security settings saved', 'success');
  } catch (error) {
    showToast(`Save failed: ${error.message}`, 'error');
  }
}
