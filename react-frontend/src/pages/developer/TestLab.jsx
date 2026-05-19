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

function calcDuration(run) {
  if (!run.started_at) return '—';
  const end = run.finished_at || run.ended_at;
  if (!end) return run.status === 'running' ? 'running…' : '—';
  const secs = Math.round((new Date(end) - new Date(run.started_at)) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function taskStatusColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'succeeded' || s === 'success' || s === 'completed') return 'success';
  if (s === 'failed') return 'danger';
  if (s === 'running') return 'primary';
  if (s === 'queued') return 'warning';
  return 'secondary';
}

// ── Run Detail Drawer ─────────────────────────────────────────────────────────

function RunDetailDrawer({ run, onClose, onRestart, onCancel }) {
  const { data, isLoading } = useApiQuery(
    ['task-run-detail', run?.id],
    EP.TASK_RUN(run?.id),
    {},
    { enabled: !!run?.id }
  );

  const { data: eventsData, isLoading: eventsLoading } = useApiQuery(
    ['task-run-events', run?.id],
    `/task-runs/${run?.id}/events/`,
    {},
    { enabled: !!run?.id }
  );

  const events = eventsData?.results ?? eventsData ?? data?.events ?? [];
  const detail = data || run;

  return (
    <Drawer open={!!run} onClose={onClose} title={`Run #${run?.id} — ${run?.task_name || 'Task'}`} width={500}>
      {isLoading ? (
        <Spinner center />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1rem' }}>
            <div className="flex gap-2" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
              <Badge color={taskStatusColor(detail?.status)}>{detail?.status || '—'}</Badge>
              {detail?.queue_name && (
                <code style={{ fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 3 }}>{detail.queue_name}</code>
              )}
            </div>
            {[
              ['Task Name', <code className="mono" style={{ fontSize: '0.8rem' }}>{detail?.task_name || '—'}</code>],
              ['Status', detail?.status || '—'],
              ['Started', detail?.started_at ? formatDateTime(detail.started_at) : '—'],
              ['Ended', (detail?.finished_at || detail?.ended_at) ? formatDateTime(detail.finished_at || detail.ended_at) : '—'],
              ['Duration', calcDuration(detail || {})],
              ['Worker', detail?.result?.worker || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem', gap: '1rem' }}>
                <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                <span style={{ textAlign: 'right' }}>{value}</span>
              </div>
            ))}
          </div>

          {detail?.error_message && (
            <div className="card" style={{ padding: '1rem', background: '#fef2f2', border: '1px solid var(--danger)' }}>
              <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Error</div>
              <pre className="mono" style={{ fontSize: '0.8125rem', color: 'var(--danger)', whiteSpace: 'pre-wrap', margin: 0 }}>
                {detail.error_message}
              </pre>
            </div>
          )}

          {events.length > 0 && (
            <div className="card" style={{ padding: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Events</div>
              {eventsLoading ? <Spinner /> : (
                <pre className="mono" style={{ background: 'var(--bg-secondary)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.75rem', maxHeight: '280px', overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {events.map((ev) => `[${formatDateTime(ev.created_at)}] ${(ev.event_type || '').toUpperCase()} ${ev.message || ''}`).join('\n')}
                </pre>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {(run?.status === 'failed') && (
              <button className="btn btn-primary btn-sm" onClick={() => { onRestart?.(run.id); onClose(); }}>
                ↻ Restart
              </button>
            )}
            {(run?.status === 'running' || run?.status === 'queued') && (
              <button className="btn btn-danger btn-sm" onClick={() => { onCancel?.(run.id); onClose(); }}>
                ✕ Cancel
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Drawer>
  );
}

// ── Run Now Modal ─────────────────────────────────────────────────────────────

function RunModal({ definition, onClose, onQueued }) {
  const toast = useToast();
  const [timing, setTiming] = useState('immediate');

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.TASK_RUNS, payload),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: (res) => {
        toast.success(`Task queued as #${res.data?.id}`);
        onQueued?.();
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const delayForTiming = () => {
    if (timing === 'in5min') return new Date(Date.now() + 5 * 60 * 1000).toISOString();
    if (timing === 'in1h') return new Date(Date.now() + 60 * 60 * 1000).toISOString();
    return null;
  };

  const submit = () => {
    if (!definition) return;
    const payload = {
      task_name: definition.name,
      queue_name: definition.queue_name || 'default',
      status: 'queued',
      payload: { scheduled_at: delayForTiming(), source: 'test_lab_run_now' },
    };
    mutation.mutate(payload);
  };

  return (
    <Modal
      open={!!definition}
      onClose={onClose}
      title={`Run: ${definition?.name || 'Task'}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Queuing…' : '▶ Queue Task'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Queue</label>
        <div style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: '6px', fontSize: '0.875rem' }}>
          <code className="mono">{definition?.queue_name || 'default'}</code>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Run timing</label>
        <select className="form-input" value={timing} onChange={(e) => setTiming(e.target.value)}>
          <option value="immediate">Immediate</option>
          <option value="in5min">In 5 minutes</option>
          <option value="in1h">In 1 hour</option>
        </select>
      </div>
      {definition?.description && (
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>{definition.description}</p>
      )}
    </Modal>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function TestRunsTab({ runs, isLoading, onRowClick, onRestart, onCancel }) {
  const total = runs.length;
  const running = runs.filter((r) => r.status === 'running').length;
  const failed = runs.filter((r) => r.status === 'failed').length;
  const succeeded = runs.filter((r) => ['succeeded', 'success', 'completed'].includes(r.status)).length;

  if (isLoading) return <Spinner center />;

  return (
    <>
      <div className="stats-grid" style={{ '--cols': 4, padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        {[['Total', total], ['Running', running], ['Failed', failed], ['Completed', succeeded]].map(([label, value]) => (
          <div key={label} className="stat-card" style={{ padding: '0.5rem', border: '1px solid var(--border)', borderRadius: '6px' }}>
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ fontSize: '1.25rem' }}>{value}</div>
          </div>
        ))}
      </div>

      {runs.length === 0 ? (
        <div style={{ padding: '2rem' }}>
          <EmptyState title="No task runs" message="Queue a task to see runs here." />
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Task Name</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Error</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} style={{ cursor: 'pointer' }} onClick={() => onRowClick(run)}>
                <td>
                  <code className="mono" style={{ fontSize: '0.8125rem' }}>{run.task_name}</code>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>#{run.id}</div>
                </td>
                <td><Badge color={taskStatusColor(run.status)}>{run.status}</Badge></td>
                <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {run.started_at ? formatDateTime(run.started_at) : (run.queued_at ? formatDateTime(run.queued_at) : '—')}
                </td>
                <td className="mono" style={{ fontSize: '0.8125rem' }}>{calcDuration(run)}</td>
                <td style={{ fontSize: '0.8rem', color: 'var(--danger)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.error_message ? run.error_message.slice(0, 80) + (run.error_message.length > 80 ? '…' : '') : '—'}
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <div className="flex gap-1">
                    {run.status === 'failed' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => onRestart(run.id)} title="Restart">↻</button>
                    )}
                    {(run.status === 'running' || run.status === 'queued') && (
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--danger)' }} onClick={() => onCancel(run.id)} title="Cancel">✕</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function DefinitionsTab({ definitions, isLoading, onRunNow }) {
  if (isLoading) return <Spinner center />;
  if (!definitions.length) return <div style={{ padding: '2rem' }}><EmptyState title="No Task Definitions" message="No task definitions registered yet." /></div>;

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Task Name</th>
          <th>Description</th>
          <th>Queue</th>
          <th>Restartable</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {definitions.map((def) => (
          <tr key={def.id}>
            <td><code className="mono" style={{ fontSize: '0.8125rem' }}>{def.name}</code></td>
            <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{def.description || '—'}</td>
            <td>
              <code style={{ fontSize: '0.75rem', background: 'var(--bg-secondary)', padding: '2px 5px', borderRadius: 3 }}>
                {def.queue_name || 'default'}
              </code>
            </td>
            <td><Badge color={def.is_restartable ? 'success' : 'secondary'}>{def.is_restartable ? 'Yes' : 'No'}</Badge></td>
            <td>
              <button className="btn btn-primary btn-sm" onClick={() => onRunNow(def)}>
                ▶ Run Now
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function TestLab() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('runs');
  const [detailDrawer, setDetailDrawer] = useState(null);
  const [runModal, setRunModal] = useState(null);

  const { data: runsData, isLoading: runsLoading, refetch: refetchRuns } = useApiQuery(
    ['task-runs'],
    EP.TASK_RUNS,
    { page_size: 25, ordering: '-created_at' }
  );

  const { data: defsData, isLoading: defsLoading, refetch: refetchDefinitions } = useApiQuery(
    ['task-definitions'],
    EP.TASK_DEFINITIONS
  );

  const runs = runsData?.results ?? runsData ?? [];
  const definitions = defsData?.results ?? defsData ?? [];

  const handleRefresh = useCallback(() => {
    refetchRuns();
    refetchDefinitions();
  }, [refetchRuns, refetchDefinitions]);

  const restartMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_RESTART(id)),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: () => { toast.success('Task requeued for restart'); refetchRuns(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const cancelMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_CANCEL(id)),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: () => { toast.success('Task cancelled'); refetchRuns(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const runNowMutation = useApiMutation(
    (payload) => apiClient.post(EP.TASK_RUNS, payload),
    {
      invalidateKeys: ['task-runs'],
      onSuccess: (res) => {
        toast.success(`Task queued as #${res.data?.id}`);
        setActiveTab('runs');
        refetchRuns();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleRunDefinition = useCallback((def) => {
    setRunModal(def);
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Test Lab</h1>
          <p className="page-subtitle">Queue, monitor, and manage background task runs</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={handleRefresh}>↺ Refresh</button>
          <button
            className="btn btn-primary"
            onClick={() => runNowMutation.mutate({ task_name: 'test_lab.smoke_test', queue_name: 'default', status: 'queued', payload: { source: 'test_lab' } })}
            disabled={runNowMutation.isPending}
          >
            {runNowMutation.isPending ? 'Queuing…' : '▶ Quick Test Run'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {/* Tabs */}
        <div className="tabs" style={{ borderBottom: '1px solid var(--border)', padding: '0 1rem' }}>
          {[['runs', 'Test Runs'], ['definitions', 'Task Definitions']].map(([id, label]) => (
            <button
              key={id}
              className={`tab${activeTab === id ? ' active' : ''}`}
              onClick={() => setActiveTab(id)}
            >
              {label}
              {id === 'runs' && runs.length > 0 && (
                <span className="badge badge-secondary" style={{ marginLeft: '0.375rem', fontSize: '0.7rem' }}>
                  {runs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {activeTab === 'runs' && (
          <TestRunsTab
            runs={runs}
            isLoading={runsLoading}
            onRowClick={setDetailDrawer}
            onRestart={(id) => restartMutation.mutate(id)}
            onCancel={(id) => cancelMutation.mutate(id)}
          />
        )}

        {activeTab === 'definitions' && (
          <DefinitionsTab
            definitions={definitions}
            isLoading={defsLoading}
            onRunNow={handleRunDefinition}
          />
        )}
      </div>

      {/* Run Detail Drawer */}
      {detailDrawer && (
        <RunDetailDrawer
          run={detailDrawer}
          onClose={() => setDetailDrawer(null)}
          onRestart={(id) => restartMutation.mutate(id)}
          onCancel={(id) => cancelMutation.mutate(id)}
        />
      )}

      {/* Run Modal */}
      {runModal && (
        <RunModal
          definition={runModal}
          onClose={() => setRunModal(null)}
          onQueued={() => { setActiveTab('runs'); refetchRuns(); }}
        />
      )}
    </div>
  );
}
