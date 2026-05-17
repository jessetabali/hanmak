import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const RESOURCE_TYPES = [
  { value: 'envelopes', label: 'Envelopes' },
  { value: 'documents', label: 'Documents' },
  { value: 'audit_events', label: 'Audit Events' },
  { value: 'signatures', label: 'Signatures' },
];

const ACTIONS = [
  { value: 'archive', label: 'Archive' },
  { value: 'delete', label: 'Delete' },
  { value: 'flag_for_review', label: 'Flag for Review' },
];

export default function Retention() {
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // holds id to delete
  const [form, setForm] = useState({
    name: '',
    description: '',
    resource_type: 'envelopes',
    retention_days: 365,
    action_after: 'archive',
  });

  const { data, isLoading, refetch } = useApiQuery(['retention-policies'], EP.RETENTION_POLICIES);
  const policies = data?.results ?? [];

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.RETENTION_POLICIES, payload),
    {
      invalidateKeys: ['retention-policies'],
      onSuccess: () => {
        toast.success('Retention policy created');
        setCreateModal(false);
        setForm({ name: '', description: '', resource_type: 'envelopes', retention_days: 365, action_after: 'archive' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleMutation = useApiMutation(
    ({ id, is_active }) => apiClient.patch(`${EP.RETENTION_POLICIES}${id}/`, { is_active }),
    {
      invalidateKeys: ['retention-policies'],
      onSuccess: () => toast.success('Policy updated'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(`${EP.RETENTION_POLICIES}${id}/`),
    {
      invalidateKeys: ['retention-policies'],
      onSuccess: () => { toast.success('Policy deleted'); setConfirmDelete(null); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreate = useCallback(() => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.retention_days || form.retention_days < 1) { toast.error('Retention period must be at least 1 day'); return; }
    createMutation.mutate({
      name: form.name.trim(),
      description: form.description,
      resource_type: form.resource_type,
      retention_days: Number(form.retention_days),
      action_after: form.action_after,
    });
  }, [form, createMutation, toast]);

  const actionLabel = (val) => ACTIONS.find(a => a.value === val)?.label || val;
  const resourceLabel = (val) => RESOURCE_TYPES.find(r => r.value === val)?.label || val;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Retention Policies</h1>
          <p className="page-subtitle">Automatic document lifecycle rules</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>+ New Policy</button>
        </div>
      </div>

      {isLoading ? (
        <Spinner center />
      ) : policies.length === 0 ? (
        <EmptyState title="No retention policies" message="Create a policy to automatically archive or delete old records." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Resource Type</th>
                <th>Retention Days</th>
                <th>Action After</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{policy.name}</div>
                    {policy.description && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{policy.description}</div>}
                  </td>
                  <td>{resourceLabel(policy.resource_type)}</td>
                  <td>{policy.retention_days} days</td>
                  <td>{actionLabel(policy.action_after)}</td>
                  <td>
                    <Badge color={policy.is_active ? 'success' : 'secondary'}>
                      {policy.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td>{formatDate(policy.created_at)}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={toggleMutation.isPending}
                        onClick={() => toggleMutation.mutate({ id: policy.id, is_active: !policy.is_active })}
                      >
                        {policy.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmDelete(policy.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="New Retention Policy"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? 'Creating…' : 'Create Policy'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input className="form-input" placeholder="e.g. 7-Year Envelope Archive" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} placeholder="Brief description" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Resource Type</label>
            <select className="form-input" value={form.resource_type} onChange={(e) => setForm(f => ({ ...f, resource_type: e.target.value }))}>
              {RESOURCE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Retention Period (days)</label>
            <input className="form-input" type="number" min={1} value={form.retention_days} onChange={(e) => setForm(f => ({ ...f, retention_days: e.target.value }))} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Action After Retention</label>
          <select className="form-input" value={form.action_after} onChange={(e) => setForm(f => ({ ...f, action_after: e.target.value }))}>
            {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete)}
        title="Delete Policy"
        message="Delete this retention policy? This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
