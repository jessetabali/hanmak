import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Avatar from '../../components/ui/Avatar';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const ROLE_OPTIONS = ['super_admin', 'admin', 'manager', 'signer', 'viewer'];

function displayName(user) {
  return user.display_name || [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || user.email || `User #${user.id}`;
}

export default function Teams() {
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [drawerTeam, setDrawerTeam] = useState(null);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [addMemberId, setAddMemberId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const { data: teamsData, isLoading: loadingTeams, refetch: refetchTeams } = useApiQuery(['teams'], EP.TEAMS);
  const { data: membershipsData, isLoading: loadingMemberships, refetch: refetchMemberships } = useApiQuery(['memberships'], EP.MEMBERSHIPS);
  const { data: usersData } = useApiQuery(['users'], EP.USERS);
  const { data: rolesData } = useApiQuery(['roles'], EP.ROLES);
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);

  const teams = teamsData?.results ?? [];
  const memberships = membershipsData?.results ?? [];
  const users = usersData?.results ?? [];
  const roles = rolesData?.results ?? [];
  const orgs = orgsData?.results ?? [];
  const orgId = orgs[0]?.id;

  const membershipsByTeam = new Map();
  memberships.forEach(m => {
    if (!m.team) return;
    const list = membershipsByTeam.get(m.team) || [];
    list.push(m);
    membershipsByTeam.set(m.team, list);
  });

  const drawerMembers = drawerTeam ? (membershipsByTeam.get(drawerTeam.id) || []) : [];
  const drawerRoles = drawerTeam ? roles.filter(r => r.organization === drawerTeam.organization) : [];

  const createTeamMutation = useApiMutation(
    (payload) => apiClient.post(EP.TEAMS, payload),
    { invalidateKeys: ['teams'], onSuccess: () => { toast.success('Team created'); setCreateModal(false); setCreateForm({ name: '', description: '' }); refetchTeams(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const saveTeamMutation = useApiMutation(
    ({ id, ...payload }) => apiClient.patch(EP.TEAM(id), payload),
    { invalidateKeys: ['teams'], onSuccess: () => { toast.success('Team saved'); setDrawerTeam(null); refetchTeams(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const deleteTeamMutation = useApiMutation(
    (id) => apiClient.delete(EP.TEAM(id)),
    { invalidateKeys: ['teams'], onSuccess: () => { toast.success('Team deleted'); setConfirmDeleteId(null); refetchTeams(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const updateMembershipMutation = useApiMutation(
    ({ id, ...payload }) => apiClient.patch(EP.MEMBERSHIP(id), payload),
    { invalidateKeys: ['memberships'], onSuccess: () => { toast.success('Updated'); refetchMemberships(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const addMemberMutation = useApiMutation(
    (payload) => {
      const existing = memberships.find(m => m.user === payload.userId && m.organization === payload.organization);
      if (existing) {
        return apiClient.patch(EP.MEMBERSHIP(existing.id), { team: payload.team, is_active: true });
      }
      return apiClient.post(EP.MEMBERSHIPS, { user: payload.userId, organization: payload.organization, team: payload.team, role: 'signer', is_active: true });
    },
    { invalidateKeys: ['memberships'], onSuccess: () => { toast.success('Member added'); setAddMemberId(''); refetchMemberships(); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const isLoading = loadingTeams || loadingMemberships;

  function openDrawer(team) {
    setDrawerTeam(team);
    setEditForm({ name: team.name, description: team.description || '' });
    setAddMemberId('');
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Teams</h1>
          <p className="page-subtitle">Live teams, members, routing ownership, and permissions</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreateForm({ name: '', description: '' }); setCreateModal(true); }}>+ Create Team</button>
      </div>

      {isLoading ? <Spinner center /> : (
        teams.length === 0 ? (
          <EmptyState title="No teams yet" message="Create a team to group members and assign permissions" />
        ) : (
          <div className="grid-auto" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
            {teams.map(team => {
              const members = membershipsByTeam.get(team.id) || [];
              return (
                <div key={team.id} className="card" style={{ padding: '1.25rem', cursor: 'pointer' }} onClick={() => openDrawer(team)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: 4 }}>{team.name}</div>
                      <Badge color="secondary">{members.length} members</Badge>
                    </div>
                    <div className="flex gap-1">
                      <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); openDrawer(team); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={e => { e.stopPropagation(); setConfirmDeleteId(team.id); }}>Delete</button>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem', lineHeight: 1.4 }}>{team.description || 'No description'}</p>
                  <div style={{ display: 'flex', marginBottom: '0.75rem' }}>
                    {members.slice(0, 4).map(m => {
                      const u = users.find(u => u.id === m.user);
                      const name = u ? displayName(u) : `User ${m.user}`;
                      return <Avatar key={m.id} name={name} size={30} style={{ marginRight: -6, border: '2px solid var(--bg-primary)' }} />;
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>{members.length} members</span>
                    <span>Team #{team.id}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* Team Drawer */}
      <Drawer open={!!drawerTeam} onClose={() => setDrawerTeam(null)} title={drawerTeam ? `Team — ${drawerTeam.name}` : ''}>
        {drawerTeam && (
          <div>
            <div className="form-group"><label className="form-label">Team Name</label><input className="form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} /></div>

            <div style={{ fontWeight: 600, margin: '1rem 0 0.5rem' }}>Members</div>
            {drawerMembers.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No members yet</div>
            ) : drawerMembers.map(m => {
              const u = users.find(u => u.id === m.user);
              const name = u ? displayName(u) : `User ${m.user}`;
              return (
                <div key={m.id} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 120px 140px auto', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <Avatar name={name} size={32} />
                  <span style={{ fontSize: '0.875rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u?.email || u?.username || name}</span>
                  <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                    value={m.role}
                    onChange={e => updateMembershipMutation.mutate({ id: m.id, role: e.target.value })}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r === 'super_admin' ? 'Super Admin' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                  </select>
                  <select className="form-input" style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                    value={m.custom_role || ''}
                    onChange={e => updateMembershipMutation.mutate({ id: m.id, custom_role: e.target.value || null })}>
                    <option value="">No custom role</option>
                    {drawerRoles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" onClick={() => updateMembershipMutation.mutate({ id: m.id, team: null })}>X</button>
                </div>
              );
            })}

            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label className="form-label">Add Member</label>
              <select className="form-input" value={addMemberId} onChange={e => setAddMemberId(e.target.value)}>
                <option value="">Select user...</option>
                {users.map(u => <option key={u.id} value={u.id}>{displayName(u)} — {u.email || u.username}</option>)}
              </select>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => {
              if (!addMemberId) return toast.error('Select a user');
              addMemberMutation.mutate({ userId: Number(addMemberId), team: drawerTeam.id, organization: drawerTeam.organization || orgId });
            }}>+ Add Member</button>

            <div className="flex gap-2" style={{ marginTop: '1.25rem' }}>
              <button className="btn btn-primary" style={{ flex: 1 }} disabled={saveTeamMutation.isPending} onClick={() => {
                if (!editForm.name.trim()) return toast.error('Team name is required');
                saveTeamMutation.mutate({ id: drawerTeam.id, name: editForm.name.trim(), description: editForm.description.trim() });
              }}>Save</button>
              <button className="btn btn-ghost" onClick={() => setDrawerTeam(null)}>Cancel</button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Create Team Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Team"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={createTeamMutation.isPending} onClick={() => {
            if (!createForm.name.trim()) return toast.error('Team name is required');
            createTeamMutation.mutate({ organization: orgId, name: createForm.name.trim(), description: createForm.description.trim() });
          }}>Create Team</button>
        </>}>
        <div className="form-group"><label className="form-label">Team Name *</label><input className="form-input" placeholder="Legal Team" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        onConfirm={() => deleteTeamMutation.mutate(confirmDeleteId)}
        title="Delete Team"
        message="Delete this team? Members will remain in the organization without this team assignment."
        confirmLabel="Delete Team"
        danger
      />
    </div>
  );
}
