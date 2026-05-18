import { useState, useCallback } from 'react';
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

const RESOURCES = [
  'Envelopes', 'Templates', 'Signatures', 'Approvals',
  'Users', 'Teams', 'Roles', 'Billing',
  'API Keys', 'Webhooks', 'Audit Trail', 'Settings',
];
const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'admin'];

function resourceKey(resource) {
  return resource.toLowerCase().replace(/ /g, '_');
}

function permKey(resource, action) {
  return `${resourceKey(resource)}:${action}`;
}

export default function Roles() {
  const toast = useToast();
  const activeOrgId = parseInt(localStorage.getItem('HANMAK_ORGANIZATION_ID') || '0');

  const [selectedRole,      setSelectedRole]      = useState(null);
  const [createModal,       setCreateModal]        = useState(false);
  const [createForm,        setCreateForm]         = useState({ name: '', description: '' });
  const [confirmDelete,     setConfirmDelete]      = useState(null);
  // localPermissions is a Set of permission key strings (e.g. "envelopes:view" or "*")
  const [localPermissions,  setLocalPermissions]   = useState(() => new Set());
  const [loadingDetail,     setLoadingDetail]      = useState(false);

  const { data: rolesData, isLoading, refetch: refetchRoles } = useApiQuery(['roles'], EP.ROLES);

  const roles = rolesData?.results ?? [];

  // ── Fetch role detail and populate localPermissions ────────────────────────

  const loadRoleDetail = useCallback(async (role) => {
    setLoadingDetail(true);
    try {
      const res = await apiClient.get(EP.ROLE(role.id));
      const detail = res.data;
      const perms = Array.isArray(detail.permissions) ? detail.permissions : [];
      setSelectedRole(detail);
      setLocalPermissions(new Set(perms));
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  const handleSelectRole = useCallback((role) => {
    loadRoleDetail(role);
  }, [loadRoleDetail]);

  const handleResetPermissions = useCallback(() => {
    if (!selectedRole) return;
    loadRoleDetail(selectedRole);
  }, [selectedRole, loadRoleDetail]);

  // ── Toggle a single permission key ────────────────────────────────────────

  const togglePerm = useCallback((key) => {
    setLocalPermissions(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createRoleMutation = useApiMutation(
    (payload) => apiClient.post(EP.ROLES, payload),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => {
        toast.success('Role created');
        setCreateModal(false);
        setCreateForm({ name: '', description: '' });
        refetchRoles();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const savePermsMutation = useApiMutation(
    ({ id, permissions }) => apiClient.patch(EP.ROLE(id), { permissions }),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => {
        toast.success('Permissions saved');
        refetchRoles();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteRoleMutation = useApiMutation(
    (id) => apiClient.delete(EP.ROLE(id)),
    {
      invalidateKeys: ['roles'],
      onSuccess: () => {
        toast.success('Role deleted');
        setConfirmDelete(null);
        setSelectedRole(null);
        setLocalPermissions(new Set());
        refetchRoles();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleSavePermissions = useCallback(() => {
    if (!selectedRole) return;
    savePermsMutation.mutate({
      id: selectedRole.id,
      permissions: [...localPermissions],
    });
  }, [selectedRole, localPermissions, savePermsMutation]);

  const handleCreateRole = useCallback(() => {
    if (!createForm.name.trim()) return toast.error('Role name is required');
    createRoleMutation.mutate({
      organization: activeOrgId,
      name: createForm.name.trim(),
      description: createForm.description.trim(),
      is_system: false,
      permissions: [],
    });
  }, [createForm, activeOrgId, createRoleMutation, toast]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) return <Spinner center />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Roles &amp; Permissions</h1>
          <p className="page-subtitle">Live custom role records and permission matrix</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => { setCreateForm({ name: '', description: '' }); setCreateModal(true); }}
        >
          + Create Role
        </button>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem' }}>

        {/* ── Left Sidebar — Role List ─────────────────────────────────────── */}
        <div className="card" style={{ padding: '1rem', height: 'fit-content' }}>
          {roles.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No roles yet</div>
          ) : (
            roles.map(role => (
              <div
                key={role.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.625rem',
                  padding: '0.5rem 0.625rem',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: selectedRole?.id === role.id ? 'var(--primary-light)' : '',
                  color: selectedRole?.id === role.id ? 'var(--primary)' : 'var(--text-secondary)',
                  marginBottom: 2,
                  fontSize: '0.875rem',
                }}
                onClick={() => handleSelectRole(role)}
              >
                {/* Shield icon (inline SVG) */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {role.name}
                </span>
                {role.is_system ? (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>System</span>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '2px 4px', color: 'var(--danger)', flexShrink: 0 }}
                    title="Delete role"
                    onClick={e => { e.stopPropagation(); setConfirmDelete(role); }}
                  >
                    {/* Trash icon */}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
          <button
            className="btn btn-ghost btn-sm"
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={() => { setCreateForm({ name: '', description: '' }); setCreateModal(true); }}
          >
            + New Role
          </button>
        </div>

        {/* ── Right Panel — Permission Matrix ─────────────────────────────── */}
        <div className="card">
          {loadingDetail ? (
            <div style={{ padding: '2rem' }}><Spinner center /></div>
          ) : !selectedRole ? (
            <div style={{ padding: '2rem' }}>
              <EmptyState
                title="Select a role to view its permission matrix"
                message="Choose a role from the left sidebar to view and edit its permissions"
              />
            </div>
          ) : (
            <>
              {/* Matrix Header */}
              <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>
                  {selectedRole.name} — Permission Matrix
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  {selectedRole.description || 'Custom role'}
                </div>
              </div>

              {/* Scrollable permission table */}
              <div style={{ overflowX: 'auto' }}>
                <table className="table perm-matrix">
                  <thead>
                    <tr>
                      <th>Resource</th>
                      {ACTIONS.map(a => (
                        <th key={a} style={{ textAlign: 'center' }}>
                          {a.charAt(0).toUpperCase() + a.slice(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {RESOURCES.map(resource => (
                      <tr key={resource}>
                        <td style={{ fontWeight: 500 }}>{resource}</td>
                        {ACTIONS.map(action => {
                          const key = permKey(resource, action);
                          const checked = localPermissions.has('*') || localPermissions.has(key);
                          return (
                            <td key={action} style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                className="role-permission-box"
                                data-permission={key}
                                checked={checked}
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

              {/* Matrix Footer */}
              <div style={{
                padding: '1.25rem',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
              }}>
                <button
                  className="btn btn-ghost"
                  onClick={handleResetPermissions}
                  disabled={loadingDetail}
                >
                  Reset
                </button>
                <button
                  className="btn btn-primary"
                  disabled={savePermsMutation.isPending}
                  onClick={handleSavePermissions}
                >
                  {savePermsMutation.isPending ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Create Role Modal ────────────────────────────────────────────────── */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create Custom Role"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createRoleMutation.isPending}
              onClick={handleCreateRole}
            >
              {createRoleMutation.isPending ? 'Creating…' : 'Create Role'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Role Name *</label>
          <input
            className="form-input"
            placeholder="Finance Approver"
            value={createForm.name}
            onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={2}
            value={createForm.description}
            onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ── Delete Role Confirm ──────────────────────────────────────────────── */}
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
