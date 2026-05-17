registerPage('profile', () => `
<div class="page-header">
  <div><h1 class="page-title">My Profile</h1><p class="page-subtitle">Personal account settings and preferences</p></div>
  <button class="btn btn-primary" onclick="saveProfilePersonalInfo()">${icon('save')} Save Changes</button>
</div>

<div style="display:grid;grid-template-columns:280px 1fr;gap:1.5rem;align-items:start">

  <!-- Left: avatar + quick stats -->
  <div class="flex flex-col gap-4">
    <div class="card" style="padding:1.5rem;text-align:center">
      <div style="position:relative;display:inline-block;margin-bottom:1rem">
        <div id="profile-card-avatar" style="width:88px;height:88px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:2rem;margin:0 auto">HM</div>
      </div>
      <div id="profile-card-name" style="font-weight:700;font-size:1.125rem">Loading profile...</div>
      <div id="profile-card-email" style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:0.75rem">Connected account</div>
      <span class="badge badge-danger">Admin</span>
      <div style="border-top:1px solid var(--border);margin:1rem 0"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;text-align:center;font-size:0.8125rem">
        ${[['Envelopes Sent','—'],['Signatures','—'],['Approvals','—'],['Member Since','—']].map(([l,v])=>`
          <div style="padding:0.5rem;background:var(--bg-secondary);border-radius:6px">
            <div style="font-weight:700">${v}</div>
            <div style="font-size:0.7rem;color:var(--text-muted)">${l}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="card" style="padding:1.25rem">
      <div style="font-weight:600;margin-bottom:0.875rem;font-size:0.875rem">Quick Actions</div>
      <div class="flex flex-col gap-2">
        ${[['key','Change Password'],['lock','Two-Factor Auth'],['bell','Notification Prefs'],['user','Switch Organization'],['log-out','Sign Out']].map(([ic,lbl])=>`
          <button class="btn btn-ghost" style="justify-content:flex-start;font-size:0.875rem" onclick="${profileQuickActionHandler(lbl)}">${icon(ic)} ${lbl}</button>`).join('')}
      </div>
    </div>
  </div>

  <!-- Right: detail tabs -->
  <div class="card">
    <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border)">
      <div class="tabs">
        <button class="tab active" onclick="switchProfileTab('info',this)">Personal Info</button>
        <button class="tab" onclick="switchProfileTab('security',this)">Security</button>
        <button class="tab" onclick="switchProfileTab('notifications',this)">Notifications</button>
        <button class="tab" onclick="switchProfileTab('sessions',this)">Active Sessions</button>
        <button class="tab" onclick="switchProfileTab('activity',this)">Activity</button>
      </div>
    </div>

    <!-- Personal Info -->
    <div id="profile-info" style="padding:1.5rem">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div class="form-group"><label class="form-label">Display Name</label><input id="profile-display-name" class="form-input" placeholder="Loading…"></div>
        <div class="form-group"><label class="form-label">Job Title</label><input id="profile-title" class="form-input" placeholder="Loading…"></div>
        <div class="form-group"><label class="form-label">Email Address</label><input id="profile-email-display" class="form-input" type="email" disabled style="opacity:0.7"></div>
        <div class="form-group"><label class="form-label">Phone (for SMS MFA)</label><input id="profile-phone" class="form-input" type="tel" placeholder="Loading…"></div>
        <div class="form-group"><label class="form-label">Timezone</label>
          <select id="profile-timezone" class="form-input">
            ${['UTC','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Singapore','Asia/Tokyo','Australia/Sydney'].map(tz=>`<option value="${tz}">${tz}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label class="form-label">Language</label>
          <select id="profile-locale" class="form-input">
            ${[['en','English'],['es','Spanish'],['fr','French'],['de','German'],['ja','Japanese']].map(([v,l])=>`<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-top:0.25rem"><label class="form-label">Signature Name</label>
        <input id="profile-signature-name" class="form-input" placeholder="Name as it appears on signatures">
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:0.5rem">
        <button class="btn btn-primary" onclick="saveProfilePersonalInfo()">${icon('save')} Save Personal Info</button>
      </div>
    </div>

    <!-- Security (hidden) -->
    <div id="profile-security" style="display:none;padding:1.5rem">
      <div class="flex flex-col gap-4">
        <div style="padding:1rem;border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
            <div style="font-weight:600">Password</div>
            <button class="btn btn-ghost btn-sm" onclick="openPasswordChange()">${icon('edit')} Change</button>
          </div>
          <div id="profile-auth-state" style="font-size:0.8125rem;color:var(--text-muted)">Loading account security state...</div>
        </div>
        <div style="padding:1rem;border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
            <div>
              <div style="font-weight:600">Two-Factor Authentication</div>
              <div id="profile-totp-status" style="font-size:0.8125rem;color:var(--text-muted);margin-top:2px">Loading…</div>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="openMFASetup()">${icon('settings')} Manage</button>
          </div>
          <div style="font-size:0.8125rem;color:var(--text-muted)">Backup codes: 6 of 10 remaining</div>
        </div>
        <div style="padding:1rem;border:1px solid var(--border);border-radius:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.25rem">
            <div>
              <div style="font-weight:600">Passkeys / Hardware Keys</div>
              <div id="profile-passkey-summary" style="font-size:0.8125rem;color:var(--text-muted);margin-top:2px">Loading registered passkeys...</div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" onclick="testPasskeyAuthentication()">${icon('play')} Test</button>
              <button class="btn btn-primary btn-sm" onclick="registerPasskeyFromBrowser()">${icon('plus')} Add Passkey</button>
            </div>
          </div>
          <div id="profile-passkey-list" style="margin-top:0.75rem"></div>
        </div>
        <div style="padding:1rem;border:1px solid var(--border);border-radius:8px">
          <div style="font-weight:600;margin-bottom:0.5rem">Login History</div>
          <div id="profile-login-history" style="font-size:0.8125rem;color:var(--text-muted)">Loading recent sessions...</div>
        </div>
      </div>
    </div>

    <!-- Notifications (hidden) -->
    <div id="profile-notifications" style="display:none;padding:1.5rem">
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1.25rem">Choose how and when you receive notifications.</p>
      <div id="profile-notif-body">
        <div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading preferences…</div>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:1rem">
        <button class="btn btn-primary" onclick="saveProfileNotifications()">${icon('save')} Save Preferences</button>
      </div>
    </div>

    <!-- Sessions (hidden) -->
    <div id="profile-sessions" style="display:none;padding:1.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem">
        <div id="profile-sessions-count" style="font-size:0.875rem;color:var(--text-muted)">Loading…</div>
        <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="revokeAllOtherSessions()">${icon('x-circle')} Revoke All Others</button>
      </div>
      <div id="profile-sessions-list" class="flex flex-col gap-3">
        <div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading sessions…</div>
      </div>
    </div>

    <!-- Activity (hidden) -->
    <div id="profile-activity" style="display:none;padding:1.5rem">
      <div style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1rem">Your recent actions in HanMak</div>
      <div id="profile-activity-list" style="font-family:var(--font-mono)">
        <div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading activity…</div>
      </div>
    </div>
  </div>
</div>
`);

function profileQuickActionHandler(label) {
  return {
    'Sign Out': 'confirmSignOut()',
    'Two-Factor Auth': "showProfileTab('security')",
    'Change Password': 'openPasswordChange()',
    'Notification Prefs': "showProfileTab('notifications')",
    'Switch Organization': "showOrgSwitcher()",
  }[label] || `showToast('${label}', 'info')`;
}

function switchProfileTab(tab, el) {
  ['info','security','notifications','sessions','activity'].forEach(t => {
    const el = document.getElementById('profile-'+t);
    if(el) el.style.display = 'none';
  });
  document.querySelectorAll('#profile + div .tab, .tabs .tab').forEach(t => t.classList.remove('active'));
  const target = document.getElementById('profile-'+tab);
  if(target) target.style.display = 'block';
  el.classList.add('active');
}

function openPasswordChange() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('key')} Change Password</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Current Password</label><input id="pw-old" class="form-input" type="password" placeholder="Enter current password"></div>
      <div class="form-group"><label class="form-label">New Password</label><input id="pw-new" class="form-input" type="password" placeholder="Min 12 characters"></div>
      <div class="form-group"><label class="form-label">Confirm New Password</label><input id="pw-confirm" class="form-input" type="password" placeholder="Repeat new password"></div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Must be at least 12 characters.</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="_submitPasswordChange()">${icon('check')} Update Password</button>
    </div>
  `);
}

async function _submitPasswordChange() {
  const old_password = document.getElementById('pw-old')?.value || '';
  const new_password = document.getElementById('pw-new')?.value || '';
  const confirm_password = document.getElementById('pw-confirm')?.value || '';
  if (!old_password || !new_password || !confirm_password) return showToast('All fields are required.', 'error');
  if (new_password !== confirm_password) return showToast('New passwords do not match.', 'error');
  if (new_password.length < 12) return showToast('New password must be at least 12 characters.', 'error');
  try {
    await hanmakApi('/profiles/change_password/', {
      method: 'POST',
      body: JSON.stringify({old_password, new_password, confirm_password}),
    });
    closeModal();
    showToast('Password changed successfully. Please log in again on other devices.', 'success', 6000);
  } catch (err) {
    showToast(err.message || 'Password change failed.', 'error');
  }
}

async function openMFASetup() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">${icon('lock')} Two-Factor Authentication</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body" id="mfa-modal-body"><div style="text-align:center;padding:1.5rem;color:var(--text-muted)">Loading…</div></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button></div>
  `);
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const data = await hanmakApi('/mfa-devices/');
    const devices = data.results || data;
    const totpDevice = devices.find(d => d.method === 'totp' && d.is_confirmed);
    const body = document.getElementById('mfa-modal-body');
    if (!body) return;
    if (totpDevice) {
      body.innerHTML = `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.875rem;background:var(--bg-secondary);border-radius:8px;margin-bottom:1.25rem">
          <span style="color:var(--success);font-size:1.25rem">✓</span>
          <div>
            <div style="font-weight:600;font-size:0.875rem">TOTP Authenticator App is active</div>
            <div style="font-size:0.8rem;color:var(--text-muted)">${totpDevice.name} · Confirmed ${apiDate ? apiDate(totpDevice.last_used_at || totpDevice.created_at) : ''}</div>
          </div>
        </div>
        <div class="flex flex-col gap-2">
          <button class="btn btn-ghost" style="justify-content:flex-start" onclick="beginTotpSetupLive(true)">${icon('refresh')} Reconfigure Authenticator</button>
          <button class="btn btn-ghost" style="justify-content:flex-start" onclick="closeModal();registerPasskeyFromBrowser()">${icon('plus')} Add Hardware Key (FIDO2)</button>
          <button class="btn btn-ghost" style="justify-content:flex-start;color:var(--danger)" onclick="disableTotpLive(${totpDevice.id})">${icon('x-circle')} Disable TOTP</button>
        </div>`;
    } else {
      body.innerHTML = `
        <div style="padding:0.875rem;background:var(--bg-secondary);border-radius:8px;margin-bottom:1.25rem;font-size:0.875rem;color:var(--text-muted)">
          ${icon('shield')} No authenticator app is set up yet. Add one for an extra layer of login security.
        </div>
        <button class="btn btn-primary w-full" style="justify-content:center" onclick="beginTotpSetupLive(false)">${icon('plus')} Set Up Authenticator App</button>`;
    }
  } catch (error) {
    const body = document.getElementById('mfa-modal-body');
    if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml ? escapeHtml(error.message) : error.message}</div>`;
  }
}

async function beginTotpSetupLive(isReconfigure = false) {
  const body = document.getElementById('mfa-modal-body');
  if (!body) return;
  body.innerHTML = `<div style="text-align:center;padding:1rem;color:var(--text-muted)">${icon('clock')} Generating setup code…</div>`;
  try {
    const data = await hanmakApi('/mfa-devices/totp_setup_begin/', {method: 'POST', body: JSON.stringify({})});
    body.innerHTML = `
      <p style="font-size:0.875rem;margin-bottom:1rem">
        ${isReconfigure ? 'Scan the new QR code with your authenticator app to reconfigure.' : 'Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code to verify.'}
      </p>
      <div style="text-align:center;margin-bottom:1rem">
        ${data.qr_data_url
          ? `<img src="${data.qr_data_url}" alt="TOTP QR code" style="border-radius:8px;width:180px;height:180px;image-rendering:pixelated">`
          : `<div style="font-size:0.8125rem;color:var(--text-muted);padding:1rem 0">Use the manual key below to add this account in your authenticator app.</div>`}
      </div>
      <div style="background:var(--bg-secondary);border-radius:8px;padding:0.75rem;margin-bottom:1rem">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem">Manual entry key</div>
        <div style="font-family:var(--font-mono);font-size:0.875rem;letter-spacing:0.1em;word-break:break-all">${data.secret}</div>
      </div>
      <input type="hidden" id="totp-setup-device-id" value="${data.device_id}">
      <div class="form-group">
        <label class="form-label">Verification Code</label>
        <div class="flex gap-2">
          <input id="totp-verify-code" class="form-input" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000"
            style="font-family:var(--font-mono);letter-spacing:0.3em;font-size:1.125rem;text-align:center" autofocus
            onkeydown="if(event.key==='Enter')confirmTotpSetupLive()">
          <button class="btn btn-primary" onclick="confirmTotpSetupLive()">${icon('check')} Verify</button>
        </div>
      </div>`;
  } catch (error) {
    if (body) body.innerHTML = `<div class="alert alert-danger">${escapeHtml ? escapeHtml(error.message) : error.message}</div>`;
  }
}

async function confirmTotpSetupLive() {
  const code = document.getElementById('totp-verify-code')?.value.trim();
  const deviceId = document.getElementById('totp-setup-device-id')?.value;
  if (!code || code.length !== 6 || !/^\d+$/.test(code)) return showToast('Enter the 6-digit code from your authenticator app', 'error');
  try {
    await hanmakApi('/mfa-devices/totp_setup_confirm/', {
      method: 'POST',
      body: JSON.stringify({device_id: Number(deviceId), code}),
    });
    closeModal();
    showToast('Authenticator app set up successfully', 'success');
    loadProfileSecurityState();
  } catch (error) {
    showToast(error.message, 'error', 7000);
  }
}

async function disableTotpLive(deviceId) {
  confirm('Disable TOTP? You will no longer be required to enter an authenticator code at login.', async () => {
    try {
      await hanmakApi(`/mfa-devices/${deviceId}/`, {method: 'DELETE'});
      closeModal();
      showToast('TOTP authenticator disabled', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}

function profile_init() {
  loadProfilePersonalInfo();
  loadProfileSecurityState();
  loadProfilePasskeys();
  loadProfileNotifications();
  loadProfileSessions();
  loadProfileLoginHistory();
  loadProfileActivity();
}

async function loadProfileSecurityState() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const profile = await hanmakApi('/profiles/me/');
    const name = profile.display_name || profile.username || 'Current User';
    const cardName = document.getElementById('profile-card-name');
    const cardEmail = document.getElementById('profile-card-email');
    const cardAvatar = document.getElementById('profile-card-avatar');
    const authState = document.getElementById('profile-auth-state');
    if (cardName) cardName.textContent = name;
    if (cardEmail) cardEmail.textContent = profile.email || profile.username || '';
    if (cardAvatar) cardAvatar.textContent = avatarInitials(name);
    if (authState) {
      const locked = profile.locked_until && new Date(profile.locked_until) > new Date();
      authState.innerHTML = `${locked ? 'Temporarily locked' : 'Active'} · Auth version ${profile.auth_version || 0} · Failed logins ${profile.failed_login_count || 0}${profile.last_failed_login_at ? ` · Last failed ${apiDate(profile.last_failed_login_at)}` : ''}`;
      authState.style.color = locked ? 'var(--danger)' : 'var(--text-muted)';
    }
  } catch (error) {
    const authState = document.getElementById('profile-auth-state');
    if (authState) authState.textContent = `Could not load security state: ${error.message}`;
  }
}

async function loadProfileLoginHistory() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const container = document.getElementById('profile-login-history');
  if (!container) return;
  try {
    const data = await hanmakApi('/profiles/activity/');
    const sessions = data.sessions || [];
    if (!sessions.length) {
      container.innerHTML = '<div style="padding:0.5rem 0">No login sessions recorded yet.</div>';
      return;
    }
    container.innerHTML = sessions.slice(0, 5).map(session => {
      const revoked = !!session.revoked_at;
      const time = session.last_seen_at || session.created_at;
      const device = [session.user_agent || 'Unknown device', session.ip_address || 'No IP recorded'].filter(Boolean).join(' · ');
      return `
        <div style="display:flex;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem">
          <span style="color:var(--${revoked ? 'danger' : 'success'});margin-top:1px">${revoked ? 'x' : '✓'}</span>
          <div style="flex:1">
            <div>${time ? apiDate(time) : 'No timestamp'}</div>
            <div style="color:var(--text-muted);font-size:0.75rem">${escapeHtml(device)}</div>
          </div>
          ${revoked ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge badge-success">Active</span>'}
        </div>
      `;
    }).join('');
  } catch (error) {
    container.innerHTML = `<div class="alert alert-danger">Could not load login history: ${error.message}</div>`;
  }
}

async function loadProfilePersonalInfo() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  try {
    const profile = await hanmakApi('/profiles/me/');
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('profile-display-name', profile.display_name);
    set('profile-title', profile.title);
    set('profile-email-display', profile.email || profile.username);
    set('profile-phone', profile.phone);
    set('profile-signature-name', profile.signature_name);
    const tzEl = document.getElementById('profile-timezone');
    if (tzEl && profile.timezone) {
      const opt = Array.from(tzEl.options).find(o => o.value === profile.timezone);
      if (opt) tzEl.value = profile.timezone;
    }
    const localeEl = document.getElementById('profile-locale');
    if (localeEl && profile.locale) {
      const opt = Array.from(localeEl.options).find(o => o.value === profile.locale);
      if (opt) localeEl.value = profile.locale;
    }
  } catch (err) {
    showToast('Could not load profile info: ' + err.message, 'error');
  }
}

async function saveProfilePersonalInfo() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const get = id => document.getElementById(id)?.value || '';
  const payload = {
    display_name: get('profile-display-name'),
    title: get('profile-title'),
    phone: get('profile-phone'),
    timezone: get('profile-timezone'),
    locale: get('profile-locale'),
    signature_name: get('profile-signature-name'),
  };
  try {
    await hanmakApi('/profiles/me/', {method: 'PATCH', body: JSON.stringify(payload)});
    showToast('Profile updated', 'success');
    loadProfileSecurityState();
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  }
}

let _profileNotifPrefIds = {};

async function loadProfileNotifications() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const container = document.getElementById('profile-notif-body');
  if (!container) return;
  try {
    const data = await hanmakApi('/notification-preferences/');
    const prefs = data.results || data;
    _profileNotifPrefIds = {};
    prefs.forEach(p => { _profileNotifPrefIds[p.event_type] = p.id; });

    const defaultEvents = [
      ['envelope.signing_requested', 'Document sent to me for signing'],
      ['envelope.completed', 'Document I sent was completed'],
      ['approval.needed', 'Approval needed from me'],
      ['approval.decided', 'Approval decision made on my request'],
      ['envelope.expiring', 'Document overdue / expiring soon'],
      ['task.completed', 'Team member completed a task'],
      ['envelope.commented', 'New comment on envelope'],
    ];
    const prefMap = {};
    prefs.forEach(p => { prefMap[p.event_type] = p; });

    container.innerHTML = `
      <table style="width:100%;font-size:0.875rem;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:0.5rem 0;color:var(--text-muted)">Event</th>
          <th style="text-align:center;padding:0.5rem;color:var(--text-muted)">Email</th>
          <th style="text-align:center;padding:0.5rem;color:var(--text-muted)">In-App</th>
        </tr></thead>
        <tbody>
          ${defaultEvents.map(([evType, label]) => {
            const p = prefMap[evType] || {};
            const email = p.email_enabled !== undefined ? p.email_enabled : true;
            const inApp = p.in_app_enabled !== undefined ? p.in_app_enabled : true;
            return `<tr style="border-bottom:1px solid var(--border)">
              <td style="padding:0.625rem 0">${label}</td>
              <td style="text-align:center"><input type="checkbox" data-pref-event="${evType}" data-pref-field="email" ${email ? 'checked' : ''}></td>
              <td style="text-align:center"><input type="checkbox" data-pref-event="${evType}" data-pref-field="inapp" ${inApp ? 'checked' : ''}></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  } catch (err) {
    if (container) container.innerHTML = `<div class="alert alert-danger">Could not load preferences: ${err.message}</div>`;
  }
}

async function saveProfileNotifications() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const rows = document.querySelectorAll('#profile-notif-body input[data-pref-event]');
  const byEvent = {};
  rows.forEach(cb => {
    const et = cb.dataset.prefEvent;
    if (!byEvent[et]) byEvent[et] = {};
    if (cb.dataset.prefField === 'email') byEvent[et].email_enabled = cb.checked;
    else byEvent[et].in_app_enabled = cb.checked;
  });
  try {
    await Promise.all(Object.entries(byEvent).map(([evType, fields]) => {
      const prefId = _profileNotifPrefIds[evType];
      if (prefId) {
        return hanmakApi(`/notification-preferences/${prefId}/`, {method: 'PATCH', body: JSON.stringify(fields)});
      }
      return hanmakApi('/notification-preferences/', {method: 'POST', body: JSON.stringify({event_type: evType, ...fields})});
    }));
    showToast('Notification preferences saved', 'success');
    loadProfileNotifications();
  } catch (err) {
    showToast(err.message || 'Save failed', 'error');
  }
}

async function loadProfileSessions() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const list = document.getElementById('profile-sessions-list');
  const countEl = document.getElementById('profile-sessions-count');
  if (!list) return;
  try {
    const data = await hanmakApi('/user-sessions/');
    const sessions = data.results || data;
    if (countEl) countEl.textContent = `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`;
    if (!sessions.length) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem">No active sessions found.</div>';
      return;
    }
    list.innerHTML = sessions.map(s => {
      const isCurrent = s.is_current || false;
      const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : (s.created_at ? new Date(s.created_at).toLocaleString() : '—');
      const device = [s.user_agent_device, s.user_agent_browser, s.user_agent_os].filter(Boolean).join(' / ') || s.user_agent || 'Unknown device';
      const ipLine = s.ip_address ? s.ip_address : '';
      const revokedStyle = s.revoked_at ? 'opacity:0.5;' : '';
      return `<div style="${revokedStyle}padding:1rem;border:1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'};border-radius:8px;background:${isCurrent ? 'var(--primary-light,#dbeafe)' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:600;font-size:0.875rem">${escapeHtml ? escapeHtml(device) : device}</div>
            ${ipLine ? `<div style="font-size:0.8rem;color:var(--text-muted);margin-top:2px">${ipLine}</div>` : ''}
            <div style="font-size:0.8rem;color:var(--text-muted)">${isCurrent ? 'Current session' : 'Last active ' + lastSeen}</div>
            ${s.revoked_at ? '<span class="badge badge-danger" style="margin-top:4px">Revoked</span>' : ''}
          </div>
          ${isCurrent ? '<span class="badge badge-primary">This device</span>' :
            s.revoked_at ? '' :
            `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="revokeSession(${s.id})">${icon('x')} Revoke</button>`}
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    if (list) list.innerHTML = `<div class="alert alert-danger">Could not load sessions: ${err.message}</div>`;
  }
}

function revokeSession(sessionId) {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title">Revoke Session</div><button class="modal-close" onclick="closeModal()">${icon('x', 16)}</button></div>
      <div class="modal-body"><p style="font-size:14px;color:var(--text-primary);line-height:1.6">Revoke this session? That device will be signed out immediately.</p></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="closeModal();_doRevokeSession(${sessionId})">${icon('x-circle')} Revoke</button>
      </div>
    </div>
  `);
}

async function _doRevokeSession(sessionId) {
  try {
    await hanmakApi(`/user-sessions/${sessionId}/revoke/`, {method: 'POST', body: JSON.stringify({})});
    showToast('Session revoked', 'success');
    loadProfileSessions();
  } catch (err) {
    showToast(err.message || 'Revoke failed', 'error');
  }
}

function revokeAllOtherSessions() {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header"><div class="modal-title">Revoke All Other Sessions</div><button class="modal-close" onclick="closeModal()">${icon('x', 16)}</button></div>
      <div class="modal-body"><p style="font-size:14px;color:var(--text-primary);line-height:1.6">All sessions except this device will be signed out immediately.</p></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="closeModal();_doRevokeAllOtherSessions()">${icon('x-circle')} Revoke All Others</button>
      </div>
    </div>
  `);
}

async function _doRevokeAllOtherSessions() {
  try {
    const data = await hanmakApi('/user-sessions/');
    const sessions = data.results || data;
    const others = sessions.filter(s => !s.is_current && !s.revoked_at);
    await Promise.all(others.map(s => hanmakApi(`/user-sessions/${s.id}/revoke/`, {method: 'POST', body: JSON.stringify({})})));
    showToast(`Revoked ${others.length} other session${others.length !== 1 ? 's' : ''}`, 'success');
    loadProfileSessions();
  } catch (err) {
    showToast(err.message || 'Revoke all failed', 'error');
  }
}

async function loadProfileActivity() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const container = document.getElementById('profile-activity-list');
  if (!container) return;
  try {
    const data = await hanmakApi('/profiles/activity/');
    const events = data.audit_events || [];
    if (!events.length) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.875rem;padding:1rem 0">No recent activity.</div>';
      return;
    }
    const severityColor = {info:'primary', success:'success', warning:'warning', error:'danger', critical:'danger'};
    container.innerHTML = events.map(e => {
      const time = e.created_at ? new Date(e.created_at).toLocaleString() : '—';
      const color = severityColor[e.severity] || 'primary';
      return `<div style="display:grid;grid-template-columns:160px 200px 1fr;gap:0.5rem;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.75rem;align-items:start">
        <span style="color:var(--text-muted)">${time}</span>
        <span style="color:var(--${color})">${e.event_type || '—'}</span>
        <span>${escapeHtml ? escapeHtml(e.message || '') : (e.message || '')}</span>
      </div>`;
    }).join('');
  } catch (err) {
    if (container) container.innerHTML = `<div class="alert alert-danger">Could not load activity: ${err.message}</div>`;
  }
}

function passkeyBase64UrlToArrayBuffer(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function passkeyArrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function passkeyCredentialToJSON(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: passkeyArrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {},
  };
  ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].forEach(key => {
    if (response[key]) json.response[key] = passkeyArrayBufferToBase64Url(response[key]);
  });
  return json;
}

function passkeyCreationOptions(options) {
  const publicKey = {...options.publicKey};
  publicKey.challenge = passkeyBase64UrlToArrayBuffer(publicKey.challenge);
  publicKey.user = {...publicKey.user, id: passkeyBase64UrlToArrayBuffer(publicKey.user.id)};
  publicKey.excludeCredentials = (publicKey.excludeCredentials || []).map(credential => ({
    ...credential,
    id: passkeyBase64UrlToArrayBuffer(credential.id),
  }));
  return {publicKey};
}

function passkeyRequestOptions(options) {
  const publicKey = {...options.publicKey};
  publicKey.challenge = passkeyBase64UrlToArrayBuffer(publicKey.challenge);
  publicKey.allowCredentials = (publicKey.allowCredentials || []).map(credential => ({
    ...credential,
    id: passkeyBase64UrlToArrayBuffer(credential.id),
  }));
  return {publicKey};
}

async function loadProfilePasskeys() {
  if (typeof ensureHanmakApi !== 'function' || !await ensureHanmakApi()) return;
  const summary = document.getElementById('profile-passkey-summary');
  const list = document.getElementById('profile-passkey-list');
  if (!summary || !list) return;
  try {
    const data = await hanmakApi('/mfa-devices/');
    const allDevices = data.results || data;
    const totpStatus = document.getElementById('profile-totp-status');
    if (totpStatus) {
      const totpDevice = allDevices.find(d => d.method === 'totp' && d.is_confirmed);
      if (totpDevice) {
        totpStatus.innerHTML = `<span style="color:var(--success)">✓ Enabled — ${escapeHtml ? escapeHtml(totpDevice.name) : totpDevice.name}</span>`;
      } else {
        totpStatus.innerHTML = '<span style="color:var(--text-muted)">Not configured</span>';
      }
    }
    const devices = allDevices.filter(device => device.method === 'webauthn');
    summary.textContent = devices.length
      ? `${devices.length} passkey${devices.length === 1 ? '' : 's'} registered`
      : 'No passkeys registered yet';
    list.innerHTML = devices.length ? devices.map(device => `
      <div style="display:flex;justify-content:space-between;gap:0.75rem;align-items:center;padding:0.5rem 0;border-top:1px solid var(--border);font-size:0.8125rem">
        <div>
          <div style="font-weight:700">${device.name || 'Passkey'}</div>
          <div style="color:var(--text-muted)">Created ${apiDate(device.created_at)} · Last used ${apiDate(device.last_used_at)} · Counter ${device.sign_count || 0}</div>
        </div>
        <span class="badge badge-${device.is_confirmed ? 'success' : 'warning'}">${device.is_confirmed ? 'Confirmed' : 'Pending'}</span>
      </div>
    `).join('') : '<div style="font-size:0.8rem;color:var(--text-muted);padding-top:0.5rem">Use Add Passkey to register this browser or a hardware key.</div>';
  } catch (error) {
    summary.textContent = 'Could not load passkeys';
    list.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
  }
}

async function registerPasskeyFromBrowser() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return showToast('This browser does not support WebAuthn/passkeys.', 'error', 7000);
  }
  if (!await ensureHanmakApi()) return;
  try {
    showToast('Opening browser passkey prompt...', 'info');
    const begin = await hanmakApi('/mfa-devices/passkey_begin_registration/', {method: 'POST', body: JSON.stringify({})});
    const credential = await navigator.credentials.create(passkeyCreationOptions(begin.options));
    const name = prompt('Name this passkey', `${navigator.platform || 'Browser'} Passkey`) || 'Passkey';
    await hanmakApi('/mfa-devices/passkey_finish_registration/', {
      method: 'POST',
      body: JSON.stringify({
        challenge: begin.challenge,
        credential: passkeyCredentialToJSON(credential),
        name,
      }),
    });
    showToast('Passkey registered and verified', 'success');
    loadProfilePasskeys();
  } catch (error) {
    showToast(`Passkey registration failed: ${error.message}`, 'error', 8000);
  }
}

async function testPasskeyAuthentication() {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return showToast('This browser does not support WebAuthn/passkeys.', 'error', 7000);
  }
  if (!await ensureHanmakApi()) return;
  try {
    showToast('Opening passkey authentication prompt...', 'info');
    const begin = await hanmakApi('/mfa-devices/passkey_begin_authentication/', {method: 'POST', body: JSON.stringify({})});
    const credential = await navigator.credentials.get(passkeyRequestOptions(begin.options));
    const result = await hanmakApi('/mfa-devices/passkey_finish_authentication/', {
      method: 'POST',
      body: JSON.stringify({
        challenge: begin.challenge,
        credential: passkeyCredentialToJSON(credential),
      }),
    });
    showToast(`Passkey authentication verified${result.device ? ` for device #${result.device}` : ''}`, 'success', 6000);
    loadProfilePasskeys();
  } catch (error) {
    showToast(`Passkey authentication failed: ${error.message}`, 'error', 8000);
  }
}

function confirmSignOut() {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">Sign Out</h3><button class="modal-close" onclick="closeModal()">✕</button></div>
    <div class="modal-body"><p style="color:var(--text-secondary)">Are you sure you want to sign out of HanMak?</p></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-danger" onclick="signOutLive()">${icon('log-out')} Sign Out</button>
    </div>
  `);
}

function signOutLive() {
  if (typeof hanmakLogout === 'function') hanmakLogout();
  closeModal();
  if (typeof refreshAuthButton === 'function') refreshAuthButton();
  showToast('Signed out successfully', 'success');
  navigate('login');
}
