// ==================== ADMIN LIVE HELPERS ====================
const ADMIN_PERMISSION_RESOURCES = ['Envelopes', 'Templates', 'Signatures', 'Approvals', 'Users', 'Teams', 'Roles', 'Billing', 'API Keys', 'Webhooks', 'Audit Trail', 'Settings'];
const ADMIN_PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'admin'];

function adminRoleColor(role) {
  return {super_admin: 'danger', admin: 'danger', manager: 'warning', signer: 'primary', viewer: 'secondary'}[String(role || '').toLowerCase()] || 'secondary';
}

function adminStatusBadge(active, pending = false) {
  if (pending) return '<span class="badge badge-warning">pending</span>';
  return `<span class="badge badge-${active ? 'success' : 'danger'}">${active ? 'active' : 'suspended'}</span>`;
}

function adminDisplayName(user) {
  return user.display_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || `User #${user.id}`;
}

async function adminLoadAll() {
  if (!await ensureHanmakApi()) throw new Error('Connect the API first.');
  const [users, memberships, teams, roles, invitations, organizations, domains, sessions, mfaDevices] = await Promise.all([
    hanmakApi('/users/'),
    hanmakApi('/memberships/'),
    hanmakApi('/teams/'),
    hanmakApi('/roles/'),
    hanmakApi('/invitations/'),
    hanmakApi('/organizations/'),
    hanmakApi('/organization-domains/'),
    hanmakApi('/user-sessions/'),
    hanmakApi('/mfa-devices/'),
  ]);
  return {
    users: users.results || users,
    memberships: memberships.results || memberships,
    teams: teams.results || teams,
    roles: roles.results || roles,
    invitations: invitations.results || invitations,
    organizations: organizations.results || organizations,
    domains: domains.results || domains,
    sessions: sessions.results || sessions,
    mfaDevices: mfaDevices.results || mfaDevices,
  };
}

function adminTeamOptions(teams, selected = '') {
  return `<option value="">No team</option>${teams.map(team => `<option value="${team.id}" ${String(selected) === String(team.id) ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}`;
}

function adminRoleOptions(selected = 'signer') {
  return ['super_admin', 'admin', 'manager', 'signer', 'viewer'].map(role => `<option value="${role}" ${selected === role ? 'selected' : ''}>${role === 'super_admin' ? 'Super Admin' : titleCaseStatus(role)}</option>`).join('');
}

function adminCustomRoleOptions(roles, selected = '') {
  return `<option value="">No custom role</option>${roles.map(role => `<option value="${role.id}" ${String(selected || '') === String(role.id) ? 'selected' : ''}>${escapeHtml(role.name)}</option>`).join('')}`;
}

// ==================== USERS ====================
registerPage('users', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Users</h1>
    <p class="page-subtitle">Live user accounts, invitations, roles, teams, MFA, SSO, and admin actions</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="openImpersonationQueueLive()">${icon('user')} Impersonation Requests</button>
    <button class="btn btn-ghost" onclick="exportUsersLive()">${icon('download')} Export</button>
    <button class="btn btn-ghost" onclick="createUser()">${icon('user-plus')} Create User</button>
    <button class="btn btn-primary" onclick="inviteUser()">${icon('user-plus')} Invite User</button>
  </div>
</div>
<div id="admin-users-stats" class="stats-grid" style="--cols:4;margin-bottom:1.5rem"></div>
<div class="card">
  <div class="table-toolbar">
    <div class="flex gap-2">
      <input id="admin-user-search" class="form-input" placeholder="Search users..." style="width:260px" oninput="users_init()">
      <select id="admin-user-role-filter" class="form-input" style="width:150px" onchange="users_init()"><option value="">All Roles</option>${adminRoleOptions('')}</select>
      <select id="admin-user-status-filter" class="form-input" style="width:150px" onchange="users_init()"><option value="">All Status</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select>
    </div>
  </div>
  <table class="table">
    <thead><tr><th style="width:40px"><input type="checkbox"></th><th>User</th><th>Role</th><th>Team</th><th>Status</th><th>Last Active</th><th>MFA</th><th>SSO</th><th></th></tr></thead>
    <tbody id="admin-users-table"><tr><td colspan="9">Loading...</td></tr></tbody>
  </table>
</div>
`);

async function users_init() {
  try {
    const state = await adminLoadAll();
    const query = document.getElementById('admin-user-search')?.value.toLowerCase() || '';
    const roleFilter = document.getElementById('admin-user-role-filter')?.value || '';
    const statusFilter = document.getElementById('admin-user-status-filter')?.value || '';
    const membershipByUser = new Map(state.memberships.map(item => [item.user, item]));
    const sessionsByUser = new Map(state.sessions.map(item => [item.user, item]));
    const mfaByUser = new Set(state.mfaDevices.filter(device => device.is_confirmed).map(device => device.user));
    const userRows = state.users.map(user => ({type: 'user', user, membership: membershipByUser.get(user.id), session: sessionsByUser.get(user.id), mfa: mfaByUser.has(user.id)}));
    const inviteRows = state.invitations.filter(invitation => invitation.status === 'pending').map(invitation => ({type: 'invite', invitation}));
    const rows = [...userRows, ...inviteRows].filter(row => {
      const text = row.type === 'user'
        ? `${adminDisplayName(row.user)} ${row.user.email} ${row.membership?.role || ''} ${row.membership?.custom_role_name || ''} ${row.membership?.team_name || ''}`.toLowerCase()
        : `${row.invitation.full_name} ${row.invitation.email} ${row.invitation.role} ${row.invitation.custom_role_name || ''}`.toLowerCase();
      const role = row.type === 'user' ? row.membership?.role : row.invitation.role;
      const statusValue = row.type === 'invite' ? 'pending' : row.user.is_active ? 'active' : 'suspended';
      return (!query || text.includes(query)) && (!roleFilter || role === roleFilter) && (!statusFilter || statusValue === statusFilter);
    });
    if (!document.getElementById('admin-users-stats')) return;
    document.getElementById('admin-users-stats').innerHTML = [
      ['Total Users', state.users.length, 'var(--primary)'],
      ['Active', state.users.filter(user => user.is_active).length, 'var(--success)'],
      ['Pending Invite', state.invitations.filter(invitation => invitation.status === 'pending').length, 'var(--warning)'],
      ['Suspended', state.users.filter(user => !user.is_active).length, 'var(--danger)'],
    ].map(([label, value, color]) => `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div></div>`).join('');
    document.getElementById('admin-users-table').innerHTML = rows.map(row => row.type === 'user' ? userRow(row) : invitationRow(row.invitation)).join('') || '<tr><td colspan="9"><div class="empty-state"><div class="empty-state-title">No matching users</div></div></td></tr>';
  } catch (error) {
    if (!document.getElementById('admin-users-stats')) return;
    showToast(`Users failed: ${error.message}`, 'error', 7000);
  }
}

function userRow({user, membership, session, mfa}) {
  const name = adminDisplayName(user);
  const role = membership?.role || 'viewer';
  const roleLabel = membership?.custom_role_name || titleCaseStatus(role);
  return `<tr onclick="openUserDrawer(${user.id})" style="cursor:pointer">
    <td onclick="event.stopPropagation()"><input type="checkbox"></td>
    <td><div style="display:flex;align-items:center;gap:0.625rem">${avatar(name,36)}<div><div style="font-weight:600;font-size:0.875rem">${escapeHtml(name)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(user.email || user.username)}</div></div></div></td>
    <td><span class="badge badge-${adminRoleColor(role)}">${escapeHtml(roleLabel)}</span></td>
    <td style="font-size:0.8125rem">${escapeHtml(membership?.team_name || '-')}</td>
    <td>${adminStatusBadge(user.is_active)}</td>
    <td style="font-size:0.8rem;color:var(--text-muted)">${session?.last_seen_at ? apiDate(session.last_seen_at) : '-'}</td>
    <td><span style="font-size:0.8rem;color:${mfa ? 'var(--success)' : 'var(--danger)'}">${mfa ? 'On' : 'Off'}</span></td>
    <td><span style="font-size:0.8rem;color:${user.sso_enabled ? 'var(--success)' : 'var(--text-muted)'}">${user.sso_enabled ? 'Yes' : '-'}</span></td>
    <td onclick="event.stopPropagation()"><div class="flex gap-1">
      <button class="btn btn-ghost btn-sm" onclick="openUserDrawer(${user.id})">${icon('eye')}</button>
      <button class="btn btn-ghost btn-sm" title="Request impersonation access (audited)" onclick="openImpersonationModal(${user.id},'${escapeHtml(adminDisplayName(user))}')">${icon('user')}</button>
      <button class="btn btn-ghost btn-sm" onclick="resetPasswordLive(${user.id})">${icon('send')}</button>
    </div></td>
  </tr>`;
}

function invitationRow(invitation) {
  const roleLabel = invitation.custom_role_name || titleCaseStatus(invitation.role);
  return `<tr>
    <td><input type="checkbox"></td>
    <td><div style="display:flex;align-items:center;gap:0.625rem">${avatar(invitation.full_name || invitation.email,36)}<div><div style="font-weight:600;font-size:0.875rem">${escapeHtml(invitation.full_name || 'Pending invite')}</div><div style="font-size:0.75rem;color:var(--text-muted)">${escapeHtml(invitation.email)}</div></div></div></td>
    <td><span class="badge badge-${adminRoleColor(invitation.role)}">${escapeHtml(roleLabel)}</span></td>
    <td style="font-size:0.8125rem">${invitation.team || '-'}</td>
    <td>${adminStatusBadge(false, true)}</td>
    <td style="font-size:0.8rem;color:var(--text-muted)">${apiDate(invitation.sent_at || invitation.created_at)}</td>
    <td><span style="font-size:0.8rem;color:var(--text-muted)">-</span></td>
    <td><span style="font-size:0.8rem;color:var(--text-muted)">-</span></td>
    <td><div class="flex gap-1"><button class="btn btn-ghost btn-sm" onclick="resendInvitationLive(${invitation.id})">${icon('send')} Resend</button><button class="btn btn-ghost btn-sm" onclick="revokeInvitationLive(${invitation.id})">${icon('x')} Revoke</button></div></td>
  </tr>`;
}

async function openUserDrawer(userId) {
  try {
    const [user, memberships, sessions, mfaDevices] = await Promise.all([
      hanmakApi(`/users/${userId}/`),
      hanmakApi('/memberships/'),
      hanmakApi('/user-sessions/'),
      hanmakApi('/mfa-devices/'),
    ]);
    const membership = (memberships.results || memberships).find(item => item.user === user.id);
    const userSessions = (sessions.results || sessions).filter(item => item.user === user.id);
    const userMfa = (mfaDevices.results || mfaDevices).filter(item => item.user === user.id);
    const name = adminDisplayName(user);
    openDrawer(`<div class="drawer-header"><h3 class="drawer-title">${escapeHtml(name)}</h3><button class="modal-close" onclick="closeDrawer()">x</button></div>
      <div class="drawer-body">
        <div style="display:flex;align-items:center;gap:1rem;padding-bottom:1.25rem;border-bottom:1px solid var(--border);margin-bottom:1.25rem">${avatar(name,64)}
          <div><div style="font-weight:700;font-size:1.125rem">${escapeHtml(name)}</div><div style="color:var(--text-muted);font-size:0.875rem">${escapeHtml(user.email || user.username)}</div>${adminStatusBadge(user.is_active)}</div>
        </div>
        <div class="flex flex-col gap-3">
          ${[['Role', titleCaseStatus(membership?.role || '-')], ['Custom Role', membership?.custom_role_name || '-'], ['Team', membership?.team_name || '-'], ['Organization', membership?.organization_name || '-'], ['Member Since', apiDate(membership?.joined_at)], ['Last Login', apiDate(userSessions[0]?.last_seen_at)], ['MFA', userMfa.some(device => device.is_confirmed) ? 'Enabled' : 'Not enabled'], ['SSO', user.sso_enabled ? 'Detected' : 'Not detected'], ['API Access', user.is_active ? 'Allowed' : 'Suspended']].map(([k,v]) => `<div style="display:flex;justify-content:space-between;padding:0.375rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${k}</span><span style="font-weight:500">${escapeHtml(v)}</span></div>`).join('')}
        </div>
        <div style="font-weight:700;margin:1.25rem 0 0.5rem">Active Sessions</div>
        ${userSessions.length ? userSessions.map(session => `<div style="display:flex;justify-content:space-between;gap:1rem;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.8rem"><span>${escapeHtml(session.ip_address || 'unknown IP')}</span>${session.revoked_at ? liveBadge('revoked') : liveBadge('active')}</div>`).join('') : '<div style="font-size:0.8rem;color:var(--text-muted)">No sessions recorded</div>'}
        <div class="flex gap-2" style="margin-top:1.25rem;flex-wrap:wrap">
          <button class="btn btn-ghost btn-sm" onclick="resetPasswordLive(${user.id})">${icon('lock')} Reset Password</button>
          <button class="btn btn-ghost btn-sm" onclick="cancelSetupTokensLive(${user.id})">${icon('x')} Cancel Setup Tokens</button>
          <button class="btn btn-ghost btn-sm" onclick="revokeSessionsLive(${user.id})">${icon('x-circle')} Revoke Sessions</button>
          ${user.is_active ? `<button class="btn btn-danger btn-sm" onclick="suspendUserLive(${user.id})">${icon('user-x')} Suspend</button>` : `<button class="btn btn-primary btn-sm" onclick="activateUserLive(${user.id})">${icon('check')} Activate</button>`}
        </div>
      </div>`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function inviteUser() {
  Promise.all([firstOrganizationId(), hanmakApi('/teams/'), hanmakApi('/roles/'), hanmakApi('/organizations/')]).then(([organization, teamData, roleData, orgData]) => {
    const organizations = orgData.results || orgData;
    const teams = (teamData.results || teamData).filter(team => team.organization === organization);
    const roles = (roleData.results || roleData).filter(role => role.organization === organization);
    openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">${icon('user-plus')} Invite User</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Organization</label><select id="invite-organization" class="form-input" onchange="refreshInviteOrgDependentFields()">${organizations.map(org => `<option value="${org.id}" ${org.id === organization ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Email Address *</label><input id="invite-email" class="form-input" type="email" placeholder="colleague@yourorg.com"></div>
        <div class="form-group"><label class="form-label">Full Name</label><input id="invite-name" class="form-input" placeholder="Jane Smith"></div>
        <div class="form-group"><label class="form-label">Role</label><select id="invite-role" class="form-input">${adminRoleOptions('signer')}</select></div>
        <div class="form-group"><label class="form-label">Custom Role</label><select id="invite-custom-role" class="form-input">${adminCustomRoleOptions(roles)}</select></div>
        <div class="form-group"><label class="form-label">Team</label><select id="invite-team" class="form-input">${adminTeamOptions(teams)}</select></div>
        <div class="form-group"><label class="form-label">Welcome Message</label><textarea id="invite-message" class="form-input" rows="2" placeholder="Welcome to HanMak."></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="sendInviteLive()">${icon('send')} Send Invite</button></div></div>`);
  }).catch(error => showToast(error.message, 'error'));
}

function createUser() {
  Promise.all([firstOrganizationId(), hanmakApi('/teams/'), hanmakApi('/roles/'), hanmakApi('/organizations/')]).then(([organization, teamData, roleData, orgData]) => {
    const organizations = orgData.results || orgData;
    const teams = (teamData.results || teamData).filter(team => team.organization === organization);
    const roles = (roleData.results || roleData).filter(role => role.organization === organization);
    openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">${icon('user-plus')} Create User</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Organization</label><select id="create-user-organization" class="form-input" onchange="refreshCreateUserOrgDependentFields()">${organizations.map(org => `<option value="${org.id}" ${org.id === organization ? 'selected' : ''}>${escapeHtml(org.name)}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Email Address *</label><input id="create-user-email" class="form-input" type="email" placeholder="colleague@yourorg.com"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">First Name</label><input id="create-user-first-name" class="form-input" placeholder="Jane"></div>
          <div class="form-group"><label class="form-label">Last Name</label><input id="create-user-last-name" class="form-input" placeholder="Smith"></div>
        </div>
        <div class="form-group"><label class="form-label">Username</label><input id="create-user-username" class="form-input" placeholder="auto from email"></div>
        <div class="form-group"><label class="form-label">Display Name</label><input id="create-user-display-name" class="form-input" placeholder="Jane Smith"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Role</label><select id="create-user-role" class="form-input">${adminRoleOptions('signer')}</select></div>
          <div class="form-group"><label class="form-label">Custom Role</label><select id="create-user-custom-role" class="form-input">${adminCustomRoleOptions(roles)}</select></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
          <div class="form-group"><label class="form-label">Team</label><select id="create-user-team" class="form-input">${adminTeamOptions(teams)}</select></div>
        </div>
        <div class="form-group"><label class="form-label">Setup Method</label><select id="create-user-setup-mode" class="form-input" onchange="toggleCreateUserPassword()"><option value="setup_email">Send setup email</option><option value="temporary_password">Set temporary password</option></select></div>
        <div id="create-user-temp-wrap" class="form-group" style="display:none"><label class="form-label">Temporary Password</label><input id="create-user-temp-password" class="form-input" type="password" placeholder="At least 8 characters"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createManagedUserLive()">${icon('user-plus')} Create User</button></div></div>`);
  }).catch(error => showToast(error.message, 'error'));
}

function toggleCreateUserPassword() {
  const mode = document.getElementById('create-user-setup-mode')?.value || 'setup_email';
  const wrap = document.getElementById('create-user-temp-wrap');
  if (wrap) wrap.style.display = mode === 'temporary_password' ? '' : 'none';
}

async function refreshCreateUserOrgDependentFields() {
  const organization = Number(document.getElementById('create-user-organization')?.value || 0);
  const [teamData, roleData] = await Promise.all([hanmakApi('/teams/'), hanmakApi('/roles/')]);
  const teams = (teamData.results || teamData).filter(team => team.organization === organization);
  const roles = (roleData.results || roleData).filter(role => role.organization === organization);
  const teamEl = document.getElementById('create-user-team');
  const roleEl = document.getElementById('create-user-custom-role');
  if (teamEl) teamEl.innerHTML = adminTeamOptions(teams);
  if (roleEl) roleEl.innerHTML = adminCustomRoleOptions(roles);
}

async function refreshInviteOrgDependentFields() {
  const organization = Number(document.getElementById('invite-organization')?.value || 0);
  const [teamData, roleData] = await Promise.all([hanmakApi('/teams/'), hanmakApi('/roles/')]);
  const teams = (teamData.results || teamData).filter(team => team.organization === organization);
  const roles = (roleData.results || roleData).filter(role => role.organization === organization);
  const teamEl = document.getElementById('invite-team');
  const roleEl = document.getElementById('invite-custom-role');
  if (teamEl) teamEl.innerHTML = adminTeamOptions(teams);
  if (roleEl) roleEl.innerHTML = adminCustomRoleOptions(roles);
}

async function createManagedUserLive(organization = null) {
  try {
    organization = organization || Number(document.getElementById('create-user-organization')?.value || 0);
    const email = document.getElementById('create-user-email').value.trim();
    if (!email) return showToast('Email is required', 'error');
    const payload = {
      organization,
      email,
      username: document.getElementById('create-user-username').value.trim(),
      first_name: document.getElementById('create-user-first-name').value.trim(),
      last_name: document.getElementById('create-user-last-name').value.trim(),
      display_name: document.getElementById('create-user-display-name').value.trim(),
      role: document.getElementById('create-user-role').value,
      custom_role: document.getElementById('create-user-custom-role').value || null,
      team: document.getElementById('create-user-team').value || null,
      setup_mode: document.getElementById('create-user-setup-mode').value,
      temporary_password: document.getElementById('create-user-temp-password').value,
    };
    const created = await hanmakApi('/users/create_managed/', {method: 'POST', body: JSON.stringify(payload)});
    closeModal();
    const setupNote = created.queued_email ? ` Setup email queued #${created.queued_email}.` : ' Temporary password is active.';
    showToast(`User ${adminDisplayName(created)} created.${setupNote}`, 'success', 8000);
    users_init();
  } catch (error) {
    showToast(`Create user failed: ${error.message}`, 'error', 8000);
  }
}

async function sendInviteLive(organization = null) {
  try {
    organization = organization || Number(document.getElementById('invite-organization')?.value || 0);
    const email = document.getElementById('invite-email').value.trim();
    if (!email) return showToast('Email is required', 'error');
    await hanmakApi('/invitations/', {method: 'POST', body: JSON.stringify({organization, email, full_name: document.getElementById('invite-name').value.trim(), role: document.getElementById('invite-role').value, custom_role: document.getElementById('invite-custom-role').value || null, team: document.getElementById('invite-team').value || null, message: document.getElementById('invite-message').value.trim()})});
    closeModal();
    showToast('Invite recorded and ready for email delivery', 'success');
    users_init();
  } catch (error) {
    showToast(`Invite failed: ${error.message}`, 'error', 7000);
  }
}

async function resetPasswordLive(userId) {
  const data = await hanmakApi(`/users/${userId}/reset_password/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`Password recovery request #${data.recovery_request} created`, 'success');
}
async function cancelSetupTokensLive(userId) {
  const data = await hanmakApi(`/users/${userId}/cancel_setup_tokens/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`${data.revoked_count} setup token(s) cancelled`, 'success');
  openUserDrawer(userId);
}
async function revokeSessionsLive(userId) {
  const data = await hanmakApi(`/users/${userId}/revoke_sessions/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`${data.revoked_count} session(s) revoked`, 'success');
  openUserDrawer(userId);
}
async function suspendUserLive(userId) {
  await hanmakApi(`/users/${userId}/suspend/`, {method: 'POST', body: JSON.stringify({})});
  showToast('User suspended', 'success');
  users_init();
  closeDrawer();
}
async function activateUserLive(userId) {
  await hanmakApi(`/users/${userId}/activate/`, {method: 'POST', body: JSON.stringify({})});
  showToast('User activated', 'success');
  users_init();
  closeDrawer();
}
function openImpersonationModal(userId, userName) {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div>
          <div class="modal-title">Request Impersonation Access</div>
          <div class="modal-subtitle" style="font-size:0.8125rem;color:var(--text-muted);margin-top:2px">${escapeHtml(userName)}</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <div style="display:flex;gap:0.625rem;background:var(--warning-light,#fef9c3);border:1px solid var(--warning,#ca8a04);border-radius:7px;padding:0.75rem;margin-bottom:1rem;font-size:0.8125rem">
          ${icon('alert-triangle')}
          <div>
            <strong>Session switching requires approval.</strong><br>
            This creates an audited request requiring a second admin to approve before a temporary target-user token can be issued.
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Reason for Access <span style="color:var(--danger)">*</span></label>
          <textarea id="impersonation-reason" class="form-input" rows="3" placeholder="Describe the support scenario (e.g. user-reported issue, account recovery request)"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="submitImpersonationRequestLive(${userId})">${icon('user')} Submit Audited Request</button>
      </div>
    </div>
  `);
}

async function submitImpersonationRequestLive(userId) {
  const reason = document.getElementById('impersonation-reason')?.value.trim();
  if (!reason) return showToast('A reason is required before submitting', 'error');
  try {
    const data = await hanmakApi(`/users/${userId}/impersonation_preview/`, {method: 'POST', body: JSON.stringify({reason})});
    closeModal();
    showToast(`Request #${data.request?.id} logged — awaiting approval before session switching.`, 'info', 9000);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openImpersonationQueueLive() {
  try {
    const data = await hanmakApi('/impersonation-requests/');
    const requests = data.results || data;
    openModal(`<div class="modal-header"><h3 class="modal-title">Impersonation Requests</h3><button class="modal-close" onclick="closeModal()">x</button></div>
      <div class="modal-body">
        ${requests.length ? `<table class="table"><thead><tr><th>Target</th><th>Requester</th><th>Status</th><th>Reason</th><th></th></tr></thead><tbody>
          ${requests.map(item => `<tr>
            <td>${escapeHtml(item.target_username || item.target_user)}</td>
            <td>${escapeHtml(item.requester_username || item.requester)}</td>
            <td>${liveBadge(item.status)}</td>
            <td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(item.reason || '')}</td>
            <td>${impersonationActionsLive(item)}</td>
          </tr>`).join('')}
        </tbody></table>` : '<div style="padding:2rem;text-align:center;color:var(--text-muted)">No impersonation requests.</div>'}
      </div>`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function impersonationActionsLive(item) {
  if (item.status === 'requested') {
    return `<div class="flex gap-1"><button class="btn btn-primary btn-sm" onclick="decideImpersonationLive(${item.id}, 'approve')">Approve</button><button class="btn btn-ghost btn-sm" onclick="decideImpersonationLive(${item.id}, 'deny')">Deny</button></div>`;
  }
  if (item.status === 'approved' || item.status === 'active') {
    return `<button class="btn btn-primary btn-sm" onclick="startImpersonationLive(${item.id})">${icon('log-in')} Start</button>`;
  }
  return '-';
}

async function decideImpersonationLive(id, action) {
  await hanmakApi(`/impersonation-requests/${id}/${action}/`, {method:'POST', body: JSON.stringify({})});
  showToast(`Impersonation request ${action === 'deny' ? 'denied' : 'approved'}`, 'success');
  closeModal();
  openImpersonationQueueLive();
}
async function startImpersonationLive(id) {
  try {
    const previous = {
      access: localStorage.getItem('HANMAK_ACCESS_TOKEN') || '',
      refresh: localStorage.getItem('HANMAK_REFRESH_TOKEN') || '',
    };
    const data = await hanmakApi(`/impersonation-requests/${id}/start/`, {method: 'POST', body: JSON.stringify({})});
    localStorage.setItem('HANMAK_PRE_IMPERSONATION_ACCESS_TOKEN', previous.access);
    localStorage.setItem('HANMAK_PRE_IMPERSONATION_REFRESH_TOKEN', previous.refresh);
    localStorage.setItem('HANMAK_ACTIVE_IMPERSONATION_ID', String(id));
    localStorage.setItem('HANMAK_ACCESS_TOKEN', data.access);
    localStorage.setItem('HANMAK_REFRESH_TOKEN', data.refresh);
    closeModal();
    refreshAuthButton?.();
    showToast(`Now impersonating ${data.target_user?.username || 'target user'}. Use End Impersonation to return.`, 'warning', 10000);
    navigate('dashboard');
  } catch (error) {
    showToast(`Could not start impersonation: ${error.message}`, 'error', 9000);
  }
}

async function endImpersonationLive() {
  const id = localStorage.getItem('HANMAK_ACTIVE_IMPERSONATION_ID');
  const previousAccess = localStorage.getItem('HANMAK_PRE_IMPERSONATION_ACCESS_TOKEN') || '';
  const previousRefresh = localStorage.getItem('HANMAK_PRE_IMPERSONATION_REFRESH_TOKEN') || '';
  if (previousAccess) localStorage.setItem('HANMAK_ACCESS_TOKEN', previousAccess);
  if (previousRefresh) localStorage.setItem('HANMAK_REFRESH_TOKEN', previousRefresh);
  localStorage.removeItem('HANMAK_PRE_IMPERSONATION_ACCESS_TOKEN');
  localStorage.removeItem('HANMAK_PRE_IMPERSONATION_REFRESH_TOKEN');
  localStorage.removeItem('HANMAK_ACTIVE_IMPERSONATION_ID');
  if (id) {
    try { await hanmakApi(`/impersonation-requests/${id}/end/`, {method: 'POST', body: JSON.stringify({})}); } catch (_) {}
  }
  refreshAuthButton?.();
  showToast('Impersonation ended', 'success');
  navigate('dashboard');
}
async function revokeInvitationLive(invitationId) {
  await hanmakApi(`/invitations/${invitationId}/revoke/`, {method: 'POST', body: JSON.stringify({})});
  showToast('Invitation revoked', 'success');
  users_init();
}
async function resendInvitationLive(invitationId) {
  const data = await hanmakApi(`/invitations/${invitationId}/resend/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`Invitation resent${data.queued_email ? ` as email #${data.queued_email}` : ''}`, 'success');
  users_init();
}
async function exportUsersLive() {
  const data = await adminLoadAll();
  const rows = data.users.map(user => `${user.id},${adminDisplayName(user)},${user.email},${user.is_active ? 'active' : 'suspended'}`).join('\n');
  downloadTextFile(`hanmak-users-${new Date().toISOString().slice(0,10)}.csv`, `id,name,email,status\n${rows}`, 'text/csv');
  showToast('User CSV exported', 'success');
}

// ==================== ORGANIZATIONS ====================
registerPage('organizations', () => `
<div class="page-header">
  <div><h1 class="page-title">Organization</h1><p class="page-subtitle">Live organization profile, domains, subsidiaries, export and ownership controls</p></div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="showOrgSwitcher()">${icon('shuffle')} Switch</button>
    <button class="btn btn-ghost" onclick="openCreateOrganizationModalLive()">${icon('plus')} New Organization</button>
    <button class="btn btn-primary" onclick="saveOrganizationLive()">${icon('save')} Save Changes</button>
  </div>
</div>
<div id="admin-organization-body"></div>
`);

async function organizations_init() {
  try {
    const state = await adminLoadAll();
    const organizationId = await firstOrganizationId();
    const org = state.organizations.find(item => item.id === organizationId) || state.organizations[0];
    const domains = state.domains.filter(domain => domain.organization === org.id);
    const subsidiaries = state.organizations.filter(item => item.parent === org.id);
    if (!document.getElementById('admin-organization-body')) return;
    document.getElementById('admin-organization-body').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <div class="flex flex-col gap-4">
        <div class="card" style="padding:1.5rem">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Organization Profile</h3>
          <input id="org-id" type="hidden" value="${org.id}">
          <div class="form-group"><label class="form-label">Organization Name</label><input id="org-name" class="form-input" value="${escapeHtml(org.name)}"></div>
          <div class="form-group"><label class="form-label">Legal Name</label><input id="org-legal-name" class="form-input" value="${escapeHtml(org.legal_name || '')}"></div>
          <div class="form-group"><label class="form-label">Slug</label><input id="org-slug" class="form-input" value="${escapeHtml(org.slug)}"></div>
          <div class="form-group"><label class="form-label">Website</label><input id="org-website" class="form-input" value="${escapeHtml(org.website || '')}"></div>
          <div class="form-group"><label class="form-label">Primary Contact</label><input id="org-contact" class="form-input" value="${escapeHtml(org.primary_contact_email || '')}" type="email"></div>
        </div>
        <div class="card" style="padding:1.5rem">
          <h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Verified Domains</h3>
          <div class="flex flex-col gap-2">${domains.map(domain => organizationDomainRow(domain)).join('') || '<div style="font-size:0.8rem;color:var(--text-muted)">No domains added.</div>'}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onclick="addDomain()">${icon('plus')} Add Domain</button>
        </div>
      </div>
      <div class="flex flex-col gap-4">
        <div class="card" style="padding:1.5rem"><h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Organization Logo</h3><div class="upload-zone">${org.logo_url ? `<img src="${escapeHtml(org.logo_url)}" style="width:80px;height:80px;border-radius:12px;object-fit:contain;margin:0 auto 0.75rem;display:block">` : `<div style="width:80px;height:80px;background:var(--primary);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.5rem;margin:0 auto 0.75rem">${escapeHtml(org.name[0] || 'H')}</div>`}<input id="org-logo-file" class="form-input" type="file" accept="image/*"><button class="btn btn-ghost btn-sm" style="margin-top:0.75rem" onclick="uploadOrganizationLogoLive(${org.id})">${icon('upload')} Upload Logo</button></div></div>
        <div class="card" style="padding:1.5rem"><h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Multi-Org / Subsidiaries</h3>${subsidiaries.map(sub => `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem;border:1px solid var(--border);border-radius:7px;margin-bottom:0.5rem">${avatar(sub.name,36)}<div style="flex:1"><div style="font-weight:600;font-size:0.875rem">${escapeHtml(sub.name)}</div></div><span class="badge badge-secondary">Subsidiary</span></div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-muted)">No subsidiaries yet.</div>'}<button class="btn btn-ghost btn-sm" style="margin-top:0.5rem" onclick="createSubsidiaryLive(${org.id})">${icon('plus')} Add Subsidiary</button></div>
        <div class="card" style="padding:1.5rem"><h3 style="font-size:1rem;font-weight:700;margin-bottom:1.25rem">Danger Zone</h3><div class="flex flex-col gap-2"><button class="btn btn-ghost" style="color:var(--warning);justify-content:flex-start" onclick="exportOrganizationLive(${org.id})">${icon('download')} Export All Organization Data</button><button class="btn btn-ghost" style="color:var(--danger);justify-content:flex-start" onclick="transferOwnershipLive(${org.id})">${icon('shuffle')} Transfer Ownership</button><button class="btn btn-danger" style="justify-content:flex-start" onclick="requestOrganizationDeletionLive(${org.id})">${icon('trash')} Request Deletion</button><button class="btn btn-ghost" style="color:var(--danger);justify-content:flex-start" onclick="deleteOrganizationNowLive(${org.id})">${icon('trash')} Delete Now (Super Admin)</button></div></div>
      </div>
    </div>`;
    const params = new URLSearchParams(location.search);
    const deletionToken = params.get('deletion_token');
    const deletionOrg = Number(params.get('organization') || org.id);
    if (deletionToken && deletionOrg === org.id) openConfirmOrganizationDeletionModal(org.id, deletionToken);
  } catch (error) {
    if (!document.getElementById('admin-organization-body')) return;
    showToast(`Organization failed: ${error.message}`, 'error', 7000);
  }
}

function openCreateOrganizationModalLive() {
  openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Create Organization</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Name</label><input id="new-org-name" class="form-input" placeholder="Example Holdings"></div><div class="form-group"><label class="form-label">Slug</label><input id="new-org-slug" class="form-input" placeholder="example-holdings"></div><div class="form-group"><label class="form-label">Primary Contact Email</label><input id="new-org-contact" class="form-input" type="email" placeholder="admin@example.com"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createOrganizationLive()">${icon('plus')} Create</button></div></div>`);
}

async function createOrganizationLive() {
  const name = document.getElementById('new-org-name')?.value.trim() || '';
  if (!name) return showToast('Organization name is required', 'error');
  const slug = document.getElementById('new-org-slug')?.value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const org = await hanmakApi('/organizations/', {
    method: 'POST',
    body: JSON.stringify({
      name,
      slug,
      primary_contact_email: document.getElementById('new-org-contact')?.value.trim() || '',
    }),
  });
  closeModal();
  if (typeof setActiveOrganization === 'function') setActiveOrganization(org);
  showToast(`Organization ${org.name} created`, 'success');
  organizations_init();
}

function organizationDomainRow(domain) {
  return `<div style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem;border:1px solid var(--border);border-radius:7px"><span style="flex:1;font-family:var(--font-mono);font-size:0.875rem">${escapeHtml(domain.domain)}</span>${liveBadge(domain.status)}<button class="btn btn-ghost btn-sm" onclick="verifyDomainLive(${domain.id})">${icon('check')} Verify</button><button class="btn btn-ghost btn-sm" onclick="deleteDomainLive(${domain.id})">${icon('trash')}</button></div><div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);margin:-0.25rem 0 0.35rem 0.35rem">${escapeHtml(domain.dns_record || '')}</div>`;
}

async function saveOrganizationLive() {
  const id = document.getElementById('org-id').value;
  await hanmakApi(`/organizations/${id}/`, {method: 'PATCH', body: JSON.stringify({name: document.getElementById('org-name').value.trim(), legal_name: document.getElementById('org-legal-name').value.trim(), slug: document.getElementById('org-slug').value.trim(), website: document.getElementById('org-website').value.trim(), primary_contact_email: document.getElementById('org-contact').value.trim()})});
  showToast('Organization saved', 'success');
  organizations_init();
}

function addDomain() {
  firstOrganizationId().then(organization => openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Add Domain</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Domain Name</label><input id="new-domain" class="form-input" placeholder="yourcompany.com"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createDomainLive(${organization})">Create DNS Record</button></div></div>`));
}
async function createDomainLive(organization) {
  const domain = document.getElementById('new-domain').value.trim();
  if (!domain) return showToast('Domain is required', 'error');
  const created = await hanmakApi('/organization-domains/', {method: 'POST', body: JSON.stringify({organization, domain})});
  closeModal();
  showToast(`Add TXT record: ${created.dns_record}`, 'success', 8000);
  organizations_init();
}
async function verifyDomainLive(id) {
  await hanmakApi(`/organization-domains/${id}/verify/`, {method: 'POST', body: JSON.stringify({})});
  showToast('Domain verified', 'success');
  organizations_init();
}
async function deleteDomainLive(id) {
  await hanmakApi(`/organization-domains/${id}/`, {method: 'DELETE'});
  showToast('Domain removed', 'success');
  organizations_init();
}
function createSubsidiaryLive(parent) {
  openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Add Subsidiary</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Name</label><input id="subsidiary-name" class="form-input" placeholder="Acme EU"></div><div class="form-group"><label class="form-label">Slug</label><input id="subsidiary-slug" class="form-input" placeholder="acme-eu"></div></div><div class="modal-footer"><button class="btn btn-primary" onclick="saveSubsidiaryLive(${parent})">Create</button></div></div>`);
}
async function saveSubsidiaryLive(parent) {
  const name = document.getElementById('subsidiary-name').value.trim();
  await hanmakApi('/organizations/', {method: 'POST', body: JSON.stringify({parent, name, slug: document.getElementById('subsidiary-slug').value.trim() || name.toLowerCase().replaceAll(' ', '-')})});
  closeModal();
  showToast('Subsidiary created', 'success');
  organizations_init();
}
async function exportOrganizationLive(organizationId) {
  const data = await hanmakApi(`/organizations/${organizationId}/export_data/`);
  downloadTextFile(`hanmak-organization-${organizationId}-export.json`, JSON.stringify(data, null, 2), 'application/json');
  showToast('Organization export downloaded', 'success');
}
async function uploadOrganizationLogoLive(organizationId) {
  const input = document.getElementById('org-logo-file');
  if (!input?.files?.[0]) return showToast('Choose a logo image first', 'error');
  const form = new FormData();
  form.append('logo', input.files[0]);
  await hanmakApi(`/organizations/${organizationId}/upload_logo/`, {method: 'POST', body: form});
  showToast('Organization logo uploaded', 'success');
  organizations_init();
}
async function transferOwnershipLive(organizationId) {
  const userData = await hanmakApi('/users/');
  const users = userData.results || userData;
  openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Transfer Ownership</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">New Owner</label><select id="transfer-owner-user" class="form-input">${users.map(user => `<option value="${user.id}">${escapeHtml(adminDisplayName(user))} - ${escapeHtml(user.email || user.username)}</option>`).join('')}</select></div><p style="font-size:0.8125rem;color:var(--text-secondary)">This promotes the selected member to organization admin. Full production ownership transfer can add email confirmation later.</p></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="confirmTransferOwnershipLive(${organizationId})">${icon('shuffle')} Transfer</button></div></div>`);
}
async function confirmTransferOwnershipLive(organizationId) {
  const user = document.getElementById('transfer-owner-user').value;
  await hanmakApi(`/organizations/${organizationId}/transfer_ownership/`, {method: 'POST', body: JSON.stringify({user})});
  closeModal();
  showToast('Ownership/admin access transferred', 'success');
  organizations_init();
}
function requestOrganizationDeletionLive(organizationId) {
  openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Request Organization Deletion</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Reason</label><textarea id="org-delete-reason" class="form-input" rows="3" placeholder="Why should this organization be deleted?"></textarea></div><p style="font-size:0.8125rem;color:var(--text-secondary)">This records a deletion request for confirmation and audit instead of immediately deleting tenant data.</p></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmOrganizationDeletionRequestLive(${organizationId})">${icon('trash')} Request Deletion</button></div></div>`);
}
async function confirmOrganizationDeletionRequestLive(organizationId) {
  const data = await hanmakApi(`/organizations/${organizationId}/request_deletion/`, {method: 'POST', body: JSON.stringify({reason: document.getElementById('org-delete-reason').value.trim()})});
  closeModal();
  showToast(`Deletion request recorded. Confirmation email queued${data.deletion_request?.queued_email ? ` #${data.deletion_request.queued_email}` : ''}.`, 'success', 8000);
}

function deleteOrganizationNowLive(organizationId) {
  confirm(`Permanently delete organization #${organizationId}? Use this only for super-admin cleanup after export/review.`, async () => {
    await hanmakApi(`/organizations/${organizationId}/`, {method: 'DELETE'});
    localStorage.removeItem('HANMAK_ORGANIZATION_ID');
    showToast('Organization deleted', 'success');
    organizations_init();
  });
}
function openConfirmOrganizationDeletionModal(organizationId, token) {
  openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Confirm Organization Deletion</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><p style="color:var(--text-secondary)">This confirms the deletion request after the cooling-off period. Export organization data before completing this action.</p><div class="form-group"><label class="form-label">Confirmation Token</label><input id="org-delete-confirm-token" class="form-input" value="${escapeHtml(token)}"></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmOrganizationDeletionLive(${organizationId})">${icon('trash')} Confirm Request</button></div></div>`);
}
async function confirmOrganizationDeletionLive(organizationId) {
  const token = document.getElementById('org-delete-confirm-token').value.trim();
  const data = await hanmakApi(`/organizations/${organizationId}/confirm_deletion_request/`, {method: 'POST', body: JSON.stringify({token})});
  closeModal();
  const url = new URL(location.href);
  url.searchParams.delete('deletion_token');
  history.replaceState({}, '', url.toString());
  showToast(`Deletion request ${data.deletion_request.status}`, 'success');
  organizations_init();
}

// ==================== TEAMS ====================
registerPage('teams', () => `
<div class="page-header"><div><h1 class="page-title">Teams</h1><p class="page-subtitle">Live teams, members, routing ownership, and permissions</p></div><button class="btn btn-primary" onclick="createTeam()">${icon('plus')} Create Team</button></div>
<div id="admin-team-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1.25rem"></div>
`);

async function teams_init() {
  try {
    const state = await adminLoadAll();
    if (!document.getElementById('admin-team-grid')) return;
    const membershipsByTeam = new Map();
    state.memberships.forEach(membership => {
      if (!membership.team) return;
      membershipsByTeam.set(membership.team, [...(membershipsByTeam.get(membership.team) || []), membership]);
    });
    document.getElementById('admin-team-grid').innerHTML = state.teams.map(team => teamCard(team, membershipsByTeam.get(team.id) || [])).join('') || '<div class="empty-state"><div class="empty-state-title">No teams yet</div></div>';
  } catch (error) {
    if (!document.getElementById('admin-team-grid')) return;
    showToast(`Teams failed: ${error.message}`, 'error', 7000);
  }
}

function teamCard(team, members) {
  return `<div class="card" style="padding:1.25rem;cursor:pointer" onclick="openTeamDrawer(${team.id})"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.75rem"><div><div style="font-weight:700;font-size:0.9375rem;margin-bottom:4px">${escapeHtml(team.name)}</div><span class="badge badge-secondary">${members.length} members</span></div><div class="flex gap-1"><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openTeamDrawer(${team.id})">${icon('edit')}</button><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();deleteTeamLive(${team.id})">${icon('trash')}</button></div></div><p style="font-size:0.8125rem;color:var(--text-secondary);margin-bottom:1rem;line-height:1.4">${escapeHtml(team.description || 'No description')}</p><div style="display:flex;margin-bottom:0.75rem">${members.slice(0,4).map(m => avatar(m.user_detail?.display_name || m.user_detail?.username || `User ${m.user}`,30)).join('')}</div><div style="display:flex;justify-content:space-between;font-size:0.8rem;color:var(--text-muted)"><span>${members.length} members</span><span>Team #${team.id}</span></div></div>`;
}

async function openTeamDrawer(teamId) {
  const [team, memberships, users, roles] = await Promise.all([hanmakApi(`/teams/${teamId}/`), hanmakApi('/memberships/'), hanmakApi('/users/'), hanmakApi('/roles/')]);
  const teamMembers = (memberships.results || memberships).filter(item => item.team === teamId);
  const allUsers = users.results || users;
  const customRoles = (roles.results || roles).filter(role => role.organization === team.organization);
  openDrawer(`<div class="drawer-header"><h3 class="drawer-title">Team - ${escapeHtml(team.name)}</h3><button class="modal-close" onclick="closeDrawer()">x</button></div><div class="drawer-body"><input id="team-edit-id" type="hidden" value="${team.id}"><div class="form-group"><label class="form-label">Team Name</label><input id="team-edit-name" class="form-input" value="${escapeHtml(team.name)}"></div><div class="form-group"><label class="form-label">Description</label><textarea id="team-edit-description" class="form-input" rows="2">${escapeHtml(team.description || '')}</textarea></div><div style="font-weight:600;margin:1rem 0 0.5rem">Members</div>${teamMembers.map(member => `<div style="display:grid;grid-template-columns:32px 1fr 120px 150px auto;align-items:center;gap:0.625rem;padding:0.5rem 0;border-bottom:1px solid var(--border)">${avatar(member.user_detail?.display_name || member.user_detail?.username || `User ${member.user}`,32)}<span style="font-size:0.875rem;min-width:0;overflow:hidden;text-overflow:ellipsis">${escapeHtml(member.user_detail?.email || member.user_detail?.username || member.user)}</span><select class="form-input" style="padding:4px 8px;font-size:0.78rem" onchange="updateMembershipRoleLive(${member.id}, this.value)">${adminRoleOptions(member.role)}</select><select class="form-input" style="padding:4px 8px;font-size:0.78rem" onchange="updateMembershipCustomRoleLive(${member.id}, this.value)">${adminCustomRoleOptions(customRoles, member.custom_role)}</select><button class="btn btn-ghost btn-sm" onclick="removeMembershipFromTeamLive(${member.id}, ${team.id})">${icon('x')}</button></div>`).join('') || '<div style="font-size:0.8rem;color:var(--text-muted)">No members yet</div>'}<div class="form-group" style="margin-top:0.75rem"><label class="form-label">Add Member</label><select id="team-add-member" class="form-input"><option value="">Select user...</option>${allUsers.map(user => `<option value="${user.id}">${escapeHtml(adminDisplayName(user))} - ${escapeHtml(user.email || user.username)}</option>`).join('')}</select></div><button class="btn btn-ghost btn-sm" onclick="addMembershipToTeamLive(${team.id}, ${team.organization})">${icon('plus')} Add Member</button><div class="flex gap-2" style="margin-top:1.25rem"><button class="btn btn-primary" style="flex:1" onclick="saveTeamLive()">${icon('save')} Save</button><button class="btn btn-ghost" onclick="closeDrawer()">Cancel</button></div></div>`);
}

function createTeam() {
  firstOrganizationId().then(organization => openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Create Team</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Team Name *</label><input id="new-team-name" class="form-input" placeholder="Legal Team"></div><div class="form-group"><label class="form-label">Description</label><textarea id="new-team-description" class="form-input" rows="2"></textarea></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewTeamLive(${organization})">${icon('users')} Create Team</button></div></div>`));
}
async function saveNewTeamLive(organization) {
  try {
    const name = document.getElementById('new-team-name').value.trim();
    if (!name) return showToast('Team name is required', 'error');
    await hanmakApi('/teams/', {method: 'POST', body: JSON.stringify({organization, name, description: document.getElementById('new-team-description').value.trim()})});
    closeModal();
    showToast('Team created', 'success');
    teams_init();
  } catch (error) {
    showToast(`Team create failed: ${error.message}`, 'error', 7000);
  }
}
async function saveTeamLive() {
  try {
    const id = document.getElementById('team-edit-id').value;
    const name = document.getElementById('team-edit-name').value.trim();
    if (!name) return showToast('Team name is required', 'error');
    await hanmakApi(`/teams/${id}/`, {method: 'PATCH', body: JSON.stringify({name, description: document.getElementById('team-edit-description').value.trim()})});
    showToast('Team saved', 'success');
    closeDrawer();
    teams_init();
  } catch (error) {
    showToast(`Team save failed: ${error.message}`, 'error', 7000);
  }
}
async function deleteTeamLive(id) {
  confirm('Delete this team? Members will remain in the organization without this team assignment.', async () => {
    try {
      await hanmakApi(`/teams/${id}/`, {method: 'DELETE'});
      showToast('Team deleted', 'success');
      teams_init();
    } catch (error) {
      showToast(`Team delete failed: ${error.message}`, 'error', 7000);
    }
  });
}
async function updateMembershipRoleLive(membershipId, role) {
  try {
    await hanmakApi(`/memberships/${membershipId}/`, {method: 'PATCH', body: JSON.stringify({role})});
    showToast('Member role updated', 'success');
  } catch (error) {
    showToast(`Role update failed: ${error.message}`, 'error', 7000);
  }
}
async function updateMembershipCustomRoleLive(membershipId, customRole) {
  try {
    await hanmakApi(`/memberships/${membershipId}/`, {method: 'PATCH', body: JSON.stringify({custom_role: customRole || null})});
    showToast('Custom role updated', 'success');
  } catch (error) {
    showToast(`Custom role update failed: ${error.message}`, 'error', 7000);
  }
}
async function removeMembershipFromTeamLive(membershipId, teamId) {
  try {
    await hanmakApi(`/memberships/${membershipId}/`, {method: 'PATCH', body: JSON.stringify({team: null})});
    showToast('Member removed from team', 'success');
    openTeamDrawer(teamId);
  } catch (error) {
    showToast(`Remove member failed: ${error.message}`, 'error', 7000);
  }
}
async function addMembershipToTeamLive(teamId, organization) {
  try {
    const user = Number(document.getElementById('team-add-member').value || 0);
    if (!user) return showToast('Select a user', 'error');
    const memberships = await hanmakApi('/memberships/');
    const existing = (memberships.results || memberships).find(item => item.user === user && item.organization === organization);
    if (existing) await hanmakApi(`/memberships/${existing.id}/`, {method: 'PATCH', body: JSON.stringify({team: teamId, is_active: true})});
    else await hanmakApi('/memberships/', {method: 'POST', body: JSON.stringify({user, organization, team: teamId, role: 'signer', is_active: true})});
    showToast('Member added', 'success');
    openTeamDrawer(teamId);
  } catch (error) {
    showToast(`Add member failed: ${error.message}`, 'error', 7000);
  }
}

// ==================== ROLES ====================
registerPage('roles', () => `
<div class="page-header"><div><h1 class="page-title">Roles & Permissions</h1><p class="page-subtitle">Live custom role records and permission matrix</p></div><button class="btn btn-primary" onclick="createRole()">${icon('plus')} Create Role</button></div>
<div style="display:grid;grid-template-columns:220px 1fr;gap:1.5rem"><div class="card" style="padding:1rem;height:fit-content" id="admin-role-list"></div><div class="card" id="admin-role-detail"></div></div>
`);

async function roles_init() {
  try {
    const data = await hanmakApi('/roles/');
    const allRoles = data.results || data || [];
    if (!document.getElementById('admin-role-list')) return;
    document.getElementById('admin-role-list').innerHTML = allRoles.map((role, index) => `<div data-role-id="${role.id}" style="display:flex;align-items:center;gap:0.625rem;padding:0.5rem 0.625rem;border-radius:6px;cursor:pointer;background:${index === 0 ? 'var(--primary-light)' : ''};color:${index === 0 ? 'var(--primary)' : 'var(--text-secondary)'};margin-bottom:2px;font-size:0.875rem" onclick="selectRole(${role.id},this)">${icon('shield')}<span style="flex:1">${escapeHtml(role.name)}</span>${role.is_system ? '<span style="font-size:0.7rem;color:var(--text-muted)">System</span>' : `<button class="btn btn-ghost btn-sm" style="padding:2px 4px;color:var(--danger)" onclick="event.stopPropagation();deleteRoleLive(${role.id},'${escapeHtml(role.name)}')" title="Delete role">${icon('trash')}</button>`}</div>`).join('') + `<button class="btn btn-ghost btn-sm" style="width:100%;margin-top:0.5rem" onclick="createRole()">${icon('plus')} New Role</button>`;
    if (allRoles[0]) renderRoleDetail(allRoles[0]);
    else document.getElementById('admin-role-detail').innerHTML = '<div class="empty-state"><div class="empty-state-title">No roles yet</div></div>';
  } catch (error) {
    if (!document.getElementById('admin-role-list')) return;
    showToast(`Roles failed: ${error.message}`, 'error', 7000);
  }
}

async function selectRole(roleId, el) {
  document.querySelectorAll('[data-role-id]').forEach(node => { node.style.background = ''; node.style.color = 'var(--text-secondary)'; });
  el.style.background = 'var(--primary-light)';
  el.style.color = 'var(--primary)';
  renderRoleDetail(await hanmakApi(`/roles/${roleId}/`));
}

function renderRoleDetail(role) {
  const permissions = Array.isArray(role.permissions) ? role.permissions : [];
  document.getElementById('admin-role-detail').innerHTML = `<div style="padding:1.25rem;border-bottom:1px solid var(--border)"><div style="font-weight:700;font-size:1rem">${escapeHtml(role.name)} - Permission Matrix</div><div style="font-size:0.8125rem;color:var(--text-muted);margin-top:4px">${escapeHtml(role.description || 'Custom role')}</div></div><div style="overflow-x:auto"><table class="table"><thead><tr><th>Resource</th>${ADMIN_PERMISSION_ACTIONS.map(action => `<th style="text-align:center">${titleCaseStatus(action)}</th>`).join('')}</tr></thead><tbody>${ADMIN_PERMISSION_RESOURCES.map(resource => `<tr><td style="font-weight:500">${resource}</td>${ADMIN_PERMISSION_ACTIONS.map(action => { const key = `${resource.toLowerCase().replaceAll(' ', '_')}:${action}`; return `<td style="text-align:center"><input class="role-permission-box" data-permission="${key}" type="checkbox" ${permissions.includes('*') || permissions.includes(key) ? 'checked' : ''}></td>`; }).join('')}</tr>`).join('')}</tbody></table></div><div style="padding:1.25rem;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:0.75rem"><button class="btn btn-ghost" onclick="roles_init()">Reset</button><button class="btn btn-primary" onclick="saveRolePermissionsLive(${role.id})">${icon('save')} Save Permissions</button></div>`;
}

function createRole() {
  firstOrganizationId().then(organization => openModal(`<div class="modal"><div class="modal-header"><h3 class="modal-title">Create Custom Role</h3><button class="modal-close" onclick="closeModal()">x</button></div><div class="modal-body"><div class="form-group"><label class="form-label">Role Name *</label><input id="new-role-name" class="form-input" placeholder="Finance Approver"></div><div class="form-group"><label class="form-label">Description</label><textarea id="new-role-description" class="form-input" rows="2"></textarea></div></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveNewRoleLive(${organization})">${icon('shield')} Create Role</button></div></div>`));
}
async function saveNewRoleLive(organization) {
  try {
    const name = document.getElementById('new-role-name').value.trim();
    if (!name) return showToast('Role name is required', 'error');
    await hanmakApi('/roles/', {method: 'POST', body: JSON.stringify({organization, name, description: document.getElementById('new-role-description').value.trim(), is_system: false, permissions: []})});
    closeModal();
    showToast('Role created', 'success');
    roles_init();
  } catch (error) {
    showToast(`Role create failed: ${error.message}`, 'error', 7000);
  }
}
async function saveRolePermissionsLive(roleId) {
  try {
    const permissions = [...document.querySelectorAll('.role-permission-box:checked')].map(node => node.dataset.permission);
    await hanmakApi(`/roles/${roleId}/`, {method: 'PATCH', body: JSON.stringify({permissions})});
    showToast('Permissions saved', 'success');
    roles_init();
  } catch (error) {
    showToast(`Permission save failed: ${error.message}`, 'error', 7000);
  }
}

async function deleteRoleLive(roleId, roleName) {
  openModal(`<div class="modal"><div class="modal-header"><div class="modal-title">Delete Role</div><button class="modal-close" onclick="closeModal()">${icon('x')}</button></div><div class="modal-body"><p>Delete <strong>${escapeHtml(roleName)}</strong>? Members assigned this role will revert to their base membership role. This cannot be undone.</p></div><div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="closeModal();_doDeleteRoleLive(${roleId})">${icon('trash')} Delete</button></div></div>`);
}

async function _doDeleteRoleLive(roleId) {
  try {
    await hanmakApi(`/roles/${roleId}/`, {method: 'DELETE'});
    showToast('Role deleted', 'success');
    roles_init();
  } catch (error) {
    showToast(error.message, 'error');
  }
}
