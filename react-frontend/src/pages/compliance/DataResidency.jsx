import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const RESOURCE_TYPES = [
  { value: 'envelopes', label: 'Envelopes' },
  { value: 'documents', label: 'Documents' },
  { value: 'signatures', label: 'Signatures' },
  { value: 'audit', label: 'Audit Events' },
];

export default function DataResidency() {
  const toast = useToast();
  const [createPolicyModal, setCreatePolicyModal] = useState(false);
  const [form, setForm] = useState({ resource_type: 'envelopes', region: '' });
  const [enforcementPending, setEnforcementPending] = useState(false);

  const { data: regionsData, isLoading: regionsLoading } = useApiQuery(['residency-regions'], EP.DATA_RESIDENCY_REGIONS);
  const { data: policiesData, isLoading: policiesLoading, refetch: refetchPolicies } = useApiQuery(['residency-policies'], EP.DATA_RESIDENCY_POLICIES);
  const { data: summaryData, refetch: refetchSummary } = useApiQuery(['residency-summary'], EP.DATA_RESIDENCY_POLICIES + 'summary/');

  const regions = regionsData?.results ?? regionsData ?? [];
  const policies = policiesData?.results ?? policiesData ?? [];

  const isEnforcementEnabled = summaryData?.enforcement_enabled ?? false;
  const compliantCount = summaryData?.compliant ?? 0;
  const nonCompliantCount = summaryData?.non_compliant ?? 0;

  const createPolicyMutation = useApiMutation(
    (payload) => apiClient.post(EP.DATA_RESIDENCY_POLICIES, payload),
    {
      invalidateKeys: ['residency-policies', 'residency-summary'],
      onSuccess: () => {
        toast.success('Data residency policy created');
        setCreatePolicyModal(false);
        setForm({ resource_type: 'envelopes', region: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreatePolicy = useCallback(() => {
    if (!form.region) { toast.error('Please select a region'); return; }
    createPolicyMutation.mutate({ resource_type: form.resource_type, region: form.region });
  }, [form, createPolicyMutation, toast]);

  const handleEnforcementToggle = useCallback(async () => {
    setEnforcementPending(true);
    try {
      await apiClient.patch(EP.APP_SETTINGS, {
        namespace: 'residency',
        key: 'enforcement',
        value: { enabled: !isEnforcementEnabled },
      });
      toast.success(`Enforcement ${!isEnforcementEnabled ? 'enabled' : 'disabled'}`);
      refetchSummary();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setEnforcementPending(false);
    }
  }, [isEnforcementEnabled, refetchSummary, toast]);

  const resourceLabel = (val) => RESOURCE_TYPES.find(r => r.value === val)?.label || val;
  const regionName = (id) => {
    const r = regions.find(reg => reg.id === id || reg.code === id || String(reg.id) === String(id));
    return r ? (r.name || r.code || r.label || id) : id;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Data Residency</h1>
          <p className="page-subtitle">Region policies and enforcement settings</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => { refetchPolicies(); refetchSummary(); }}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreatePolicyModal(true)}>+ New Policy</button>
        </div>
      </div>

      {/* Summary Card */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Compliant</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success)' }}>{compliantCount}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Non-Compliant</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: nonCompliantCount > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{nonCompliantCount}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Enforcement</span>
              <Badge color={isEnforcementEnabled ? 'success' : 'secondary'}>
                {isEnforcementEnabled ? 'Enabled' : 'Disabled'}
              </Badge>
            </div>
            <button
              className={`btn ${isEnforcementEnabled ? 'btn-ghost' : 'btn-primary'} btn-sm`}
              disabled={enforcementPending}
              onClick={handleEnforcementToggle}
            >
              {enforcementPending ? 'Updating…' : (isEnforcementEnabled ? 'Disable Enforcement' : 'Enable Enforcement')}
            </button>
          </div>
        </div>
      </div>

      {/* Regions Section */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>Available Regions</h2>
        {regionsLoading ? (
          <Spinner center />
        ) : regions.length === 0 ? (
          <EmptyState title="No regions available" message="No data residency regions have been configured." />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {regions.map((region) => (
              <div key={region.id || region.code} className="card" style={{ padding: '1rem' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{region.name || region.label || region.code}</div>
                {region.code && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }} className="mono">{region.code}</div>}
                <Badge color={region.is_active !== false ? 'success' : 'secondary'}>
                  {region.is_active !== false ? 'Available' : 'Unavailable'}
                </Badge>
                {region.description && (
                  <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{region.description}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policies Section */}
      <div>
        <h2 style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '1rem' }}>Residency Policies</h2>
        {policiesLoading ? (
          <Spinner center />
        ) : policies.length === 0 ? (
          <EmptyState title="No residency policies" message="Create a policy to restrict where data is stored." />
        ) : (
          <div className="card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Resource Type</th>
                  <th>Region</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>{resourceLabel(policy.resource_type)}</td>
                    <td>{regionName(policy.region)}</td>
                    <td>
                      <Badge color={policy.is_active !== false ? 'success' : 'secondary'}>
                        {policy.is_active !== false ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {policy.created_at ? new Date(policy.created_at).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Policy Modal */}
      <Modal
        open={createPolicyModal}
        onClose={() => setCreatePolicyModal(false)}
        title="New Residency Policy"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreatePolicyModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createPolicyMutation.isPending} onClick={handleCreatePolicy}>
              {createPolicyMutation.isPending ? 'Creating…' : 'Create Policy'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Resource Type</label>
          <select className="form-input" value={form.resource_type} onChange={(e) => setForm(f => ({ ...f, resource_type: e.target.value }))}>
            {RESOURCE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Region <span style={{ color: 'var(--danger)' }}>*</span></label>
          <select className="form-input" value={form.region} onChange={(e) => setForm(f => ({ ...f, region: e.target.value }))}>
            <option value="">Select a region…</option>
            {regions.map(r => (
              <option key={r.id || r.code} value={r.id || r.code}>{r.name || r.label || r.code}</option>
            ))}
          </select>
        </div>
      </Modal>
    </div>
  );
}
