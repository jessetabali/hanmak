import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import { useAuthStore } from '../../store/authStore';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const EDITIONS = ['community', 'pro', 'enterprise'];
const ALL_FEATURES = [
  { key: 'sso', label: 'Single Sign-On (SSO)' },
  { key: 'audit_trail', label: 'Audit Trail' },
  { key: 'legal_holds', label: 'Legal Holds' },
  { key: 'retention_policies', label: 'Retention Policies' },
  { key: 'data_residency', label: 'Data Residency' },
  { key: 'evidence_bundles', label: 'Evidence Bundles' },
  { key: 'advanced_workflows', label: 'Advanced Workflows' },
  { key: 'api_access', label: 'API Access' },
  { key: 'custom_branding', label: 'Custom Branding' },
  { key: 'saml', label: 'SAML' },
];

export default function License() {
  const toast = useToast();
  const { user } = useAuthStore?.() || {};
  const isSuperAdmin = user?.is_superuser || user?.is_staff;

  const [activateKey, setActivateKey] = useState('');
  const [generateModal, setGenerateModal] = useState(false);
  const [genForm, setGenForm] = useState({ edition: 'pro', features: [], expires_at: '' });

  const { data, isLoading, refetch } = useApiQuery(['license'], EP.LICENSE_KEYS);
  const license = data?.results?.[0] ?? data;

  const activateMutation = useApiMutation(
    (key) => apiClient.post(`${EP.LICENSE_KEYS}activate/`, { key }),
    {
      invalidateKeys: ['license'],
      onSuccess: () => { toast.success('License activated'); setActivateKey(''); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generateMutation = useApiMutation(
    (payload) => apiClient.post(`${EP.LICENSE_KEYS}generate/`, payload),
    {
      invalidateKeys: ['license'],
      onSuccess: (res) => {
        toast.success('License generated');
        setGenerateModal(false);
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleActivate = useCallback(() => {
    if (!activateKey.trim()) { toast.error('Enter a license key'); return; }
    activateMutation.mutate(activateKey.trim());
  }, [activateKey, activateMutation, toast]);

  const handleGenerate = useCallback(() => {
    generateMutation.mutate({
      edition: genForm.edition,
      features: genForm.features,
      expires_at: genForm.expires_at || undefined,
    });
  }, [genForm, generateMutation]);

  const toggleFeature = (key) => {
    setGenForm(f => ({
      ...f,
      features: f.features.includes(key) ? f.features.filter(k => k !== key) : [...f.features, key],
    }));
  };

  const licenseStatus = license?.status || (license?.is_active ? 'active' : 'inactive');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">License</h1>
          <p className="page-subtitle">License key details and feature entitlements</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          {isSuperAdmin && (
            <button className="btn btn-primary" onClick={() => setGenerateModal(true)}>Generate License</button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Spinner center />
      ) : !license ? (
        <EmptyState title="No license found" message="Activate a license key to unlock enterprise features." />
      ) : (
        <div className="flex flex-col gap-4">
          {/* License Details Card */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Edition</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'capitalize' }}>
                  {license.edition || license.plan || 'Community'}
                </div>
              </div>
              <Badge color={statusColor(licenseStatus)}>{licenseStatus}</Badge>
            </div>

            <div className="flex flex-col gap-0">
              {[
                ['License Key', license.key ? <code className="mono" style={{ fontSize: '0.8125rem' }}>{license.key}</code> : '—'],
                ['Organization', license.organization_name || license.organization || '—'],
                ['Issued Date', formatDate(license.issued_at || license.created_at)],
                ['Expiry Date', license.expires_at ? formatDate(license.expires_at) : 'Never'],
                ['Licensed Seats', license.max_seats || license.seats || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Features Card */}
          {(license.features?.length > 0) && (
            <div className="card" style={{ padding: '1.5rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Licensed Features</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                {ALL_FEATURES.map((f) => {
                  const enabled = license.features?.includes(f.key) || license.features?.some(lf => (typeof lf === 'string' ? lf : lf.key) === f.key);
                  return (
                    <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0', fontSize: '0.875rem' }}>
                      <span style={{ color: enabled ? 'var(--success)' : 'var(--text-muted)', fontSize: '1rem' }}>{enabled ? '✓' : '○'}</span>
                      <span style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{f.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Activate License Section */}
      <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Activate License</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Enter a valid license key to activate enterprise features.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="form-input"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            style={{ flex: 1, fontFamily: 'var(--font-mono)' }}
          />
          <button className="btn btn-primary" disabled={activateMutation.isPending || !activateKey.trim()} onClick={handleActivate}>
            {activateMutation.isPending ? 'Activating…' : 'Activate'}
          </button>
        </div>
      </div>

      {/* Generate License Modal (super admin only) */}
      {isSuperAdmin && (
        <Modal
          open={generateModal}
          onClose={() => setGenerateModal(false)}
          title="Generate License Key"
          size="lg"
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setGenerateModal(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={generateMutation.isPending} onClick={handleGenerate}>
                {generateMutation.isPending ? 'Generating…' : 'Generate'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Edition</label>
            <select className="form-input" value={genForm.edition} onChange={(e) => setGenForm(f => ({ ...f, edition: e.target.value }))}>
              {EDITIONS.map(ed => <option key={ed} value={ed} style={{ textTransform: 'capitalize' }}>{ed.charAt(0).toUpperCase() + ed.slice(1)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date (leave empty for no expiry)</label>
            <input className="form-input" type="date" value={genForm.expires_at} onChange={(e) => setGenForm(f => ({ ...f, expires_at: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Features</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
              {ALL_FEATURES.map((f) => (
                <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', padding: '0.25rem 0' }}>
                  <input
                    type="checkbox"
                    checked={genForm.features.includes(f.key)}
                    onChange={() => toggleFeature(f.key)}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
