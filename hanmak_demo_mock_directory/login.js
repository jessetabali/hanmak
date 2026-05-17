registerPage('login', () => `
<div style="min-height:calc(100vh - 60px);display:grid;place-items:center;padding:2rem;background:var(--bg-secondary)">
  <div style="width:min(100%,440px)">
    <div style="text-align:center;margin-bottom:2rem">
      <div class="sidebar-logo-icon" style="width:56px;height:56px;margin:0 auto 0.75rem">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <path d="M14 2v6h6"/><line x1="9" y1="15" x2="15" y2="15"/><line x1="9" y1="11" x2="11" y2="11"/>
        </svg>
      </div>
      <div style="font-weight:900;font-size:1.5rem;letter-spacing:-0.02em">HanMak</div>
      <div style="font-size:0.875rem;color:var(--text-muted);margin-top:0.25rem">Enterprise Document Signing Platform</div>
    </div>
    <div class="card" style="padding:1.75rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:0.25rem">Sign in</h2>
      <p style="font-size:0.8125rem;color:var(--text-muted);margin-bottom:1.25rem">Use your workspace credentials below.</p>
      <div id="login-status" class="alert alert-info" style="display:none;margin-bottom:1rem"></div>
      <div class="alert alert-info" style="margin-bottom:1rem;font-size:0.8125rem;line-height:1.55">
        ${icon('shield')} Production sign-in supports password, MFA/passkeys, temporary lockout protection, and secure recovery links.
      </div>
      <div id="login-pwd-form">
        <form onsubmit="loginSubmitLive(event)">
          <div class="form-group">
            <label class="form-label">Username or Email</label>
            <input id="login-username" class="form-input" autocomplete="username" placeholder="admin" autofocus>
          </div>
          <div class="form-group">
            <label class="form-label">Password</label>
            <input id="login-password" class="form-input" type="password" autocomplete="current-password" placeholder="••••••••">
          </div>
          <button id="login-submit" class="btn btn-primary w-full" style="justify-content:center;margin-top:0.25rem" type="submit">${icon('chevron-right')} Sign In</button>
        </form>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-top:0.875rem">
          <div style="border:1px solid var(--border);border-radius:8px;padding:0.55rem;text-align:center;font-size:0.72rem;color:var(--text-muted)">${icon('shield')} MFA ready</div>
          <div style="border:1px solid var(--border);border-radius:8px;padding:0.55rem;text-align:center;font-size:0.72rem;color:var(--text-muted)">${icon('key')} Passkeys</div>
          <div style="border:1px solid var(--border);border-radius:8px;padding:0.55rem;text-align:center;font-size:0.72rem;color:var(--text-muted)">${icon('lock')} Lockout</div>
        </div>
        <div style="display:flex;align-items:center;gap:0.75rem;margin:1rem 0">
          <div style="flex:1;height:1px;background:var(--border)"></div>
          <span style="font-size:0.75rem;color:var(--text-muted)">or</span>
          <div style="flex:1;height:1px;background:var(--border)"></div>
        </div>
        <button class="btn btn-ghost w-full" style="justify-content:center" onclick="beginPasskeyLoginLive()">${icon('shield')} Sign in with Passkey</button>
        <div style="font-size:0.75rem;color:var(--text-muted);line-height:1.5;margin-top:0.5rem">
          Lockout resets automatically after the security window. Recovery links revoke active sessions after password creation.
        </div>
        <div style="display:flex;justify-content:space-between;gap:0.5rem;margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);font-size:0.8125rem">
          ${window.HANMAK_FRONTEND_CONFIG?.allowDemoAutoLogin ? `<button class="btn btn-ghost btn-sm" onclick="loginUseDemoCredentials()">${icon('key')} Fill Demo</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick="openForgotPasswordModal()">${icon('refresh')} Forgot Password</button>
          <button class="btn btn-ghost btn-sm" onclick="navigate('setup')">${icon('user-plus')} Setup / Invite</button>
        </div>
      </div>
      <div id="login-mfa-step" style="display:none"></div>
    </div>
    <p style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:1.25rem">
      Protected by HanMak enterprise security &nbsp;·&nbsp; <a href="#" onclick="navigate('system-health');return false" style="color:var(--text-muted)">System status</a>
    </p>
  </div>
</div>
`);

let _hanmakPendingTokens = null;

function login_init() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'none';
  const main = document.querySelector('.main-content');
  if (main) { main.style.width = '100%'; main.style.marginLeft = '0'; }
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.paddingLeft = '1.5rem';
  const status = document.getElementById('login-status');
  if (localStorage.getItem('HANMAK_ACCESS_TOKEN') && status) {
    status.style.display = 'block';
    status.className = 'alert alert-success';
    status.innerHTML = `${icon('check')} You are already signed in. <a href="#" onclick="navigate('dashboard');return false">Go to Dashboard</a>`;
  }
}

async function beginPasskeyLoginLive() {
  const username = document.getElementById('login-username').value.trim();
  if (!username) return showToast('Enter your username or email first', 'error');
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return showToast('This browser does not support WebAuthn/passkeys.', 'error', 7000);
  }
  try {
    const data = await hanmakApi('/mfa-devices/public_passkey_begin/', {method: 'POST', body: JSON.stringify({username})});
    showToast('Opening passkey prompt...', 'info');
    const credential = await navigator.credentials.get(loginPasskeyRequestOptions(data.options));
    const result = await hanmakApi('/mfa-devices/public_passkey_finish/', {
      method: 'POST',
      body: JSON.stringify({
        challenge: data.challenge,
        credential: loginPasskeyCredentialToJSON(credential),
      }),
    });
    localStorage.setItem('HANMAK_ACCESS_TOKEN', result.access);
    localStorage.setItem('HANMAK_REFRESH_TOKEN', result.refresh);
    showToast('Signed in with passkey', 'success');
    _restoreShell();
    navigate('dashboard');
  } catch (error) {
    showToast(error.message, 'error', 7000);
  }
}

function loginPasskeyBase64UrlToArrayBuffer(value) {
  const base64 = String(value).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(value).length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function loginPasskeyArrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function loginPasskeyRequestOptions(options) {
  const publicKey = {...options.publicKey};
  publicKey.challenge = loginPasskeyBase64UrlToArrayBuffer(publicKey.challenge);
  publicKey.allowCredentials = (publicKey.allowCredentials || []).map(credential => ({
    ...credential,
    id: loginPasskeyBase64UrlToArrayBuffer(credential.id),
  }));
  return {publicKey};
}

function loginPasskeyCredentialToJSON(credential) {
  const response = credential.response;
  const json = {
    id: credential.id,
    rawId: loginPasskeyArrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {},
  };
  ['clientDataJSON', 'authenticatorData', 'signature', 'userHandle'].forEach(key => {
    if (response[key]) json.response[key] = loginPasskeyArrayBufferToBase64Url(response[key]);
  });
  return json;
}

function loginUseDemoCredentials() {
  document.getElementById('login-username').value = 'admin';
  document.getElementById('login-password').value = 'admin123';
}

async function loginSubmitLive(event) {
  event.preventDefault();
  const button = document.getElementById('login-submit');
  const status = document.getElementById('login-status');
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  if (!username || !password) return showToast('Username and password are required', 'error');
  try {
    button.disabled = true;
    status.style.display = 'block';
    status.className = 'alert alert-info';
    status.innerHTML = `${icon('clock')} Signing in…`;
    const data = await hanmakApi('/auth/login/', {
      method: 'POST',
      body: JSON.stringify({username, password}),
    });
    if (data.mfa_required) {
      _hanmakPendingTokens = {access: data.access, refresh: data.refresh, username};
      status.className = 'alert alert-info';
      status.innerHTML = `${icon('shield')} Password verified — complete your second factor to continue.`;
      loginShowMfaChallenge(data.mfa_methods || [], username);
    } else {
      localStorage.setItem('HANMAK_ACCESS_TOKEN', data.access);
      localStorage.setItem('HANMAK_REFRESH_TOKEN', data.refresh);
      status.className = 'alert alert-success';
      status.innerHTML = `${icon('check')} Signed in successfully.`;
      showToast('Signed in', 'success');
      _restoreShell();
      navigate('dashboard');
    }
  } catch (error) {
    status.style.display = 'block';
    status.className = 'alert alert-danger';
    status.innerHTML = `${icon('alert-circle')} ${loginFormatAuthError(error)}`;
  } finally {
    button.disabled = false;
  }
}

function loginFormatAuthError(error) {
  const message = String(error?.message || 'Sign in failed.');
  const escaped = escapeHtml(message);
  if (/locked|lockout|too many/i.test(message)) {
    return `${escaped}<div style="margin-top:0.5rem;font-size:0.75rem;color:var(--text-muted);line-height:1.5">For security, password attempts are paused temporarily. You can wait, use a registered passkey, or request a recovery link.</div><div style="margin-top:0.5rem"><button class="btn btn-ghost btn-sm" onclick="openForgotPasswordModal()">${icon('refresh')} Start password recovery</button></div>`;
  }
  if (/invalid|credential|password/i.test(message)) {
    return `${escaped}<div style="margin-top:0.375rem;font-size:0.75rem;color:var(--text-muted);line-height:1.5">Check your username and password, use a registered passkey, or start recovery before the temporary lockout threshold is reached.</div>`;
  }
  if (/mfa|factor|totp|passkey|webauthn/i.test(message)) {
    return `${escaped}<div style="margin-top:0.375rem;font-size:0.75rem;color:var(--text-muted);line-height:1.5">Use your authenticator code or passkey. If you lost your second factor, ask an administrator to verify your identity and reset MFA.</div>`;
  }
  return escaped;
}

function loginShowMfaChallenge(methods, username) {
  const pwdForm = document.getElementById('login-pwd-form');
  const mfaStep = document.getElementById('login-mfa-step');
  if (!pwdForm || !mfaStep) return;
  pwdForm.style.display = 'none';
  mfaStep.style.display = 'block';
  const safeUser = (typeof escapeHtml === 'function') ? escapeHtml(username) : username;
  mfaStep.innerHTML = `
    <div style="margin-bottom:1.25rem">
      <div style="font-size:0.875rem;font-weight:600;margin-bottom:0.25rem">Two-factor verification</div>
      <div style="font-size:0.8125rem;color:var(--text-muted)">Signed in as <strong>${safeUser}</strong>. Verify with your second factor.</div>
    </div>
    ${methods.includes('totp') ? `
      <div style="margin-bottom:1rem">
        <label class="form-label">Authenticator Code</label>
        <div class="flex gap-2">
          <input id="mfa-totp-code" class="form-input" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000"
            style="font-family:var(--font-mono);letter-spacing:0.3em;font-size:1.1rem;text-align:center" autofocus>
          <button class="btn btn-primary" onclick="loginVerifyTotp('${safeUser}')">${icon('check')} Verify</button>
        </div>
        <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.375rem">Enter the 6-digit code from your authenticator app.</div>
      </div>` : ''}
    ${methods.includes('webauthn') ? `
      <button class="btn btn-ghost w-full" style="justify-content:center;margin-bottom:0.75rem" onclick="loginMfaPasskey('${safeUser}')">${icon('shield')} Use Passkey Instead</button>` : ''}
    ${!methods.includes('totp') && !methods.includes('webauthn') ? `
      <div class="alert alert-warning" style="font-size:0.8125rem">No supported MFA method found. Contact your administrator.</div>` : ''}
    <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:0.75rem;color:var(--text-muted);font-size:0.8125rem" onclick="loginCancelMfa()">
      ${icon('x')} Use a different account
    </button>
  `;
}

async function loginVerifyTotp(username) {
  const code = document.getElementById('mfa-totp-code')?.value.trim();
  if (!code || code.length !== 6) return showToast('Enter your 6-digit authenticator code', 'error');
  try {
    await hanmakApi('/mfa-devices/verify_totp_login/', {
      method: 'POST',
      body: JSON.stringify({username, code}),
    });
    loginCompleteMfa();
  } catch (error) {
    showToast(error.message, 'error', 6000);
  }
}

async function loginMfaPasskey(username) {
  if (!window.PublicKeyCredential || !navigator.credentials) {
    return showToast('This browser does not support WebAuthn/passkeys.', 'error', 7000);
  }
  try {
    const data = await hanmakApi('/mfa-devices/public_passkey_begin/', {method: 'POST', body: JSON.stringify({username})});
    showToast('Opening passkey prompt…', 'info');
    const credential = await navigator.credentials.get(loginPasskeyRequestOptions(data.options));
    await hanmakApi('/mfa-devices/public_passkey_finish/', {
      method: 'POST',
      body: JSON.stringify({challenge: data.challenge, credential: loginPasskeyCredentialToJSON(credential)}),
    });
    loginCompleteMfa();
  } catch (error) {
    showToast(error.message, 'error', 7000);
  }
}

function loginCompleteMfa() {
  if (!_hanmakPendingTokens) return;
  localStorage.setItem('HANMAK_ACCESS_TOKEN', _hanmakPendingTokens.access);
  localStorage.setItem('HANMAK_REFRESH_TOKEN', _hanmakPendingTokens.refresh);
  _hanmakPendingTokens = null;
  const status = document.getElementById('login-status');
  if (status) {
    status.className = 'alert alert-success';
    status.innerHTML = `${icon('check')} Signed in with MFA.`;
  }
  showToast('Signed in', 'success');
  _restoreShell();
  navigate('dashboard');
}

function loginCancelMfa() {
  _hanmakPendingTokens = null;
  const mfaStep = document.getElementById('login-mfa-step');
  const pwdForm = document.getElementById('login-pwd-form');
  if (mfaStep) mfaStep.style.display = 'none';
  if (pwdForm) pwdForm.style.display = 'block';
  const status = document.getElementById('login-status');
  if (status) status.style.display = 'none';
}

function _restoreShell() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = '';
  const main = document.querySelector('.main-content');
  if (main) { main.style.width = ''; main.style.marginLeft = ''; }
  const topbar = document.querySelector('.topbar');
  if (topbar) topbar.style.paddingLeft = '';
}

function logoutLive() {
  hanmakLogout();
  showToast('Signed out', 'success');
  navigate('login');
}

function openForgotPasswordModal() {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header"><div><div class="modal-title">Recover Account</div><div class="modal-subtitle">Secure password reset link</div></div><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Account Email</label><input id="forgot-password-email" class="form-input" type="email" placeholder="you@example.com"></div>
        <div class="alert alert-info" style="font-size:0.8125rem;line-height:1.55;margin-bottom:0.75rem">
          ${icon('lock')} If the account exists, HanMak queues a time-limited recovery email. For safety, the response never reveals whether an address is registered.
        </div>
        <div id="forgot-password-result" style="font-size:0.8125rem;color:var(--text-muted)">Recovery links expire after one hour and can be cancelled by an administrator.</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="requestPasswordResetLive()">${icon('send')} Send Link</button>
      </div>
    </div>
  `);
}

async function requestPasswordResetLive() {
  const email = document.getElementById('forgot-password-email').value.trim();
  const result = document.getElementById('forgot-password-result');
  if (!email) return showToast('Email is required', 'error');
  try {
    result.textContent = 'Sending...';
    const data = await hanmakApi('/account-recovery/request_reset/', {method: 'POST', body: JSON.stringify({email})});
    result.innerHTML = `${escapeHtml(data.detail || 'Check your email for a setup link.')}<div style="margin-top:0.5rem;color:var(--text-muted)">Next: open the email, create a new password, then sign in with MFA/passkey if required.</div>`;
    showToast('Password reset request accepted', 'success');
  } catch (error) {
    result.textContent = error.message;
    showToast(error.message, 'error');
  }
}
