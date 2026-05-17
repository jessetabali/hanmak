import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const BACKENDS = [
  { value: 's3', label: 'AWS S3' },
  { value: 'minio', label: 'MinIO' },
  { value: 'azure', label: 'Azure Blob' },
  { value: 'local', label: 'Local Disk' },
];

const REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1'];

function bytesLabel(bytes) {
  const n = Number(bytes || 0);
  if (!n) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = n;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) { size /= 1024; unit++; }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

export default function Storage() {
  const toast = useToast();
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id;

  const { data: storageData, isLoading: loadingStorage } = useApiQuery(
    ['storage-settings', orgId],
    EP.STORAGE_SETTINGS,
    { params: orgId ? { organization: orgId } : {} },
    { enabled: !!orgId }
  );

  const { data: healthData } = useApiQuery(['health-summary'], EP.HEALTH_SUMMARY);

  const [backend, setBackend] = useState('local');
  const [form, setForm] = useState({ bucket_name: '', endpoint_url: '', region: 'us-east-1' });
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const s = storageData?.results?.[0] || storageData;
    if (s && !initialized) {
      setBackend(s.backend || 'local');
      setForm({ bucket_name: s.bucket_name || '', endpoint_url: s.endpoint_url || '', region: s.region || 'us-east-1' });
      setInitialized(true);
    }
  }, [storageData, initialized]);

  const saveMutation = useApiMutation(
    (payload) => apiClient.post(EP.STORAGE_SETTINGS, payload),
    {
      invalidateKeys: ['storage-settings'],
      onSuccess: () => toast.success('Storage settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  async function testConnection() {
    try {
      const { data } = await apiClient.get(EP.HEALTH_SUMMARY);
      const m = data.metrics || {};
      const configured = m.object_storage_configured ? 'configured' : 'not configured';
      const reachable = m.minio_reachable === null || m.minio_reachable === undefined
        ? 'not checked'
        : (m.minio_reachable ? 'reachable' : 'unreachable');
      toast.success(`Storage check: object storage ${configured} · MinIO ${reachable}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  const metrics = healthData?.metrics || {};
  const usedBytes = Number(metrics.used_bytes || 0);
  const totalBytes = Number(metrics.total_bytes || 0);
  const freeBytes = Number(metrics.free_bytes || 0);
  const usedPercent = Number(metrics.used_percent || 0);
  const safePercent = Math.min(100, Math.max(0, usedPercent));

  const encryptionRows = [
    ['Encryption at Rest', 'Enabled', 'success'],
    ['Storage Backend', backend.charAt(0).toUpperCase() + backend.slice(1), 'secondary'],
    ['Object Storage Credentials', metrics.object_storage_configured ? 'Configured in environment' : 'Not configured', metrics.object_storage_configured ? 'success' : 'secondary'],
    ['MinIO Health', metrics.minio_reachable === true ? `Reachable${metrics.minio_latency_ms ? ` · ${metrics.minio_latency_ms}ms` : ''}` : metrics.minio_reachable === false ? 'Unreachable' : 'Not checked', metrics.minio_reachable === false ? 'danger' : metrics.minio_reachable === true ? 'success' : 'secondary'],
  ];

  if (loadingStorage && !initialized) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Storage</h1>
          <p className="page-subtitle">Configure document storage backend and encryption</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={testConnection}>Test Connection</button>
          <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate({ organization: orgId, backend, bucket_name: form.bucket_name, endpoint_url: form.endpoint_url, region: form.region, encrypt_at_rest: true })}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Backend Selection */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Storage Provider</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {BACKENDS.map(b => (
              <div key={b.value} onClick={() => setBackend(b.value)} style={{ padding: '0.875rem', border: `2px solid ${backend === b.value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', background: backend === b.value ? 'var(--primary-light, #dbeafe)' : '' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{b.label}</div>
                {backend === b.value && <Badge color="primary" style={{ fontSize: '0.7rem', marginTop: 4 }}>Active</Badge>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">AWS Region / Endpoint Region</label>
              <select className="form-input" value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Bucket Name</label><input className="form-input" value={form.bucket_name} onChange={e => setForm(f => ({ ...f, bucket_name: e.target.value }))} /></div>
          </div>
          <div className="form-group">
            <label className="form-label">Endpoint URL (MinIO / custom S3-compatible)</label>
            <input className="form-input" placeholder="https://minio.yourhost.com" value={form.endpoint_url} onChange={e => setForm(f => ({ ...f, endpoint_url: e.target.value }))} />
          </div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Note: AWS credentials (access key, secret) are configured via environment variables, not stored here.</p>
        </div>

        {/* Encryption */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Encryption &amp; Health</h3>
          {encryptionRows.map(([label, value, color]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.875rem' }}>{label}</span>
              <Badge color={color}>{value}</Badge>
            </div>
          ))}
        </div>

        {/* Usage */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Usage</h3>
          {totalBytes > 0 ? (
            <>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.875rem' }}>
                  <span>{bytesLabel(usedBytes)} used</span>
                  <span style={{ color: 'var(--text-muted)' }}>of {bytesLabel(totalBytes)}</span>
                </div>
                <div style={{ height: 10, background: 'var(--border)', borderRadius: 5 }}>
                  <div style={{ width: `${safePercent}%`, height: '100%', background: safePercent > 80 ? 'var(--danger)' : safePercent > 60 ? 'var(--warning)' : 'var(--primary)', borderRadius: 5 }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8125rem' }}>
                {[
                  ['Free Space', bytesLabel(freeBytes)],
                  ['Used Percent', totalBytes ? `${safePercent.toFixed(1)}%` : 'n/a'],
                  ['Media Root', metrics.media_root || 'n/a'],
                  ['Object Endpoint', metrics.object_storage_endpoint || metrics.minio_endpoint || 'n/a'],
                ].map(([cat, size]) => (
                  <div key={cat} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{cat}</div>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={size}>{size}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No storage metrics available. Click "Test Connection" to check.</div>
          )}
        </div>
      </div>
    </div>
  );
}
