import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const PERMISSION_RESOURCES = ['Envelopes', 'Templates', 'Signatures', 'Approvals', 'Users', 'Teams', 'Roles', 'Billing', 'API Keys', 'Webhooks', 'Audit Trail', 'Settings'];
const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'admin'];

function permKey(resource, action) {
  return `${resource.toLowerCase().replace(/ /g, '_')}:${action}`;
}

export default function Roles() {
  const toast = useToast();
  const [selectedRole, setSelectedRole] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [checkedPerms, setCheckedPerms] = useState({});

  const { data: rolesData, isLoading, refetch: refetchRoles } = useApiQuery(['roles'], EP.ROLES);
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);

  const roles = rolesData?.results ?? [];
  const orgs = orgsData?.results ?? [];
  const orgId = orgs[0]?.id;

  function selectRole(role) {
    setSelectedRole(role);
    const perms = Array.isArray(role.permissions) ? role.permissions : [];
    const map = {};
    PERMISSION_RESOURCES.forEach(resource => {
      PERMISSION_ACTIONS.forEach(action => {
        const key = permKey(resource, action);
        map[key] = perms.includes('*') || perms.includes(key);
      });
    });
    setCheckedPerms(map);
  }

  const createRoleMutation = useApiMutation(
    (payload) => apiClient.post(EP.ROLES, payload),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => { toast.success('Role created'); setCreateModal(false); setCreateForm({ name: '', description: '' }); refetchRoles(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const savePermsMutation = useApiMutation(
    ({ id, permissions }) => apiClient.patch(EP.ROLE(id), { permissions }),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => { toast.success('Permissions saved'); refetchRoles(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteRoleMutation = useApiMutation(
    (id) => apiClient.delete(EP.ROLE(id)),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => { toast.success('Role deleted'); setConfirmDelete(null); setSelectedRole(null); refetchRoles(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  function handleSavePermissions() {
    if (!selectedRole) return;
    const permissions = Object.entries(checkedPerms).filter(([, v]) => v).map(([k]) => k);
    savePermsMutation.mutate({ id: selectedRole.id, permissions });
  }

  function togglePerm(key) {
    setCheckedPerms(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles &amp; Permissions</h1>
          <p className="page-subtitle">Live custom role records and permission matrix</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setCreateForm({ name: '', description: '' }); setCreateModal(true); }}>+ Create Role</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>
        {/* Role List Sidebar */}
        <div className="card" style={{ padding: '1rem', height: 'fit-content' }}>
          {roles.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No roles yet</div>
          ) : roles.map(role => (
            <div
              key={role.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.625rem',
                padding: '0.5rem 0.625rem', borderRadius: 6, cursor: 'pointer',
                background: selectedRole?.id === role.id ? 'var(--primary-light)' : '',
                color: selectedRole?.id === role.id ? 'var(--primary)' : 'var(--text-secondary)',
                marginBottom: 2, fontSize: '0.875rem',
              }}
              onClick={() => selectRole(role)}
            >
              <span style={{ flex: 1 }}>{role.name}</span>
              {role.is_system
                ? <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>System</span>
                : <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 4px', color: 'var(--danger)' }}
                    onClick={e => { e.stopPropagation(); setConfirmDelete(role); }}
                  >×</button>}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: '0.5rem' }} onClick={() => { setCreateForm({ name: '', description: '' }); setCreateModal(true); }}>+ New Role</button>
        </div>

        {/* Permission Matrix */}
        <div className="card">
          {!selectedRole ? (
            <div style={{ padding: '2rem' }}>
              <EmptyState title="Select a role" message="Choose a role from the left to view and edit its permissions" />
            </div>
          ) : (
            <>
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{selectedRole.name} — Permission Matrix</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>{selectedRole.description || 'Custom role'}</div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table perm-matrix">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      {PERMISSION_ACTIONS.map(a => <th key={a} style={{ textAlign: 'center' }}>{a.charAt(0).toUpperCase() + a.slice(1)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_RESOURCES.map(resource => (
                      <tr key={resource}>
                        <td style={{ fontWeight: 500 }}>{resource}</td>
                        {PERMISSION_ACTIONS.map(action => {
                          const key = permKey(resource, action);
                          return (
                            <td key={action} style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={!!checkedPerms[key]}
                                onChange={() => togglePerm(key)}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button className="btn btn-ghost" onClick={() => selectRole(selectedRole)}>Reset</button>
                <button className="btn btn-primary" disabled={savePermsMutation.isPending} onClick={handleSavePermissions}>
                  {savePermsMutation.isPending ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create Role Modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Create Custom Role"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={createRoleMutation.isPending} onClick={() => {
            if (!createForm.name.trim()) return toast.error('Role name is required');
            createRoleMutation.mutate({ organization: orgId, name: createForm.name.trim(), description: createForm.description.trim(), is_system: false, permissions: [] });
          }}>Create Role</button>
        </>}>
        <div className="form-group"><label className="form-label">Role Name *</label><input className="form-input" placeholder="Finance Approver" value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} /></div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && deleteRoleMutation.mutate(confirmDelete.id)}
        title="Delete Role"
        message={`Delete "${confirmDelete?.name}"? Members assigned this role will revert to their base membership role. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
