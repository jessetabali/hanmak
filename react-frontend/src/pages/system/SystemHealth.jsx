import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// ── Helpers ───────────────────────────────────────────────────────────────────

function checkColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'healthy' || s === 'ok' || s === 'pass') return 'success';
  if (s === 'degraded' || s === 'warning') return 'warning';
  if (s === 'down' || s === 'fail' || s === 'error') return 'danger';
  return 'secondary';
}

function severityColor(severity) {
  const s = (severity || '').toLowerCase();
  if (s === 'critical') return 'danger';
  if (s === 'major') return 'danger';
  if (s === 'minor') return 'warning';
  if (s === 'maintenance') return 'secondary';
  return 'secondary';
}

function incidentStatusColor(status) {
  if (status === 'resolved') return 'success';
  if (status === 'investigating') return 'danger';
  if (status === 'monitoring') return 'warning';
  return 'secondary';
}

// ── Create Incident Modal ─────────────────────────────────────────────────────

function CreateIncidentModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState({
    title: '',
    severity: 'minor',
    description: '',
    affected_components: '',
  });

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.INCIDENTS, payload),
    {
      invalidateKeys: ['incidents'],
      onSuccess: () => {
        toast.success('Incident created');
        setForm({ title: '', severity: 'minor', description: '', affected_components: '' });
        onCreated?.();
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const submit = () => {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    mutation.mutate({
      title: form.title.trim(),
      severity: form.severity,
      description: form.description,
      affected_components: form.affected_components
        ? form.affected_components.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      status: 'investigating',
      started_at: new Date().toISOString(),
    });
  };

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create Incident"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Creating…' : 'Create Incident'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Title <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="form-input" placeholder="Email delivery delay" value={form.title} onChange={set('title')} />
      </div>
      <div className="form-group">
        <label className="form-label">Severity</label>
        <select className="form-input" value={form.severity} onChange={set('severity')}>
          <option value="maintenance">Maintenance</option>
          <option value="minor">Minor</option>
          <option value="major">Major</option>
          <option value="critical">Critical</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Affected Components</label>
        <input
          className="form-input"
          placeholder="email, api, database (comma-separated)"
          value={form.affected_components}
          onChange={set('affected_components')}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={3} value={form.description} onChange={set('description')} placeholder="Describe the incident…" />
      </div>
    </Modal>
  );
}

// ── Incident Detail Drawer ────────────────────────────────────────────────────

function IncidentDrawer({ incident, onClose }) {
  return (
    <Drawer open={!!incident} onClose={onClose} title={incident?.title || 'Incident'} width={480}>
      {incident && (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Badge color={incidentStatusColor(incident.status)}>{incident.status}</Badge>
            <Badge color={severityColor(incident.severity)}>{incident.severity}</Badge>
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            {[
              ['Title', incident.title],
              ['Status', incident.status],
              ['Severity', incident.severity],
              ['Started', incident.started_at ? formatDateTime(incident.started_at) : '—'],
              ['Resolved', incident.resolved_at ? formatDateTime(incident.resolved_at) : '—'],
              ['Components', Array.isArray(incident.affected_components) ? incident.affected_components.join(', ') : incident.affected_components || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ fontSize: '0.875rem' }}>{value}</span>
              </div>
            ))}
          </div>

          {incident.description && (
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Description</div>
              <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {incident.description}
              </p>
            </div>
          )}

          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onClose}>Close</button>
        </div>
      )}
    </Drawer>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function HealthChecksTab({ checks, isLoading, runningChecks, onRunCheck, onRunAll }) {
  if (isLoading) return <Spinner center />;

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600 }}>Service Health Checks</div>
        <button className="btn btn-primary btn-sm" onClick={onRunAll}>
          ↺ Run All Checks
        </button>
      </div>

      {checks.length === 0 ? (
        <EmptyState title="No health checks" message="No health checks configured." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
          {checks.map((check) => (
            <div
              key={check.id || check.name}
              style={{
                padding: '1rem',
                border: `1px solid ${check.status === 'healthy' || check.status === 'ok' ? 'var(--border)' : check.status === 'degraded' ? '#fbbf24' : '#ef4444'}`,
                borderRadius: '8px',
                background: 'var(--bg-card)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{check.name}</div>
                <Badge color={checkColor(check.status)}>{check.status || 'unknown'}</Badge>
              </div>

              {check.response_time_ms != null && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Response: <span className="mono">{check.response_time_ms}ms</span>
                </div>
              )}

              {check.checked_at && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Last checked: {formatDateTime(check.checked_at)}
                </div>
              )}

              {check.message && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', lineHeight: 1.5 }}>
                  {check.message}
                </div>
              )}

              {check.id && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '0.25rem' }}
                  disabled={runningChecks.has(check.id)}
                  onClick={() => onRunCheck(check.id)}
                >
                  {runningChecks.has(check.id) ? 'Running…' : '↺ Run Check'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IncidentsTab({ incidents, isLoading, onResolve, onViewDetail, onCreate }) {
  if (isLoading) return <Spinner center />;

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600 }}>Incidents</div>
        <button className="btn btn-danger btn-sm" onClick={onCreate}>
          + Create Incident
        </button>
      </div>

      {incidents.length === 0 ? (
        <EmptyState title="No incidents" message="No incidents recorded. All systems are operational." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Severity</th>
              <th>Status</th>
              <th>Started</th>
              <th>Resolved</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((incident) => (
              <tr
                key={incident.id}
                style={{ cursor: 'pointer' }}
                onClick={() => onViewDetail(incident)}
              >
                <td style={{ fontWeight: 500 }}>{incident.title}</td>
                <td><Badge color={severityColor(incident.severity)}>{incident.severity}</Badge></td>
                <td><Badge color={incidentStatusColor(incident.status)}>{incident.status}</Badge></td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {incident.started_at ? formatDateTime(incident.started_at) : '—'}
                </td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {incident.resolved_at ? formatDateTime(incident.resolved_at) : '—'}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  {incident.status !== 'resolved' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => onResolve(incident.id)}
                    >
                      ✓ Resolve
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function DeploymentTab({ readinessData, isLoading }) {
  const { data: apmData, isLoading: apmLoading } = useApiQuery(
    ['apm-config'],
    '/health-checks/apm-config/',
    {},
    { retry: false }
  );

  if (isLoading) return <Spinner center />;

  const checks = readinessData?.checks ?? [];
  const passed = checks.filter((c) => c.status === 'pass' || c.status === 'healthy').length;
  const failed = checks.filter((c) => c.status !== 'pass' && c.status !== 'healthy').length;
  const allPass = failed === 0 && checks.length > 0;

  return (
    <div style={{ padding: '1.25rem' }}>
      {/* Overall readiness */}
      <div
        style={{
          padding: '0.875rem 1.25rem',
          borderRadius: '8px',
          marginBottom: '1.5rem',
          background: allPass ? '#dcfce7' : checks.length === 0 ? 'var(--bg-secondary)' : '#fef2f2',
          border: `1px solid ${allPass ? 'var(--success)' : checks.length === 0 ? 'var(--border)' : 'var(--danger)'}`,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: '50%',
            background: allPass ? 'var(--success)' : checks.length === 0 ? 'var(--text-muted)' : 'var(--danger)',
            flexShrink: 0,
          }}
        />
        <div>
          <div style={{ fontWeight: 700, color: allPass ? 'var(--success)' : checks.length === 0 ? 'var(--text-secondary)' : 'var(--danger)' }}>
            {checks.length === 0 ? 'Readiness data unavailable' : allPass ? 'Deployment Ready' : `${failed} check${failed !== 1 ? 's' : ''} failing`}
          </div>
          {checks.length > 0 && (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {passed} passing · {failed} failing · {checks.length} total
            </div>
          )}
        </div>
      </div>

      {/* Checks table */}
      {checks.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: '1.5rem' }}>
          <div style={{ padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.875rem' }}>
            Readiness Checks
          </div>
          <table className="table">
            <thead>
              <tr><th>Check</th><th>Status</th><th>Message</th></tr>
            </thead>
            <tbody>
              {checks.map((check, i) => (
                <tr key={check.key || check.name || i}>
                  <td>
                    <code className="mono" style={{ fontSize: '0.8125rem' }}>{check.key || check.name}</code>
                  </td>
                  <td>
                    <Badge color={checkColor(check.status)}>{check.status}</Badge>
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {check.message || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* APM Config */}
      <div className="card" style={{ padding: '1.25rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.875rem' }}>APM Configuration</div>
        {apmLoading ? <Spinner /> : (
          apmData ? (
            <>
              {[
                ['Provider', apmData.provider || 'none'],
                ['DSN', apmData.dsn ? apmData.dsn.slice(0, 20) + '••••••' : '—'],
                ['Status', apmData.runtime_status?.configured ? 'Configured' : 'Not configured'],
                ['Trace Sample Rate', apmData.trace_sample_rate != null ? `${Number(apmData.trace_sample_rate).toFixed(2)}` : '—'],
                ['External Alerts', apmData.external_alerts_configured ? 'Configured' : 'Not configured'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 500 }}>{value}</span>
                </div>
              ))}
            </>
          ) : (
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>APM configuration unavailable.</div>
          )
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('checks');
  const [createIncidentModal, setCreateIncidentModal] = useState(false);
  const [incidentDrawer, setIncidentDrawer] = useState(null);
  const [runningChecks, setRunningChecks] = useState(new Set());

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useApiQuery(
    ['health-summary'],
    EP.HEALTH_SUMMARY,
    {},
    { refetchInterval: 30000 }
  );

  const { data: incidentsData, isLoading: incidentsLoading, refetch: refetchIncidents } = useApiQuery(
    ['incidents'],
    EP.INCIDENTS
  );

  const { data: readinessData, isLoading: readinessLoading } = useApiQuery(
    ['deployment-readiness'],
    '/health-checks/deployment-readiness/',
    {},
    { retry: false }
  );

  const checks = healthData?.checks ?? [];
  const incidents = incidentsData?.results ?? incidentsData ?? [];
  const healthy = healthData?.overall_status === 'healthy';

  const runAllMutation = useApiMutation(
    () => apiClient.post('/health-checks/run_checks/'),
    {
      invalidateKeys: ['health-summary'],
      onSuccess: () => { toast.success('Health checks updated'); refetchHealth(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const runCheckMutation = useApiMutation(
    (id) => apiClient.post(EP.HEALTH_CHECK_RUN(id)),
    {
      invalidateKeys: ['health-summary'],
      onSuccess: (_res, id) => {
        toast.success('Check completed');
        setRunningChecks((prev) => { const next = new Set(prev); next.delete(id); return next; });
        refetchHealth();
      },
      onError: (e, id) => {
        toast.error(e.response?.data?.detail || e.message);
        setRunningChecks((prev) => { const next = new Set(prev); next.delete(id); return next; });
      },
    }
  );

  const resolveMutation = useApiMutation(
    (id) => apiClient.post(`/incidents/${id}/resolve/`),
    {
      invalidateKeys: ['incidents'],
      onSuccess: () => { toast.success('Incident resolved'); refetchIncidents(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleRunCheck = useCallback((id) => {
    setRunningChecks((prev) => new Set([...prev, id]));
    runCheckMutation.mutate(id);
  }, [runCheckMutation]);

  const handleRunAll = useCallback(() => {
    runAllMutation.mutate();
  }, [runAllMutation]);

  const metrics = healthData?.metrics || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">System Health</h1>
          <p className="page-subtitle">Real-time infrastructure status, health checks, and incidents</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setCreateIncidentModal(true)}>
            ⚠ New Incident
          </button>
          <button className="btn btn-primary" onClick={handleRunAll} disabled={runAllMutation.isPending}>
            {runAllMutation.isPending ? 'Running…' : '↺ Run Health Check'}
          </button>
        </div>
      </div>

      {/* Overall status banner */}
      {!healthLoading && healthData && (
        <div
          style={{
            background: healthy ? '#dcfce7' : '#fef2f2',
            border: `1px solid ${healthy ? 'var(--success)' : 'var(--danger)'}`,
            borderRadius: '10px',
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: healthy ? 'var(--success)' : 'var(--danger)',
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: healthy ? 'var(--success)' : 'var(--danger)' }}>
              {healthy ? 'All Systems Operational' : healthData.overall_status === 'degraded' ? 'System Degraded' : 'System Outage'}
            </div>
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {healthData.checked_at ? `Last checked: ${formatDateTime(healthData.checked_at)}` : 'No check recorded yet'}
              {checks.length > 0 && ` · ${checks.filter((c) => checkColor(c.status) === 'success').length}/${checks.length} checks healthy`}
            </div>
          </div>
          <Badge color={healthy ? 'success' : 'danger'}>{healthData.overall_status || 'unknown'}</Badge>
        </div>
      )}

      {/* Stats row */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {[
          ['Healthy Checks', checks.filter((c) => checkColor(c.status) === 'success').length],
          ['Degraded', checks.filter((c) => checkColor(c.status) === 'warning').length],
          ['Down', checks.filter((c) => checkColor(c.status) === 'danger').length],
          ['Open Incidents', incidents.filter((i) => i.status !== 'resolved').length],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ borderBottom: '1px solid var(--border)', padding: '0 1rem' }}>
          {[
            ['checks', 'Health Checks'],
            ['incidents', 'Incidents'],
            ['deployment', 'Deployment Readiness'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`tab${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
              {id === 'incidents' && incidents.filter((i) => i.status !== 'resolved').length > 0 && (
                <span className="badge badge-danger" style={{ marginLeft: '0.375rem', fontSize: '0.68rem' }}>
                  {incidents.filter((i) => i.status !== 'resolved').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'checks' && (
          <HealthChecksTab
            checks={checks}
            isLoading={healthLoading}
            runningChecks={runningChecks}
            onRunCheck={handleRunCheck}
            onRunAll={handleRunAll}
          />
        )}

        {activeTab === 'incidents' && (
          <IncidentsTab
            incidents={incidents}
            isLoading={incidentsLoading}
            onResolve={(id) => resolveMutation.mutate(id)}
            onViewDetail={setIncidentDrawer}
            onCreate={() => setCreateIncidentModal(true)}
          />
        )}

        {activeTab === 'deployment' && (
          <DeploymentTab
            readinessData={readinessData}
            isLoading={readinessLoading}
          />
        )}
      </div>

      {/* Create Incident Modal */}
      <CreateIncidentModal
        open={createIncidentModal}
        onClose={() => setCreateIncidentModal(false)}
        onCreated={refetchIncidents}
      />

      {/* Incident Detail Drawer */}
      <IncidentDrawer
        incident={incidentDrawer}
        onClose={() => setIncidentDrawer(null)}
      />
    </div>
  );
}
