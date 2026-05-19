import { useCallback, useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

// ── Helpers ───────────────────────────────────────────────────────────────────

function taskColor(status) {
  const s = (status || '').toLowerCase();
  if (s === 'succeeded' || s === 'success' || s === 'completed') return 'success';
  if (s === 'failed') return 'danger';
  if (s === 'running') return 'primary';
  if (s === 'queued') return 'warning';
  return 'secondary';
}

function calcDuration(run) {
  if (!run.started_at) return '—';
  const end = run.finished_at || run.ended_at;
  if (!end) return run.status === 'running' ? 'running…' : '—';
  const secs = Math.round((new Date(end) - new Date(run.started_at)) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

const STATUS_TABS = [
  { id: 'all', label: 'All', summaryKey: null },
  { id: 'failed', label: 'Failed', summaryKey: 'failed' },
  { id: 'running', label: 'Running', summaryKey: 'running' },
  { id: 'queued', label: 'Queued', summaryKey: 'queued' },
];

// ── Run Drawer ────────────────────────────────────────────────────────────────

function RunDrawer({ run, onClose, onRestart, onCancel }) {
  const { data, isLoading } = useApiQuery(
    ['task-run-detail', run?.id],
    EP.TASK_RUN(run?.id),
    {},
    { enabled: !!run?.id }
  );
  const detail = data || run;

  return (
    <Drawer open={!!run} onClose={onClose} title={`Task #${run?.id}`} width={480}>
      {isLoading ? (
        <Spinner center />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Badge color={taskColor(detail?.status)}>{detail?.status || '—'}</Badge>
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            {[
              ['Task Name', <code className="mono" style={{ fontSize: '0.8rem' }}>{detail?.task_name || '—'}</code>],
              ['Queue', detail?.queue_name || 'default'],
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

          <div className="flex gap-2">
            {run?.status === 'failed' && (
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

// ── Workers Card ──────────────────────────────────────────────────────────────

function WorkersCard({ healthData }) {
  const metrics = healthData?.metrics || {};
  const workerDetails = metrics.celery_worker_details || [];
  const workerNames = metrics.celery_workers || [];
  const workers = workerDetails.length
    ? workerDetails
    : workerNames.map((name) => ({ name, active_tasks: 0 }));
  const hasError = !!metrics.celery_error;

  return (
    <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
      <div style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Celery Workers</span>
        {metrics.celery_worker_count != null && (
          <Badge color={metrics.celery_worker_count > 0 ? 'success' : 'danger'}>
            {metrics.celery_worker_count} active
          </Badge>
        )}
      </div>

      {workers.length === 0 ? (
        <div style={{ padding: '0.875rem', border: '1px solid var(--border)', borderRadius: '7px', color: 'var(--text-muted)', fontSize: '0.8125rem', background: 'var(--bg-secondary)' }}>
          Celery inspect unavailable — workers may be offline or inspect is disabled.
          {hasError && <div style={{ marginTop: '0.375rem', color: 'var(--danger)' }}>{metrics.celery_error}</div>}
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Active</th>
              <th>Reserved</th>
              <th>Pool Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((worker) => (
              <tr key={worker.name}>
                <td>
                  <code className="mono" style={{ fontSize: '0.8125rem' }}>{worker.name}</code>
                  {worker.pid && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>PID {worker.pid}</div>}
                </td>
                <td style={{ fontWeight: 600 }}>{worker.active_tasks ?? 0}</td>
                <td>{worker.reserved_tasks ?? 0}</td>
                <td>{worker.pool_processes != null ? `${worker.pool_processes}/${worker.max_concurrency || '?'}` : '—'}</td>
                <td><Badge color="success">active</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function BackgroundTasks() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [selectedRun, setSelectedRun] = useState(null);

  const { data: summaryData, refetch: refetchSummary } = useApiQuery(
    ['task-summary'],
    EP.TASK_RUN_SUMMARY
  );

  const { data: runsData, isLoading, refetch: refetchRuns } = useApiQuery(
    ['task-runs', activeTab, page],
    EP.TASK_RUNS,
    {
      status: activeTab === 'all' ? undefined : activeTab,
      page,
      ordering: '-created_at',
    }
  );

  const { data: healthData, refetch: refetchHealth } = useApiQuery(
    ['health-summary'],
    EP.HEALTH_SUMMARY,
    {},
    { refetchInterval: 30000 }
  );

  const { data: emailMsgData, refetch: refetchEmailMessages } = useApiQuery(
    ['email-messages-stats'],
    EP.EMAIL_MESSAGES,
    { page_size: 200, ordering: '-created_at' }
  );

  const runs = runsData?.results ?? runsData ?? [];
  const count = runsData?.count ?? runs.length;

  const emailMessages = emailMsgData?.results ?? emailMsgData ?? [];
  const emailTotal = emailMsgData?.count ?? emailMessages.length;
  const emailDelivered = emailMessages.filter(
    (m) => m.status === 'delivered' || m.status === 'sent' || m.status === 'success'
  ).length;
  const emailFailed = emailMessages.filter(
    (m) => m.status === 'failed' || m.status === 'bounced' || m.status === 'error'
  ).length;
  const emailPending = emailMessages.filter(
    (m) => m.status === 'pending' || m.status === 'queued'
  ).length;
  const emailSuccessRate =
    emailTotal > 0 ? Math.round((emailDelivered / emailTotal) * 100) : null;
  const hasNext = !!runsData?.next;
  const hasPrev = !!runsData?.previous;
  const summary = summaryData || {};

  const handleRefresh = useCallback(() => {
    refetchRuns();
    refetchSummary();
    refetchHealth();
    refetchEmailMessages();
  }, [refetchRuns, refetchSummary, refetchHealth, refetchEmailMessages]);

  const restartMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_RESTART(id)),
    {
      invalidateKeys: ['task-runs', 'task-summary'],
      onSuccess: () => { toast.success('Task requeued for restart'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const cancelMutation = useApiMutation(
    (id) => apiClient.post(EP.TASK_RUN_CANCEL(id)),
    {
      invalidateKeys: ['task-runs', 'task-summary'],
      onSuccess: () => { toast.success('Task cancelled'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const purgeMutation = useApiMutation(
    () => apiClient.post('/task-runs/purge/', { status: 'completed' }),
    {
      invalidateKeys: ['task-runs', 'task-summary'],
      onSuccess: (res) => {
        const count = res.data?.purged_count ?? 0;
        toast.success(`Purged ${count} completed task${count !== 1 ? 's' : ''}`);
        handleRefresh();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setPage(1);
  };

  const statCards = [
    ['All Tasks', summary.total ?? count, ''],
    ['Failed', summary.failed ?? 0, summary.failed > 0 ? 'var(--danger)' : ''],
    ['Running', summary.running ?? 0, summary.running > 0 ? 'var(--primary)' : ''],
    ['Queued', summary.queued ?? 0, ''],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Background Tasks</h1>
          <p className="page-subtitle">Monitor Celery workers, task queues, and retry failed jobs</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => setConfirmPurge(true)}
          >
            Purge Completed
          </button>
          <button className="btn btn-ghost" onClick={handleRefresh}>↺ Refresh</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {statCards.map(([label, value, color]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={color ? { color } : {}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Task Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-toolbar">
          <div className="tabs">
            {STATUS_TABS.map((tab) => {
              const badgeCount = tab.summaryKey ? summary[tab.summaryKey] : null;
              return (
                <button
                  key={tab.id}
                  className={`tab${activeTab === tab.id ? ' active' : ''}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  {tab.label}
                  {badgeCount > 0 && (
                    <span
                      className={`badge ${tab.id === 'failed' ? 'badge-danger' : tab.id === 'running' ? 'badge-primary' : 'badge-secondary'}`}
                      style={{ marginLeft: '0.375rem', fontSize: '0.68rem' }}
                    >
                      {badgeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {isLoading ? (
          <Spinner center />
        ) : runs.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <EmptyState
              title="No tasks"
              message={activeTab === 'all' ? 'No task runs recorded yet.' : `No ${activeTab} tasks.`}
            />
          </div>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Task Name</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Ended</th>
                  <th>Duration</th>
                  <th>Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedRun(run)}
                  >
                    <td>
                      <code className="mono" style={{ fontSize: '0.8125rem' }}>{run.task_name}</code>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        #{run.id}
                        {run.queue_name && <span style={{ marginLeft: '0.375rem' }}>· {run.queue_name}</span>}
                      </div>
                    </td>
                    <td><Badge color={taskColor(run.status)}>{run.status}</Badge></td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {run.started_at ? formatDateTime(run.started_at) : '—'}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {(run.finished_at || run.ended_at) ? formatDateTime(run.finished_at || run.ended_at) : '—'}
                    </td>
                    <td className="mono" style={{ fontSize: '0.8125rem' }}>{calcDuration(run)}</td>
                    <td
                      style={{ fontSize: '0.8rem', color: 'var(--danger)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={run.error_message || ''}
                    >
                      {run.error_message ? run.error_message.slice(0, 60) + (run.error_message.length > 60 ? '…' : '') : '—'}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        {run.status === 'failed' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Restart task"
                            onClick={() => restartMutation.mutate(run.id)}
                            disabled={restartMutation.isPending}
                          >
                            ↻
                          </button>
                        )}
                        {(run.status === 'running' || run.status === 'queued') && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            title="Cancel task"
                            onClick={() => cancelMutation.mutate(run.id)}
                            disabled={cancelMutation.isPending}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <Pagination
              hasNext={hasNext}
              hasPrev={hasPrev}
              onNext={() => setPage((p) => p + 1)}
              onPrev={() => setPage((p) => Math.max(1, p - 1))}
              count={count}
              page={page}
            />
          </>
        )}
      </div>

      {/* Celery Workers */}
      <WorkersCard healthData={healthData} />

      {/* Email Reliability */}
      <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
        <div style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Email Reliability</span>
          {emailSuccessRate != null && (
            <Badge color={emailSuccessRate >= 95 ? 'success' : emailSuccessRate >= 80 ? 'warning' : 'danger'}>
              {emailSuccessRate}% success
            </Badge>
          )}
        </div>

        {emailTotal === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No email delivery records found.</p>
        ) : (
          <>
            {emailSuccessRate != null && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Delivery Success Rate</span>
                  <span>{emailSuccessRate}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${emailSuccessRate}%`,
                      background: emailSuccessRate >= 95 ? 'var(--success)' : emailSuccessRate >= 80 ? 'var(--warning)' : 'var(--danger)',
                      borderRadius: 3,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
              {[
                ['Total', emailTotal, ''],
                ['Delivered', emailDelivered, 'var(--success)'],
                ['Failed', emailFailed, emailFailed > 0 ? 'var(--danger)' : ''],
                ['Pending', emailPending, emailPending > 0 ? 'var(--warning)' : ''],
              ].map(([label, value, color]) => (
                <div key={label} style={{ textAlign: 'center', padding: '0.625rem', background: 'var(--bg-secondary)', borderRadius: 7 }}>
                  <div style={{ fontSize: '1.375rem', fontWeight: 700, color: color || 'var(--text)' }}>{value}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Beat Scheduler */}
      {(() => {
        const metrics = healthData?.metrics || {};
        const beat = metrics.beat_schedule ?? metrics.beat ?? metrics.celerybeat ?? {};
        const beatRunning = metrics.beat_running ?? beat.running ?? beat.status === 'running';
        const beatLast = metrics.beat_last_run ?? beat.last_run ?? beat.last_tick;
        const beatNext = metrics.beat_next_run ?? beat.next_run;
        const beatScheduled = metrics.beat_scheduled_tasks ?? beat.scheduled_tasks ?? beat.task_count;
        const beatUptime = metrics.beat_uptime ?? beat.uptime;
        return (
          <div className="card" style={{ padding: '1.25rem', marginTop: '1.5rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Beat Scheduler</span>
              <Badge color={beatRunning ? 'success' : 'secondary'}>{beatRunning ? 'running' : 'unknown'}</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {[
                ['Last Run', beatLast ? formatDateTime(beatLast) : '—'],
                ['Next Run', beatNext ? formatDateTime(beatNext) : '—'],
                ['Scheduled Tasks', beatScheduled != null ? beatScheduled : '—'],
                ['Uptime', beatUptime != null ? `${Math.round(beatUptime / 60)}m` : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 7 }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.2rem' }}>
                    {label}
                  </div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>

            {metrics.celerybeat_pid != null && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                PID: <code className="mono">{metrics.celerybeat_pid}</code>
              </div>
            )}
          </div>
        );
      })()}

      {/* Run Detail Drawer */}
      {selectedRun && (
        <RunDrawer
          run={selectedRun}
          onClose={() => setSelectedRun(null)}
          onRestart={(id) => restartMutation.mutate(id)}
          onCancel={(id) => cancelMutation.mutate(id)}
        />
      )}

      {/* Purge Confirm */}
      <ConfirmDialog
        open={confirmPurge}
        onClose={() => setConfirmPurge(false)}
        onConfirm={() => purgeMutation.mutate()}
        title="Purge Completed Tasks"
        message="This removes all completed task-run records. Running and failed tasks are not affected. This action cannot be undone."
        confirmLabel="Purge Completed"
        danger
        loading={purgeMutation.isPending}
      />
    </div>
  );
}
