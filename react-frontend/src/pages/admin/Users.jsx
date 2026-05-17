import { useState, useEffect, useRef, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const ROLE_OPTIONS = ['super_admin', 'admin', 'manager', 'signer', 'viewer'];

function roleColor(role) {
  return { super_admin: 'danger', admin: 'danger', manager: 'warning', signer: 'primary', viewer: 'secondary' }[String(role || '').toLowerCase()] || 'secondary';
}

function displayName(user) {
  return user.display_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || `User #${user.id}`;
}

export default function Users() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [drawerUser, setDrawerUser] = useState(null);
  const [inviteModal, setInviteModal] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [impersonationModal, setImpersonationModal] = useState(false);
  const [impersonationTargetId, setImpersonationTargetId] = useState(null);
  const [impersonationTargetName, setImpersonationTargetName] = useState('');
  const [impersonationReason, setImpersonationReason] = useState('');
  const [impersonationQueueModal, setImpersonationQueueModal] = useState(false);
  const [setupMode, setSetupMode] = useState('setup_email');
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'signer', custom_role: '', team: '', message: '', organization: '' });
  const [createForm, setCreateForm] = useState({ email: '', first_name: '', last_name: '', username: '', display_name: '', role: 'signer', custom_role: '', team: '', organization: '', temporary_password: '' });
  const searchTimer = useRef(null);

  const { data: usersData, isLoading: loadingUsers, refetch: refetchUsers } = useApiQuery(['users'], EP.USERS);
  const { data: membershipsData, isLoading: loadingMemberships } = useApiQuery(['memberships'], EP.MEMBERSHIPS);
  const { data: invitationsData, isLoading: loadingInvitations, refetch: refetchInvitations } = useApiQuery(['invitations'], EP.INVITATIONS);
  const { data: mfaData } = useApiQuery(['mfa-devices'], EP.MFA_DEVICES);
  const { data: sessionsData } = useApiQuery(['sessions'], EP.SESSIONS);
  const { data: teamsData } = useApiQuery(['teams'], EP.TEAMS);
  const { data: rolesData } = useApiQuery(['roles'], EP.ROLES);
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const { data: impersonationData, refetch: refetchImpersonation } = useApiQuery(['impersonation-requests'], '/impersonation-requests/', {}, { enabled: impersonationQueueModal });

  const users = usersData?.results ?? [];
  const memberships = membershipsData?.results ?? [];
  const invitations = invitationsData?.results ?? [];
  const mfaDevices = mfaData?.results ?? [];
  const sessions = sessionsData?.results ?? [];
  const teams = teamsData?.results ?? [];
  const roles = rolesData?.results ?? [];
  const orgs = orgsData?.results ?? [];
  const impersonationRequests = impersonationData?.results ?? [];

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const membershipByUser = new Map(memberships.map(m => [m.user, m]));
  const sessionByUser = new Map(sessions.map(s => [s.user, s]));
  const mfaUsers = new Set(mfaDevices.filter(d => d.is_confirmed).map(d => d.user));

  const q = debouncedSearch.toLowerCase();
  const allRows = [
    ...users.map(u => ({ type: 'user', user: u, membership: membershipByUser.get(u.id), session: sessionByUser.get(u.id), hasMfa: mfaUsers.has(u.id) })),
    ...invitations.filter(i => i.status === 'pending').map(i => ({ type: 'invite', invitation: i })),
  ].filter(row => {
    const text = row.type === 'user'
      ? `${displayName(row.user)} ${row.user.email || ''} ${row.membership?.role || ''} ${row.membership?.team_name || ''}`.toLowerCase()
      : `${row.invitation.full_name || ''} ${row.invitation.email || ''} ${row.invitation.role || ''}`.toLowerCase();
    const role = row.type === 'user' ? row.membership?.role : row.invitation.role;
    const status = row.type === 'invite' ? 'pending' : row.user.is_active ? 'active' : 'suspended';
    return (!q || text.includes(q)) && (!roleFilter || role === roleFilter) && (!statusFilter || status === statusFilter);
  });

  const stats = [
    { label: 'Total Users', value: users.length, color: 'var(--primary)' },
    { label: 'Active', value: users.filter(u => u.is_active).length, color: 'var(--success)' },
    { label: 'Pending Invite', value: invitations.filter(i => i.status === 'pending').length, color: 'var(--warning)' },
    { label: 'Suspended', value: users.filter(u => !u.is_active).length, color: 'var(--danger)' },
  ];

  const inviteMutation = useApiMutation(
    (payload) => apiClient.post(EP.INVITATIONS, payload),
    { invalidateKeys: ['invitations'], onSuccess: () => { toast.success('Invitation sent'); setInviteModal(false); refetchInvitations(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const createUserMutation = useApiMutation(
    (payload) => apiClient.post('/users/create_managed/', payload),
    { invalidateKeys: ['users'], onSuccess: (data) => { toast.success(`User created${data.data?.queued_email ? ' — setup email queued' : ''}`); setCreateModal(false); refetchUsers(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const resetPasswordMutation = useApiMutation(
    (userId) => apiClient.post(`/users/${userId}/reset_password/`, {}),
    { onSuccess: (d) => toast.success(`Password recovery #${d.data?.recovery_request} created`), onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const cancelTokensMutation = useApiMutation(
    (userId) => apiClient.post(`/users/${userId}/cancel_setup_tokens/`, {}),
    { onSuccess: (d) => toast.success(`${d.data?.revoked_count ?? 0} setup token(s) cancelled`), onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const revokeSessionsMutation = useApiMutation(
    (userId) => apiClient.post(`/users/${userId}/revoke_sessions/`, {}),
    { onSuccess: (d) => toast.success(`${d.data?.revoked_count ?? 0} session(s) revoked`), onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const suspendMutation = useApiMutation(
    (userId) => apiClient.post(`/users/${userId}/suspend/`, {}),
    { invalidateKeys: ['users'], onSuccess: () => { toast.success('User suspended'); setDrawerUser(null); refetchUsers(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const activateMutation = useApiMutation(
    (userId) => apiClient.post(`/users/${userId}/activate/`, {}),
    { invalidateKeys: ['users'], onSuccess: () => { toast.success('User activated'); setDrawerUser(null); refetchUsers(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const resendInviteMutation = useApiMutation(
    (id) => apiClient.post(`/invitations/${id}/resend/`, {}),
    { onSuccess: () => { toast.success('Invitation resent'); refetchInvitations(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const revokeInviteMutation = useApiMutation(
    (id) => apiClient.post(`/invitations/${id}/revoke/`, {}),
    { invalidateKeys: ['invitations'], onSuccess: () => { toast.success('Invitation revoked'); refetchInvitations(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const impersonateRequestMutation = useApiMutation(
    ({ userId, reason }) => apiClient.post(`/users/${userId}/impersonation_preview/`, { reason }),
    { onSuccess: (d) => { toast.success(`Request #${d.data?.request?.id} logged — awaiting approval`); setImpersonationModal(false); setImpersonationReason(''); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const impersonationDecideMutation = useApiMutation(
    ({ id, action }) => apiClient.post(`/impersonation-requests/${id}/${action}/`, {}),
    { onSuccess: (_, vars) => { toast.success(`Request ${vars.action === 'deny' ? 'denied' : 'approved'}`); refetchImpersonation(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  function exportUsers() {
    const rows = users.map(u => `${u.id},${displayName(u)},${u.email || ''},${u.is_active ? 'active' : 'suspended'}`).join('\n');
    const blob = new Blob([`id,name,email,status\n${rows}`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hanmak-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('User CSV exported');
  }

  const isLoading = loadingUsers || loadingMemberships || loadingInvitations;

  const drawerUserSessions = drawerUser ? sessions.filter(s => s.user === drawerUser.id) : [];
  const drawerMembership = drawerUser ? membershipByUser.get(drawerUser.id) : null;
  const drawerHasMfa = drawerUser ? mfaUsers.has(drawerUser.id) : false;

  const orgId = orgs[0]?.id || '';
  const filteredTeams = teams.filter(t => !inviteForm.organization || t.organization === Number(inviteForm.organization));
  const filteredRoles = roles.filter(r => !inviteForm.organization || r.organization === Number(inviteForm.organization));
  const createFilteredTeams = teams.filter(t => !createForm.organization || t.organization === Number(createForm.organization));
  const createFilteredRoles = roles.filter(r => !createForm.organization || r.organization === Number(createForm.organization));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Users</h1>
          <p className="page-subtitle">Live user accounts, invitations, roles, teams, MFA, SSO, and admin actions</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => { setImpersonationQueueModal(true); refetchImpersonation(); }}>Impersonation Requests</button>
          <button className="btn btn-ghost" onClick={exportUsers}>Export</button>
          <button className="btn btn-ghost" onClick={() => { setCreateForm({ email: '', first_name: '', last_name: '', username: '', display_name: '', role: 'signer', custom_role: '', team: '', organization: String(orgId), temporary_password: '' }); setSetupMode('setup_email'); setCreateModal(true); }}>Create User</button>
          <button className="btn btn-primary" onClick={() => { setInviteForm({ email: '', full_name: '', role: 'signer', custom_role: '', team: '', message: '', organization: String(orgId) }); setInviteModal(true); }}>Invite User</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {stats.map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-toolbar">
          <div className="flex gap-2">
            <input
              className="form-input table-search"
              placeholder="Search users..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 260 }}
            />
            <select className="form-input" style={{ width: 150 }} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
              <option value="">All Roles</option>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r === 'super_admin' ? 'Super Admin' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <select className="form-input" style={{ width: 150 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>

        {isLoading ? <Spinner center /> : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}><input type="checkbox" /></th>
                <th>User</th>
                <th>Role</th>
                <th>Team</th>
                <th>Status</th>
                <th>Last Active</th>
                <th>MFA</th>
                <th>SSO</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allRows.length === 0 ? (
                <tr><td colSpan={9}><EmptyState title="No matching users" message="Try adjusting your filters" /></td></tr>
              ) : allRows.map(row => {
                if (row.type === 'user') {
                  const { user, membership, session, hasMfa } = row;
                  const name = displayName(user);
                  const role = membership?.role || 'viewer';
                  return (
                    <tr key={`u-${user.id}`} onClick={() => setDrawerUser(user)} style={{ cursor: 'pointer' }}>
                      <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                      <td>
                        <div className="flex" style={{ alignItems: 'center', gap: '0.625rem' }}>
                          <Avatar name={name} size={36} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email || user.username}</div>
                          </div>
                        </div>
                      </td>
                      <td><Badge color={roleColor(role)}>{membership?.custom_role_name || (role === 'super_admin' ? 'Super Admin' : role.charAt(0).toUpperCase() + role.slice(1))}</Badge></td>
                      <td style={{ fontSize: '0.8125rem' }}>{membership?.team_name || '-'}</td>
                      <td><Badge color={user.is_active ? 'success' : 'danger'}>{user.is_active ? 'active' : 'suspended'}</Badge></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{session?.last_seen_at ? formatDate(session.last_seen_at) : '-'}</td>
                      <td><span style={{ fontSize: '0.8rem', color: hasMfa ? 'var(--success)' : 'var(--danger)' }}>{hasMfa ? 'On' : 'Off'}</span></td>
                      <td><span style={{ fontSize: '0.8rem', color: user.sso_enabled ? 'var(--success)' : 'var(--text-muted)' }}>{user.sso_enabled ? 'Yes' : '-'}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDrawerUser(user)}>View</button>
                          <button className="btn btn-ghost btn-sm" title="Request impersonation access (audited)" onClick={() => { setImpersonationTargetId(user.id); setImpersonationTargetName(displayName(user)); setImpersonationReason(''); setImpersonationModal(true); }}>Impersonate</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => resetPasswordMutation.mutate(user.id)}>Reset Pwd</button>
                        </div>
                      </td>
                    </tr>
                  );
                } else {
                  const { invitation } = row;
                  const name = invitation.full_name || 'Pending invite';
                  return (
                    <tr key={`i-${invitation.id}`}>
                      <td><input type="checkbox" /></td>
                      <td>
                        <div className="flex" style={{ alignItems: 'center', gap: '0.625rem' }}>
                          <Avatar name={name} size={36} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{invitation.email}</div>
                          </div>
                        </div>
                      </td>
                      <td><Badge color={roleColor(invitation.role)}>{invitation.custom_role_name || (invitation.role === 'super_admin' ? 'Super Admin' : (invitation.role || 'signer').charAt(0).toUpperCase() + (invitation.role || 'signer').slice(1))}</Badge></td>
                      <td style={{ fontSize: '0.8125rem' }}>{invitation.team_name || '-'}</td>
                      <td><Badge color="warning">pending</Badge></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(invitation.sent_at || invitation.created_at)}</td>
                      <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span></td>
                      <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span></td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn btn-ghost btn-sm" onClick={() => resendInviteMutation.mutate(invitation.id)}>Resend</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => revokeInviteMutation.mutate(invitation.id)}>Revoke</button>
                        </div>
                      </td>
                    </tr>
                  );
                }
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* User Drawer */}
      <Drawer open={!!drawerUser} onClose={() => setDrawerUser(null)} title={drawerUser ? displayName(drawerUser) : ''}>
        {drawerUser && (
          <div>
            <div className="flex" style={{ alignItems: 'center', gap: '1rem', paddingBottom: '1.25rem', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
              <Avatar name={displayName(drawerUser)} size={64} />
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{displayName(drawerUser)}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{drawerUser.email || drawerUser.username}</div>
                <Badge color={drawerUser.is_active ? 'success' : 'danger'}>{drawerUser.is_active ? 'active' : 'suspended'}</Badge>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[
                ['Role', drawerMembership?.role ? (drawerMembership.role === 'super_admin' ? 'Super Admin' : drawerMembership.role.charAt(0).toUpperCase() + drawerMembership.role.slice(1)) : '-'],
                ['Custom Role', drawerMembership?.custom_role_name || '-'],
                ['Team', drawerMembership?.team_name || '-'],
                ['Organization', drawerMembership?.organization_name || '-'],
                ['Member Since', drawerMembership?.joined_at ? formatDate(drawerMembership.joined_at) : '-'],
                ['Last Login', drawerUserSessions[0]?.last_seen_at ? formatDate(drawerUserSessions[0].last_seen_at) : '-'],
                ['MFA', drawerHasMfa ? 'Enabled' : 'Not enabled'],
                ['SSO', drawerUser.sso_enabled ? 'Detected' : 'Not detected'],
              ].map(([k, v]) => (
                <div key={k} className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                  <span style={{ fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ fontWeight: 700, margin: '1.25rem 0 0.5rem' }}>Active Sessions</div>
            {drawerUserSessions.length ? drawerUserSessions.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
                <span>{s.ip_address || 'unknown IP'}</span>
                <Badge color={s.revoked_at ? 'secondary' : 'success'}>{s.revoked_at ? 'revoked' : 'active'}</Badge>
              </div>
            )) : <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No sessions recorded</div>}
            <div className="flex gap-2" style={{ marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => resetPasswordMutation.mutate(drawerUser.id)}>Reset Password</button>
              <button className="btn btn-ghost btn-sm" onClick={() => cancelTokensMutation.mutate(drawerUser.id)}>Cancel Setup Tokens</button>
              <button className="btn btn-ghost btn-sm" onClick={() => revokeSessionsMutation.mutate(drawerUser.id)}>Revoke Sessions</button>
              {drawerUser.is_active
                ? <button className="btn btn-danger btn-sm" onClick={() => suspendMutation.mutate(drawerUser.id)}>Suspend</button>
                : <button className="btn btn-primary btn-sm" onClick={() => activateMutation.mutate(drawerUser.id)}>Activate</button>}
            </div>
          </div>
        )}
      </Drawer>

      {/* Invite User Modal */}
      <Modal
        open={inviteModal}
        onClose={() => setInviteModal(false)}
        title="Invite User"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setInviteModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={inviteMutation.isPending} onClick={() => {
              if (!inviteForm.email) return toast.error('Email is required');
              inviteMutation.mutate({ ...inviteForm, organization: Number(inviteForm.organization) || orgId, custom_role: inviteForm.custom_role || null, team: inviteForm.team || null });
            }}>Send Invite</button>
          </>
        }
      >
        {orgs.length > 1 && (
          <div className="form-group">
            <label className="form-label">Organization</label>
            <select className="form-input" value={inviteForm.organization} onChange={e => setInviteForm(f => ({ ...f, organization: e.target.value }))}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-group"><label className="form-label">Email Address *</label><input className="form-input" type="email" placeholder="colleague@yourorg.com" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Full Name</label><input className="form-input" placeholder="Jane Smith" value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} /></div>
        <div className="form-group">
          <label className="form-label">Role</label>
          <select className="form-input" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))}>
            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r === 'super_admin' ? 'Super Admin' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Custom Role</label>
          <select className="form-input" value={inviteForm.custom_role} onChange={e => setInviteForm(f => ({ ...f, custom_role: e.target.value }))}>
            <option value="">No custom role</option>
            {filteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Team</label>
          <select className="form-input" value={inviteForm.team} onChange={e => setInviteForm(f => ({ ...f, team: e.target.value }))}>
            <option value="">No team</option>
            {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Welcome Message</label><textarea className="form-input" rows={2} placeholder="Welcome to HanMak." value={inviteForm.message} onChange={e => setInviteForm(f => ({ ...f, message: e.target.value }))} /></div>
      </Modal>

      {/* Create User Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create User"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createUserMutation.isPending} onClick={() => {
              if (!createForm.email) return toast.error('Email is required');
              createUserMutation.mutate({ ...createForm, organization: Number(createForm.organization) || orgId, custom_role: createForm.custom_role || null, team: createForm.team || null, setup_mode: setupMode });
            }}>Create User</button>
          </>
        }
      >
        {orgs.length > 1 && (
          <div className="form-group">
            <label className="form-label">Organization</label>
            <select className="form-input" value={createForm.organization} onChange={e => setCreateForm(f => ({ ...f, organization: e.target.value }))}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        )}
        <div className="form-group"><label className="form-label">Email Address *</label><input className="form-input" type="email" placeholder="colleague@yourorg.com" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} /></div>
        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group"><label className="form-label">First Name</label><input className="form-input" placeholder="Jane" value={createForm.first_name} onChange={e => setCreateForm(f => ({ ...f, first_name: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Last Name</label><input className="form-input" placeholder="Smith" value={createForm.last_name} onChange={e => setCreateForm(f => ({ ...f, last_name: e.target.value }))} /></div>
        </div>
        <div className="form-group"><label className="form-label">Username</label><input className="form-input" placeholder="auto from email" value={createForm.username} onChange={e => setCreateForm(f => ({ ...f, username: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Display Name</label><input className="form-input" placeholder="Jane Smith" value={createForm.display_name} onChange={e => setCreateForm(f => ({ ...f, display_name: e.target.value }))} /></div>
        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">Role</label>
            <select className="form-input" value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value }))}>
              {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r === 'super_admin' ? 'Super Admin' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Custom Role</label>
            <select className="form-input" value={createForm.custom_role} onChange={e => setCreateForm(f => ({ ...f, custom_role: e.target.value }))}>
              <option value="">No custom role</option>
              {createFilteredRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Team</label>
          <select className="form-input" value={createForm.team} onChange={e => setCreateForm(f => ({ ...f, team: e.target.value }))}>
            <option value="">No team</option>
            {createFilteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Setup Method</label>
          <select className="form-input" value={setupMode} onChange={e => setSetupMode(e.target.value)}>
            <option value="setup_email">Send setup email</option>
            <option value="temporary_password">Set temporary password</option>
          </select>
        </div>
        {setupMode === 'temporary_password' && (
          <div className="form-group"><label className="form-label">Temporary Password</label><input className="form-input" type="password" placeholder="At least 8 characters" value={createForm.temporary_password} onChange={e => setCreateForm(f => ({ ...f, temporary_password: e.target.value }))} /></div>
        )}
      </Modal>

      {/* Impersonation Request Modal */}
      <Modal
        open={impersonationModal}
        onClose={() => setImpersonationModal(false)}
        title="Request Impersonation Access"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setImpersonationModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={impersonateRequestMutation.isPending} onClick={() => {
              if (!impersonationReason.trim()) return toast.error('A reason is required');
              impersonateRequestMutation.mutate({ userId: impersonationTargetId, reason: impersonationReason });
            }}>Submit Audited Request</button>
          </>
        }
      >
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>{impersonationTargetName}</p>
        <div className="alert alert-warning" style={{ display: 'flex', gap: '0.625rem', background: '#fef9c3', border: '1px solid #ca8a04', borderRadius: 7, padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8125rem' }}>
          <strong>Session switching requires approval.</strong> This creates an audited request requiring a second admin to approve.
        </div>
        <div className="form-group">
          <label className="form-label">Reason for Access *</label>
          <textarea className="form-input" rows={3} placeholder="Describe the support scenario..." value={impersonationReason} onChange={e => setImpersonationReason(e.target.value)} />
        </div>
      </Modal>

      {/* Impersonation Queue Modal */}
      <Modal
        open={impersonationQueueModal}
        onClose={() => setImpersonationQueueModal(false)}
        title="Impersonation Requests"
        size="xl"
        footer={<button className="btn btn-ghost" onClick={() => setImpersonationQueueModal(false)}>Close</button>}
      >
        {impersonationRequests.length === 0 ? (
          <EmptyState title="No impersonation requests" message="No pending requests" />
        ) : (
          <table className="table">
            <thead>
              <tr><th>Target</th><th>Requester</th><th>Status</th><th>Reason</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {impersonationRequests.map(req => (
                <tr key={req.id}>
                  <td>{req.target_username || req.target_user}</td>
                  <td>{req.requester_username || req.requester}</td>
                  <td><Badge color={statusColor(req.status)}>{req.status}</Badge></td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{req.reason || ''}</td>
                  <td>
                    {req.status === 'requested' && (
                      <div className="flex gap-1">
                        <button className="btn btn-primary btn-sm" onClick={() => impersonationDecideMutation.mutate({ id: req.id, action: 'approve' })}>Approve</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => impersonationDecideMutation.mutate({ id: req.id, action: 'deny' })}>Deny</button>
                      </div>
                    )}
                    {(req.status === 'approved' || req.status === 'active') && (
                      <button className="btn btn-primary btn-sm" onClick={() => toast.info('Start impersonation from the API or CLI')}>Start</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </div>
  );
}
