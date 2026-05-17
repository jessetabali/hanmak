registerPage('setup', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Account Setup</h1>
    <p class="page-subtitle">Accept an invitation or finish first-time password setup</p>
  </div>
</div>
<div style="max-width:560px">
  <div class="card" style="padding:1.5rem">
    <div id="setup-status" class="alert alert-warning">${icon('clock')} Checking setup link...</div>
    <div class="form-group"><label class="form-label">Email / User</label><input id="setup-user" class="form-input" disabled></div>
    <div class="form-group"><label class="form-label">Username</label><input id="setup-username" class="form-input" placeholder="Only needed for invite acceptance"></div>
    <div class="form-group"><label class="form-label">New Password</label><input id="setup-password" class="form-input" type="password" placeholder="At least 8 characters"></div>
    <div class="form-group"><label class="form-label">Confirm Password</label><input id="setup-password-confirm" class="form-input" type="password"></div>
    <button class="btn btn-primary" onclick="completeSetupLive()">${icon('check')} Complete Setup</button>
  </div>
</div>
`);

let setupMode = '';
let setupToken = '';
let setupLoginUsername = '';

async function setup_init() {
  const params = new URLSearchParams(location.search);
  setupToken = params.get('token') || params.get('setup_token') || params.get('invite_token') || '';
  setupMode = params.get('invite_token') ? 'invite' : 'recovery';
  if (!setupToken) {
    document.getElementById('setup-status').innerHTML = `${icon('alert-circle')} No setup token was provided.`;
    return;
  }
  try {
    const endpoint = setupMode === 'invite' ? '/invitations/inspect_token/' : '/account-recovery/inspect_token/';
    const data = await hanmakApi(endpoint, {method: 'POST', body: JSON.stringify({token: setupToken})});
    const label = setupMode === 'invite'
      ? `${data.full_name || data.email} invited to ${data.organization_name}`
      : `${data.user.display_name || data.user.email || data.user.username}`;
    setupLoginUsername = setupMode === 'invite' ? (data.email || '').split('@')[0] : (data.user.username || data.user.email || '');
    const usernameInput = document.getElementById('setup-username');
    if (usernameInput && setupMode === 'invite' && !usernameInput.value) usernameInput.value = setupLoginUsername;
    if (usernameInput && setupMode !== 'invite') {
      usernameInput.value = setupLoginUsername;
      usernameInput.disabled = true;
    }
    document.getElementById('setup-user').value = label;
    document.getElementById('setup-status').className = 'alert alert-success';
    document.getElementById('setup-status').innerHTML = `${icon('check')} Setup link is valid.`;
  } catch (error) {
    document.getElementById('setup-status').className = 'alert alert-danger';
    document.getElementById('setup-status').innerHTML = `${icon('alert-circle')} ${escapeHtml(error.message)}`;
  }
}

async function completeSetupLive() {
  const password = document.getElementById('setup-password').value;
  const confirm = document.getElementById('setup-password-confirm').value;
  if (password.length < 8) return showToast('Password must be at least 8 characters', 'error');
  if (password !== confirm) return showToast('Passwords do not match', 'error');
  const endpoint = setupMode === 'invite' ? '/invitations/accept/' : '/account-recovery/complete/';
  const payload = {token: setupToken, password, username: document.getElementById('setup-username').value.trim()};
  try {
    const result = await hanmakApi(endpoint, {method: 'POST', body: JSON.stringify(payload)});
    const username = result.user?.username || payload.username || setupLoginUsername;
    if (username) {
      try {
        await hanmakLogin(username, password);
        showToast('Account setup complete. You are now signed in.', 'success', 7000);
      } catch (loginError) {
        showToast('Account setup complete. Please sign in with your new password.', 'success', 7000);
        navigate('login');
        return;
      }
    } else {
      showToast('Account setup complete. Please sign in with your new password.', 'success', 7000);
      navigate('login');
      return;
    }
    navigate('dashboard');
  } catch (error) {
    showToast(`Setup failed: ${error.message}`, 'error', 7000);
  }
}
