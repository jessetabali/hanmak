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

const EDITIONS = [
  { value: 'community', label: 'Community' },
  { value: 'pro', label: 'Pro' },
  { value: 'enterprise', label: 'Enterprise' },
];

const ALL_FEATURES = [
  { key: 'sso', label: 'Single Sign-On (SSO)' },
  { key: 'scim', label: 'SCIM Provisioning' },
  { key: 'ldap', label: 'LDAP / Active Directory' },
  { key: 'audit_trail', label: 'Audit Trail' },
  { key: 'data_residency', label: 'Data Residency' },
  { key: 'webhooks', label: 'Webhooks' },
  { key: 'custom_roles', label: 'Custom Roles' },
  { key: 'compliance_exports', label: 'Compliance Exports' },
];

function editionBadgeColor(edition) {
  const e = String(edition || '').toLowerCase();
  if (e === 'enterprise') return 'warning';
  if (e === 'pro') return 'primary';
  return 'secondary'; // community
}

function featureEnabled(license, key) {
  const features = license?.features ?? [];
  return features.some((f) => (typeof f === 'string' ? f : f.key || f.name) === key);
}

export default function License() {
  const toast = useToast();
  const { user } = useAuthStore?.() || {};
  const isSuperAdmin =
    user?.is_superuser ||
    user?.is_staff ||
    user?.role === 'super_admin' ||
    (Array.isArray(user?.roles) && user.roles.includes('super_admin'));

  const [activateKey, setActivateKey] = useState('');
  const [activateModal, setActivateModal] = useState(false);
  const [generateModal, setGenerateModal] = useState(false);
  const [revealModal, setRevealModal] = useState({ open: false, key: '' });
  const [genForm, setGenForm] = useState({ edition: 'pro', features: [], expires_at: '' });

  const { data, isLoading, refetch } = useApiQuery(['license'], EP.LICENSE_KEYS);
  const license = data?.results?.[0] ?? (Array.isArray(data) ? data[0] : data) ?? null;

  const activateMutation = useApiMutation(
    (key) => apiClient.post(`${EP.LICENSE_KEYS}activate/`, { key }),
    {
      invalidateKeys: ['license'],
      onSuccess: () => {
        toast.success('License activated successfully');
        setActivateKey('');
        setActivateModal(false);
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generateMutation = useApiMutation(
    (payload) => apiClient.post(`${EP.LICENSE_KEYS}generate/`, payload),
    {
      invalidateKeys: ['license'],
      onSuccess: (res) => {
        const generatedKey = res?.data?.key ?? res?.key ?? '';
        toast.success('License key generated');
        setGenerateModal(false);
        setGenForm({ edition: 'pro', features: [], expires_at: '' });
        refetch();
        if (generatedKey) {
          setRevealModal({ open: true, key: generatedKey });
        }
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
    setGenForm((f) => ({
      ...f,
      features: f.features.includes(key)
        ? f.features.filter((k) => k !== key)
        : [...f.features, key],
    }));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success('Copied to clipboard'),
      () => toast.error('Copy failed — please select and copy manually')
    );
  };

  const licenseKey = license?.key ?? '';
  const keyPreview = licenseKey ? licenseKey.slice(0, 12) + '…' : '—';
  const licenseStatus = license?.status ?? (license?.is_active ? 'active' : license ? 'inactive' : null);
  const licenseEdition = license?.edition ?? license?.plan ?? 'community';

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
            <button className="btn btn-primary" onClick={() => setGenerateModal(true)}>
              Generate License
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Spinner center />
      ) : !license ? (
        <EmptyState
          title="No license found"
          message="Activate a license key below to unlock enterprise features."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {/* License Details Card */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem', gap: '1rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.35rem' }}>
                  Edition
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, textTransform: 'capitalize' }}>
                    {licenseEdition}
                  </span>
                  <Badge color={editionBadgeColor(licenseEdition)}>
                    {licenseEdition}
                  </Badge>
                </div>
              </div>
              {licenseStatus && (
                <Badge color={statusColor(licenseStatus)}>
                  {licenseStatus}
                </Badge>
              )}
            </div>

            <div>
              {[
                [
                  'License Key',
                  licenseKey ? (
                    <div key="key" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <code className="mono" style={{ fontSize: '0.8125rem' }}>{keyPreview}</code>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                        onClick={() => copyToClipboard(licenseKey)}
                        title="Copy full key"
                      >
                        Copy
                      </button>
                    </div>
                  ) : '—',
                ],
                ['Licensed To', license.organization_name || license.organization || license.licensed_to || '—'],
                ['Issued', license.issued_at ? formatDate(license.issued_at) : license.created_at ? formatDate(license.created_at) : '—'],
                ['Expires', license.expires_at ? formatDate(license.expires_at) : 'Never'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.875rem',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                  <span style={{ textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Edition Features Card */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Licensed Features</div>
            {ALL_FEATURES.length === 0 || !license.features?.length ? (
              <EmptyState title="No licensed features" message="Upgrade your license to unlock additional features." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.5rem' }}>
                {ALL_FEATURES.map((f) => {
                  const enabled = featureEnabled(license, f.key);
                  return (
                    <div
                      key={f.key}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.375rem 0', fontSize: '0.875rem' }}
                    >
                      <span style={{ color: enabled ? 'var(--success)' : 'var(--text-muted)', fontSize: '1rem', flexShrink: 0 }}>
                        {enabled ? '✓' : '○'}
                      </span>
                      <span style={{ color: enabled ? 'var(--text-primary)' : 'var(--text-muted)' }}>{f.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activate License Card */}
      <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Activate License Key</div>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem', marginTop: 0 }}>
          Enter a valid license key to activate or upgrade enterprise features.
        </p>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            className="form-input"
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={activateKey}
            onChange={(e) => setActivateKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleActivate()}
            style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)' }}
          />
          <button
            className="btn btn-primary"
            disabled={activateMutation.isPending || !activateKey.trim()}
            onClick={handleActivate}
          >
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
            <select
              className="form-input"
              value={genForm.edition}
              onChange={(e) => setGenForm((f) => ({ ...f, edition: e.target.value }))}
            >
              {EDITIONS.map((ed) => (
                <option key={ed.value} value={ed.value}>{ed.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Date (leave empty for no expiry)</label>
            <input
              className="form-input"
              type="date"
              value={genForm.expires_at}
              onChange={(e) => setGenForm((f) => ({ ...f, expires_at: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Features</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem' }}>
              {ALL_FEATURES.map((f) => (
                <label
                  key={f.key}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', padding: '0.25rem 0' }}
                >
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

      {/* One-time Reveal Modal */}
      <Modal
        open={revealModal.open}
        onClose={() => setRevealModal({ open: false, key: '' })}
        title="License Key Generated"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => copyToClipboard(revealModal.key)}>
              Copy Key
            </button>
            <button className="btn btn-primary" onClick={() => setRevealModal({ open: false, key: '' })}>
              Done
            </button>
          </>
        }
      >
        <div className="alert alert-warning" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          This key will only be shown once. Copy it now and store it securely.
        </div>
        <div style={{ padding: '0.875rem', background: 'var(--bg-secondary)', borderRadius: 8, wordBreak: 'break-all' }}>
          <code className="mono" style={{ fontSize: '0.875rem', userSelect: 'all' }}>{revealModal.key}</code>
        </div>
      </Modal>
    </div>
  );
}
