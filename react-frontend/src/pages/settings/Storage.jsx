import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const BACKENDS = [
  { value: 'local', label: 'Local' },
  { value: 's3', label: 'Amazon S3' },
  { value: 'minio', label: 'MinIO' },
  { value: 'gcs', label: 'Google Cloud Storage' },
];

const ENCRYPTION_POLICIES = [
  { value: 'none', label: 'None' },
  { value: 'server_side', label: 'Server-Side Encryption' },
  { value: 'client_side', label: 'Client-Side Encryption' },
];

const DEFAULT_FORM = {
  backend: 'local',
  bucket_name: '',
  endpoint_url: '',
  region: '',
  encryption_policy: 'none',
};

export default function Storage() {
  const toast = useToast();

  const { data: storageData, isLoading } = useApiQuery(
    ['storage-settings'],
    EP.STORAGE_SETTINGS
  );

  const { data: healthData, refetch: refetchHealth } = useApiQuery(
    ['health-summary'],
    EP.HEALTH_SUMMARY
  );

  const [form, setForm] = useState({ ...DEFAULT_FORM });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const s = storageData?.results?.[0] || storageData;
    if (s && !initialized) {
      setForm({
        backend: s.backend || 'local',
        bucket_name: s.bucket_name || '',
        endpoint_url: s.endpoint_url || '',
        region: s.region || '',
        encryption_policy: s.encryption_policy || 'none',
      });
      setInitialized(true);
    }
  }, [storageData, initialized]);

  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const saveMutation = useApiMutation(
    (payload) => apiClient.post(EP.STORAGE_SETTINGS, payload),
    {
      invalidateKeys: ['storage-settings'],
      onSuccess: () => toast.success('Storage settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  async function handleConnectionCheck() {
    try {
      await refetchHealth();
      const metrics = healthData?.metrics || {};
      const configured = metrics.object_storage_configured ? 'configured' : 'not configured';
      const reachable =
        metrics.minio_reachable === null || metrics.minio_reachable === undefined
          ? 'not checked'
          : metrics.minio_reachable
          ? 'reachable'
          : 'unreachable';
      toast.success(`Storage check: object storage ${configured} · MinIO ${reachable}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message || 'Connection check failed');
    }
  }

  const metrics = healthData?.metrics || {};
  const usedPct = Number(metrics.used_percent || 0);
  const dbSize = metrics.db_size || metrics.db_size_bytes
    ? formatBytes(metrics.db_size_bytes || metrics.db_size)
    : 'n/a';
  const diskUsagePct = usedPct > 0 ? `${usedPct.toFixed(1)}%` : 'n/a';

  const objectStorageStatus = metrics.object_storage_configured ? 'Configured' : 'Not configured';
  const objectStorageColor = metrics.object_storage_configured ? 'success' : 'secondary';

  const minioStatus =
    metrics.minio_reachable === true
      ? `Reachable${metrics.minio_latency_ms ? ` · ${metrics.minio_latency_ms}ms` : ''}`
      : metrics.minio_reachable === false
      ? 'Unreachable'
      : 'Not checked';
  const minioColor =
    metrics.minio_reachable === false
      ? 'danger'
      : metrics.minio_reachable === true
      ? 'success'
      : 'secondary';

  const needsBucket = ['s3', 'minio', 'gcs'].includes(form.backend);
  const needsEndpoint = form.backend === 'minio';
  const needsRegion = ['s3', 'gcs'].includes(form.backend);

  if (isLoading && !initialized) return <Spinner center />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
      {/* Left — Storage Configuration */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Storage Configuration</h3>
          <button
            className="btn btn-primary btn-sm"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate(form)}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div className="form-group">
          <label className="form-label">Storage Backend</label>
          <select
            className="form-input"
            value={form.backend}
            onChange={(e) => setF('backend', e.target.value)}
          >
            {BACKENDS.map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </div>

        {needsBucket && (
          <div className="form-group">
            <label className="form-label">Bucket Name</label>
            <input
              className="form-input"
              type="text"
              value={form.bucket_name}
              placeholder="my-org-documents"
              onChange={(e) => setF('bucket_name', e.target.value)}
            />
          </div>
        )}

        {needsEndpoint && (
          <div className="form-group">
            <label className="form-label">Endpoint URL</label>
            <input
              className="form-input"
              type="text"
              value={form.endpoint_url}
              placeholder="https://minio.yourhost.com"
              onChange={(e) => setF('endpoint_url', e.target.value)}
            />
          </div>
        )}

        {needsRegion && (
          <div className="form-group">
            <label className="form-label">Region</label>
            <input
              className="form-input"
              type="text"
              value={form.region}
              placeholder="us-east-1"
              onChange={(e) => setF('region', e.target.value)}
            />
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Encryption Policy</label>
          <select
            className="form-input"
            value={form.encryption_policy}
            onChange={(e) => setF('encryption_policy', e.target.value)}
          >
            {ENCRYPTION_POLICIES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        <div
          className="alert alert-info"
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1rem',
            borderRadius: 6,
            fontSize: '0.8125rem',
            background: 'var(--info-light, #dbeafe)',
            color: 'var(--info, #1d4ed8)',
            border: '1px solid var(--info, #93c5fd)',
          }}
        >
          AWS/GCS credentials should be configured via environment variables, not stored here.
        </div>
      </div>

      {/* Right — Storage Health */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Storage Health</h3>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleConnectionCheck}
          >
            Check Connection
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem' }}>Disk Usage</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{diskUsagePct}</span>
          </div>
          <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem' }}>Database Size</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{dbSize}</span>
          </div>
          <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem' }}>Object Storage</span>
            <Badge color={objectStorageColor}>{objectStorageStatus}</Badge>
          </div>
          <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '0.875rem' }}>MinIO Status</span>
            <Badge color={minioColor}>{minioStatus}</Badge>
          </div>
          {metrics.media_root && (
            <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.875rem' }}>Media Root</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={metrics.media_root}>
                {metrics.media_root}
              </span>
            </div>
          )}
          {(metrics.object_storage_endpoint || metrics.minio_endpoint) && (
            <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0' }}>
              <span style={{ fontSize: '0.875rem' }}>Object Endpoint</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={metrics.object_storage_endpoint || metrics.minio_endpoint}>
                {metrics.object_storage_endpoint || metrics.minio_endpoint}
              </span>
            </div>
          )}
        </div>

        {!healthData && (
          <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: '0.75rem' }}>
            Click "Check Connection" to load storage metrics.
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(value) {
  const n = Number(value || 0);
  if (!n) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}
