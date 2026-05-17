import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Drawer from '../../components/ui/Drawer';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';

const TEST_SUITES = [
  { suite: 'Envelope CRUD', type: 'API' },
  { suite: 'Signature Placement', type: 'UI' },
  { suite: 'Template Engine', type: 'API' },
  { suite: 'Workflow Builder', type: 'UI' },
  { suite: 'Form Builder', type: 'UI' },
  { suite: 'Webhook Delivery', type: 'Integration' },
  { suite: 'OAuth & Auth', type: 'API' },
  { suite: 'Audit Trail', type: 'API' },
  { suite: 'SSO / SAML', type: 'Integration' },
  { suite: 'Email Delivery', type: 'Integration' },
  { suite: 'Billing & Usage', type: 'API' },
  { suite: 'Data Residency', type: 'Integration' },
];

function statusColor(status) {
  if (!status) return 'secondary';
  if (status === 'succeeded' || status === 'success') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'running') return 'primary';
  return 'secondary';
}

function RunDetailDrawer({ run, onClose, onRerun, onCancel }) {
  const { data, isLoading } = useApiQuery(
    ['task-run-detail', run?.id],
    EP.TASK_RUN(run?.id),
    {},
    { enabled: !!run?.id }
  );

  return (
    <Drawer open={!!run} onClose={onClose} title={`Run #${run?.id} — ${run?.task_name}`}>
      {isLoading ? (
        <Spinner center />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1rem' }}>
            <div className="flex gap-2" style={{ marginBottom: '0.75rem' }}>
              <Badge color={statusColor(data?.status)}>{data?.status || run?.status}</Badge>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Queue: <code>{data?.queue_name || 'default'}</code></span>
            </div>
            {[
              ['Started', data?.started_at ? formatDateTime(data.started_at) : '—'],
              ['Finished', data?.finished_at ? formatDateTime(data.finished_at) : '—'],
              ['Worker', data?.result?.worker || '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span>{v}</span>
              </div>
            ))}
          </div>

          {data?.error_message && (
            <div className="card" style={{ padding: '1rem', background: '#fef2f2', border: '1px solid var(--danger)' }}>
              <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Error</div>
              <code className="mono" style={{ fontSize: '0.8125rem', color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{data.error_message}</code>
            </div>
          )}

          {(data?.events || []).length > 0 && (
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Events</div>
              <div className="mono" style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {(data.events || []).map((ev) => `[${formatDateTime(ev.created_at)}] ${ev.event_type?.toUpperCase()} ${ev.message || ''}`).join('\n')}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {(run?.status === 'failed') && (
              <button className="btn btn-primary btn-sm" onClick={() => onRerun?.(run.id)}>↻ Rerun</button>
            )}
            {(run?.status === 'running' || run?.status === 'queued') && (
              <button className="btn btn-danger btn-sm" onClick={() => onCancel?.(run.id)}>✕ Cancel</button>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function ScheduleModal({ onClose, onScheduled }) {
  const toast = useToast();
  const [suite, setSuite] = useState('all');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.TASK_RUNS, payload),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: (res) => {
        toast.success(`Test run scheduled as task #${res.data?.id}`);
        onScheduled?.();
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const submit = () => {
    mutation.mutate({
      task_name: 'test_lab.scheduled_run',
      queue_name: 'default',
      status: 'queued',
      related_object_type: 'test_lab',
      payload: { suite, scheduled_at: scheduledAt, notes },
      result: { source: 'frontend_test_lab' },
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule Test Run"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>Schedule</button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Suite</label>
        <select className="form-input" value={suite} onChange={(e) => setSuite(e.target.value)}>
          <option value="all">All suites</option>
          {TEST_SUITES.map((s) => <option key={s.suite} value={s.suite}>{s.suite}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Run At</label>
        <input className="form-input" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Regression before release" />
      </div>
    </Modal>
  );
}

// ── Tab: Test Runs ────────────────────────────────────────────────────────────

function TestRunsTab({ runs, isLoading, onRerun, onCancel, onRowClick }) {
  if (isLoading) return <Spinner center />;
  if (runs.length === 0) return <EmptyState title="No Test Runs" message="Queue a test run to see results here." />;

  return (
    <table className="table">
      <thead>
        <tr><th>Suite</th><th>Task</th><th>Status</th><th>Started</th><th>Duration</th><th></th></tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const suite = run.payload?.suite || run.task_name?.replace('test_lab.', '') || '—';
          const started = run.started_at || run.queued_at;
          const duration = (run.started_at && run.finished_at)
            ? `${Math.round((new Date(run.finished_at) - new Date(run.started_at)) / 1000)}s`
            : run.status === 'running' ? 'running…' : '—';
          return (
            <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => onRowClick(run)}>
              <td>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{suite}</div>
              </td>
              <td><code className="mono" style={{ fontSize: '0.75rem' }}>{run.task_name}</code></td>
              <td><Badge color={statusColor(run.status)}>{run.status}</Badge></td>
              <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{started ? formatDateTime(started) : '—'}</td>
              <td className="mono" style={{ fontSize: '0.8125rem' }}>{duration}</td>
              <td onClick={(e) => e.stopPropagation()}>
                <div className="flex gap-1">
                  {run.status === 'failed' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => onRerun(run.id)}>↻</button>
                  )}
                  {(run.status === 'running' || run.status === 'queued') && (
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onCancel(run.id)}>✕</button>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Tab: Definitions ─────────────────────────────────────────────────────────

function DefinitionsTab({ onRunNow }) {
  const { data, isLoading } = useApiQuery(['task-definitions'], EP.TASK_DEFINITIONS);
  const definitions = data?.results ?? data ?? [];

  if (isLoading) return <Spinner center />;
  if (definitions.length === 0) return <EmptyState title="No Task Definitions" message="No task definitions registered." />;

  return (
    <table className="table">
      <thead>
        <tr><th>Name</th><th>Queue</th><th>Restartable</th><th></th></tr>
      </thead>
      <tbody>
        {definitions.map((def) => (
          <tr key={def.id}>
            <td><code className="mono" style={{ fontSize: '0.8125rem' }}>{def.name}</code></td>
            <td><code style={{ fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '2px 4px', borderRadius: '3px' }}>{def.queue_name || 'default'}</code></td>
            <td><Badge color={def.is_restartable ? 'success' : 'secondary'}>{def.is_restartable ? 'Yes' : 'No'}</Badge></td>
            <td>
              <button className="btn btn-primary btn-sm" onClick={() => onRunNow(def)}>▶ Run Now</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tab: Schedule ─────────────────────────────────────────────────────────────

function ScheduleTab({ onTrigger }) {
  const { data, isLoading } = useApiQuery(['task-definitions-schedule'], EP.TASK_DEFINITIONS);
  const definitions = (data?.results ?? data ?? []).filter((d) => d.is_restartable);

  if (isLoading) return <Spinner center />;

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '0.875rem' }}>Celery Beat Schedule</div>
      {definitions.length === 0 ? (
        <EmptyState title="No Scheduled Tasks" message="No periodic task definitions registered." />
      ) : (
        <div className="flex flex-col gap-2">
          {definitions.map((def) => (
            <div key={def.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div>
                <code className="mono" style={{ fontSize: '0.8125rem' }}>{def.name}</code>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{def.queue_name || 'default'} queue</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => onTrigger(def)}>▶ Trigger</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TestLab() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('runs');
  const [scheduleModal, setScheduleModal] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState(null);

  const { data, isLoading, refetch } = useApiQuery(['task-runs'], EP.TASK_RUNS, { page_size: 20, related_object_type: 'test_lab' });
  const runs = data?.results ?? data ?? [];

  const summary = runs.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});

  const runMutation = useApiMutation(
    (payload) => apiClient.post(EP.TASK_RUNS, payload),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: (res) => { toast.success(`Task #${res.data?.id} queued`); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const rerunMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_RESTART(id)),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: () => { toast.success('Task requeued'); setDetailDrawer(null); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const cancelMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_CANCEL(id)),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: () => { toast.success('Task cancelled'); setDetailDrawer(null); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const queueRun = (taskName, payload) =>
    runMutation.mutate({ task_name: taskName, queue_name: 'default', status: 'queued', related_object_type: 'test_lab', payload, result: { source: 'frontend_test_lab' } });

  const runAllTests = () => queueRun('test_lab.run_all', { suite: 'all', total: TEST_SUITES.length });
  const runSuite = (suite) => queueRun('test_lab.run_suite', { suite });
  const runDefinition = (def) => runMutation.mutate({ task_name: def.name, queue_name: def.queue_name || 'default', status: 'queued', payload: {} });

  const lastRun = runs[0];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">QA Test Lab</h1>
          <p className="page-subtitle">Automated test suite runner and task management</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setScheduleModal(true)}>📅 Schedule Run</button>
          <button className="btn btn-primary" onClick={runAllTests} disabled={runMutation.isPending}>
            {runMutation.isPending ? 'Queuing…' : '▶ Run All Tests'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 5, marginBottom: '1.5rem' }}>
        {[
          ['Queued', summary.queued || 0],
          ['Running', summary.running || 0],
          ['Succeeded', summary.succeeded || 0],
          ['Failed', summary.failed || 0],
          ['Last Run', lastRun ? formatDateTime(lastRun.queued_at || lastRun.created_at) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Suite Quick-Run Grid */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Test Suites</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
          {TEST_SUITES.map((s) => {
            const suiteRuns = runs.filter((r) => (r.payload?.suite || '').toLowerCase() === s.suite.toLowerCase());
            const last = suiteRuns[0];
            return (
              <div key={s.suite} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0.75rem', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg-card)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{s.suite}</div>
                  <div style={{ display: 'flex', gap: '0.25rem', marginTop: '2px' }}>
                    <Badge color="secondary" style={{ fontSize: '0.68rem' }}>{s.type}</Badge>
                    {last && <Badge color={statusColor(last.status)} style={{ fontSize: '0.68rem' }}>{last.status}</Badge>}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => runSuite(s.suite)}>▶</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0 }}>
        <div className="tabs" style={{ borderBottom: '1px solid var(--border)', padding: '0 1rem' }}>
          {[['runs', 'Test Runs'], ['definitions', 'Task Definitions'], ['schedule', 'Schedule']].map(([id, label]) => (
            <button key={id} className={`tab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'runs' && (
          <TestRunsTab
            runs={runs}
            isLoading={isLoading}
            onRerun={(id) => rerunMutation.mutate(id)}
            onCancel={(id) => cancelMutation.mutate(id)}
            onRowClick={setDetailDrawer}
          />
        )}
        {activeTab === 'definitions' && <DefinitionsTab onRunNow={runDefinition} />}
        {activeTab === 'schedule' && <ScheduleTab onTrigger={runDefinition} />}
      </div>

      {scheduleModal && (
        <ScheduleModal onClose={() => setScheduleModal(false)} onScheduled={refetch} />
      )}

      {detailDrawer && (
        <RunDetailDrawer
          run={detailDrawer}
          onClose={() => setDetailDrawer(null)}
          onRerun={(id) => { rerunMutation.mutate(id); }}
          onCancel={(id) => { cancelMutation.mutate(id); }}
        />
      )}
    </div>
  );
}
