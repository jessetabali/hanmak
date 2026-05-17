import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const TABS = [
  { id: 'risks', label: 'Risk Findings' },
  { id: 'policies', label: 'Policy Rules' },
  { id: 'logs', label: 'API Logs' },
  { id: 'outbox', label: 'Event Outbox' },
  { id: 'grants', label: 'OAuth Grants' },
  { id: 'flags', label: 'Feature Flags' },
  { id: 'search', label: 'Search Index' },
];

function methodColor(method) {
  const m = (method || '').toUpperCase();
  if (m === 'GET') return 'primary';
  if (m === 'POST') return 'success';
  if (m === 'PATCH' || m === 'PUT') return 'warning';
  if (m === 'DELETE') return 'danger';
  return 'secondary';
}

function CreatePolicyModal({ onClose }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [resource, setResource] = useState('envelope');
  const [action, setAction] = useState('create');
  const [condition, setCondition] = useState('{}');

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.POLICY_RULES, payload),
    {
      invalidateKeys: ['policy-rules'],
      onSuccess: () => { toast.success('Policy rule created'); onClose(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const submit = () => {
    if (!name.trim()) return toast.error('Policy rule name is required');
    let config = {};
    try { config = JSON.parse(condition); } catch { return toast.error('Condition must be valid JSON'); }
    mutation.mutate({ name: name.trim(), resource, action, config, is_active: true });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create Policy Rule"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Rule'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Rule Name *</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Require signer authentication" />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Resource</label>
          <input className="form-input" value={resource} onChange={(e) => setResource(e.target.value)} placeholder="envelope" />
        </div>
        <div className="form-group">
          <label className="form-label">Action</label>
          <input className="form-input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="create" />
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Condition (JSON)</label>
        <textarea
          className="form-input mono"
          rows={4}
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}
        />
      </div>
    </Modal>
  );
}

// ── Tab panels ───────────────────────────────────────────────────────────────

function RiskFindingsTab() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['risk-findings'], EP.RISK_FINDINGS);
  const items = data?.results ?? data ?? [];

  const resolveMutation = useApiMutation(
    (id) => apiClient.post(EP.RISK_FINDING_RESOLVE(id)),
    {
      invalidateKeys: ['risk-findings'],
      onSuccess: () => { toast.success('Risk finding resolved'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;
  if (items.length === 0) return <EmptyState title="No Risk Findings" message="No risk findings recorded." />;

  return (
    <table className="table">
      <thead>
        <tr><th>Severity</th><th>Title</th><th>Description</th><th>Status</th><th>Detected</th><th></th></tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>
              <Badge color={item.severity === 'critical' ? 'danger' : item.severity === 'high' ? 'warning' : 'secondary'}>
                {item.severity}
              </Badge>
            </td>
            <td style={{ fontWeight: 600 }}>{item.title}</td>
            <td style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{item.description}</td>
            <td><Badge color={item.status === 'resolved' ? 'success' : 'secondary'}>{item.status}</Badge></td>
            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.created_at ? formatDateTime(item.created_at) : '—'}</td>
            <td>
              {item.status !== 'resolved' && (
                <button className="btn btn-ghost btn-sm" onClick={() => resolveMutation.mutate(item.id)}>
                  Resolve
                </button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PolicyRulesTab() {
  const [createModal, setCreateModal] = useState(false);
  const { data, isLoading } = useApiQuery(['policy-rules'], EP.POLICY_RULES);
  const items = data?.results ?? data ?? [];

  if (isLoading) return <Spinner center />;

  return (
    <>
      <div className="table-toolbar">
        <span style={{ fontWeight: 600 }}>Policy Rules</span>
        <button className="btn btn-primary btn-sm" onClick={() => setCreateModal(true)}>+ New Rule</button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No Policy Rules" message="No policy rules configured." />
      ) : (
        <table className="table">
          <thead>
            <tr><th>Name</th><th>Resource</th><th>Action</th><th>Status</th><th>Created</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600 }}>{item.name}</td>
                <td><code style={{ fontSize: '0.75rem' }}>{item.resource || item.rule_type || '—'}</code></td>
                <td><code style={{ fontSize: '0.75rem' }}>{item.action || '—'}</code></td>
                <td><Badge color={item.is_active ? 'success' : 'secondary'}>{item.is_active ? 'Active' : 'Disabled'}</Badge></td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.created_at ? formatDateTime(item.created_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {createModal && <CreatePolicyModal onClose={() => setCreateModal(false)} />}
    </>
  );
}

function ApiLogsTab() {
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const { data, isLoading } = useApiQuery(
    ['api-request-logs', search, methodFilter, statusFilter],
    EP.API_REQUEST_LOGS,
    { search, method: methodFilter, status_code: statusFilter }
  );
  const items = data?.results ?? data ?? [];

  if (isLoading) return <Spinner center />;

  return (
    <>
      <div className="table-toolbar">
        <div className="flex gap-2">
          <input className="form-input" style={{ width: '200px' }} placeholder="Search path…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="form-input" style={{ width: '120px' }} value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
            <option value="">All Methods</option>
            {['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className="form-input" style={{ width: '130px' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            <option value="200">2xx Success</option>
            <option value="400">4xx Error</option>
            <option value="500">5xx Error</option>
          </select>
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyState title="No API Logs" message="No API request logs recorded yet." />
      ) : (
        <table className="table">
          <thead>
            <tr><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>User</th><th>Time</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td><Badge color={methodColor(item.method)}>{item.method}</Badge></td>
                <td><code className="mono" style={{ fontSize: '0.8125rem' }}>{item.path}</code></td>
                <td>
                  <Badge color={Number(item.status_code) >= 400 ? 'danger' : 'success'}>{item.status_code}</Badge>
                </td>
                <td className="mono" style={{ fontSize: '0.8125rem' }}>{item.duration_ms || 0}ms</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.user_email || `#${item.user}` || '—'}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.created_at ? formatDateTime(item.created_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function EventOutboxTab() {
  const toast = useToast();
  const { data, isLoading } = useApiQuery(['event-outbox'], EP.EVENT_OUTBOX);
  const items = data?.results ?? data ?? [];

  const retryMutation = useApiMutation(
    (id) => apiClient.post(`/event-outbox/${id}/retry/`),
    {
      invalidateKeys: ['event-outbox'],
      onSuccess: () => toast.success('Event queued for retry'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;
  if (items.length === 0) return <EmptyState title="No Events" message="No events in the outbox." />;

  return (
    <table className="table">
      <thead>
        <tr><th>Event Type</th><th>Payload</th><th>Status</th><th>Created</th><th></th></tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td><code className="mono" style={{ fontSize: '0.8125rem' }}>{item.event_type}</code></td>
            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {JSON.stringify(item.payload).slice(0, 80)}…
            </td>
            <td>
              <Badge color={item.published_at ? 'success' : 'secondary'}>
                {item.published_at ? 'Published' : 'Pending'}
              </Badge>
            </td>
            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.created_at ? formatDateTime(item.created_at) : '—'}</td>
            <td>
              {!item.published_at && (
                <button className="btn btn-ghost btn-sm" onClick={() => retryMutation.mutate(item.id)}>Retry</button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OAuthGrantsTab() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['oauth-grants-ops'], EP.OAUTH_GRANTS);
  const items = data?.results ?? data ?? [];

  const revokeMutation = useApiMutation(
    (id) => apiClient.post(EP.OAUTH_GRANT_REVOKE(id)),
    {
      invalidateKeys: ['oauth-grants-ops'],
      onSuccess: () => { toast.success('Grant revoked'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;
  if (items.length === 0) return <EmptyState title="No OAuth Grants" message="No OAuth grants recorded." />;

  return (
    <table className="table">
      <thead>
        <tr><th>App</th><th>User</th><th>Scopes</th><th>Granted</th><th></th></tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td style={{ fontWeight: 600 }}>{item.application_name || `App #${item.application}`}</td>
            <td>{item.user_email || `User #${item.user}`}</td>
            <td>
              <div className="flex" style={{ flexWrap: 'wrap', gap: '4px' }}>
                {(item.scopes || []).map((s) => (
                  <code key={s} style={{ fontSize: '0.72rem', background: 'var(--bg-secondary)', padding: '2px 4px', borderRadius: '3px' }}>{s}</code>
                ))}
              </div>
            </td>
            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.created_at ? formatDateTime(item.created_at) : '—'}</td>
            <td>
              {!item.revoked_at ? (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => revokeMutation.mutate(item.id)}>
                  Revoke
                </button>
              ) : (
                <Badge color="danger">Revoked</Badge>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function FeatureFlagsTab() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['feature-flags-ops'], EP.FEATURE_FLAGS);
  const items = data?.results ?? data ?? [];

  const toggleMutation = useApiMutation(
    ({ id, is_enabled }) => apiClient.patch(EP.FEATURE_FLAG(id), { is_enabled }),
    {
      invalidateKeys: ['feature-flags-ops'],
      onSuccess: (_, vars) => { toast.success(`Flag ${vars.is_enabled ? 'enabled' : 'disabled'}`); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;
  if (items.length === 0) return <EmptyState title="No Feature Flags" message="No feature flags configured." />;

  return (
    <table className="table">
      <thead>
        <tr><th>Flag Key</th><th>Module</th><th>Stage</th><th>Status</th><th></th></tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td><code className="mono" style={{ fontSize: '0.8125rem' }}>{item.key}</code></td>
            <td style={{ fontSize: '0.8125rem' }}>{item.module || '—'}</td>
            <td><Badge color="secondary">{item.release_stage || '—'}</Badge></td>
            <td><Badge color={item.is_enabled ? 'success' : 'secondary'}>{item.is_enabled ? 'Enabled' : 'Disabled'}</Badge></td>
            <td>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => toggleMutation.mutate({ id: item.id, is_enabled: !item.is_enabled })}
              >
                {item.is_enabled ? 'Disable' : 'Enable'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SearchIndexTab() {
  const toast = useToast();
  const { data, isLoading } = useApiQuery(['search-index'], EP.SEARCH_INDEX);
  const items = data?.results ?? data ?? [];

  const rebuildMutation = useApiMutation(
    () => apiClient.post(EP.SEARCH_INDEX_REBUILD),
    {
      invalidateKeys: ['search-index'],
      onSuccess: (res) => toast.success(`Search index rebuilt: ${res.data?.indexed ?? 0} record(s)`),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;

  return (
    <>
      <div className="table-toolbar">
        <div>
          <span style={{ fontWeight: 600 }}>Search Index</span>
          <span style={{ marginLeft: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {data?.count ?? items.length} records
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
          {rebuildMutation.isPending ? 'Rebuilding…' : '↻ Rebuild Index'}
        </button>
      </div>
      {items.length === 0 ? (
        <EmptyState title="Empty Index" message="No records in the search index. Rebuild to populate." />
      ) : (
        <table className="table">
          <thead>
            <tr><th>Title</th><th>Type</th><th>Object ID</th><th>Weight</th><th>Last Updated</th></tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td style={{ fontWeight: 600 }}>{item.title}</td>
                <td><Badge color="secondary">{item.object_type}</Badge></td>
                <td className="mono" style={{ fontSize: '0.8125rem' }}>{item.object_id}</td>
                <td>{item.weight}</td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{item.updated_at ? formatDateTime(item.updated_at) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

// ── Stats banner ─────────────────────────────────────────────────────────────

function OpStats() {
  const { data: risks } = useApiQuery(['risk-findings-count'], EP.RISK_FINDINGS, { page_size: 1 });
  const { data: policies } = useApiQuery(['policy-rules-count'], EP.POLICY_RULES, { page_size: 1 });
  const { data: logs } = useApiQuery(['api-logs-count'], EP.API_REQUEST_LOGS, { page_size: 1 });
  const { data: outbox } = useApiQuery(['outbox-count'], EP.EVENT_OUTBOX, { page_size: 1 });
  const { data: grants } = useApiQuery(['grants-count'], EP.OAUTH_GRANTS, { page_size: 1 });
  const { data: flags } = useApiQuery(['flags-count'], EP.FEATURE_FLAGS, { page_size: 1 });

  const stats = [
    ['Risks', risks?.count ?? '—'],
    ['Policy Rules', policies?.count ?? '—'],
    ['API Logs', logs?.count ?? '—'],
    ['Outbox', outbox?.count ?? '—'],
    ['OAuth Grants', grants?.count ?? '—'],
    ['Feature Flags', flags?.count ?? '—'],
  ];

  return (
    <div className="stats-grid" style={{ '--cols': 6, marginBottom: '1.5rem' }}>
      {stats.map(([label, value]) => (
        <div key={label} className="stat-card">
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function OperationsConsole() {
  const [activeTab, setActiveTab] = useState('risks');

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Operations Console</h1>
          <p className="page-subtitle">Backend-backed risk, policy, API, webhook, permission, feature flag, and search controls</p>
        </div>
      </div>

      <OpStats />

      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ borderBottom: '1px solid var(--border)', padding: '0 1rem' }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab${activeTab === tab.id ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '0' }}>
          {activeTab === 'risks' && <RiskFindingsTab />}
          {activeTab === 'policies' && <PolicyRulesTab />}
          {activeTab === 'logs' && <ApiLogsTab />}
          {activeTab === 'outbox' && <EventOutboxTab />}
          {activeTab === 'grants' && <OAuthGrantsTab />}
          {activeTab === 'flags' && <FeatureFlagsTab />}
          {activeTab === 'search' && <SearchIndexTab />}
        </div>
      </div>
    </div>
  );
}
