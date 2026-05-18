import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { apiClient } from '../api/client';
import { EP } from '../api/endpoints';
import { useToast } from '../hooks/useToast';
import { formatDate, formatDateTime } from '../utils/formatting';
import Badge, { statusColor } from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';

export default function Dashboard() {
  const navigate = useNavigate();
  const toast = useToast();

  // Parallel data fetches
  const { data: completionData, isLoading: loadingCompletion } = useApiQuery(
    ['analytics-completion'],
    EP.ANALYTICS_COMPLETION
  );
  const { data: approvalData } = useApiQuery(
    ['analytics-approval'],
    EP.ANALYTICS_APPROVAL
  );
  const { data: inboxData } = useApiQuery(
    ['inbox-summary'],
    EP.INBOX,
    { page_size: 5 }
  );
  const { data: auditData } = useApiQuery(
    ['audit-recent'],
    EP.AUDIT_EVENTS,
    { page_size: 8 }
  );
  const { data: riskData } = useApiQuery(
    ['risk-findings'],
    EP.RISK_FINDINGS,
    { page_size: 5 }
  );
  const { data: envelopeSummary } = useApiQuery(
    ['envelope-summary'],
    EP.ENVELOPE_SUMMARY
  );
  const { data: webhookDeliveryData } = useApiQuery(
    ['webhook-deliveries-dashboard'],
    EP.WEBHOOK_DELIVERIES,
    { page_size: 50 }
  );
  const { data: workflowRunData } = useApiQuery(
    ['workflow-runs-dashboard'],
    EP.WORKFLOW_RUNS,
    { page_size: 5 }
  );
  const { data: workflowData } = useApiQuery(
    ['workflows-dashboard'],
    EP.WORKFLOWS,
    { page_size: 10 }
  );

  // Resolve risk findings mutation
  const resolveRiskMutation = useApiMutation(
    (id) => apiClient.post(EP.RISK_FINDING_RESOLVE(id)),
    {
      invalidateKeys: ['risk-findings'],
      onSuccess: () => toast.success('Risk finding resolved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // Computed stats
  const total = envelopeSummary?.total ?? completionData?.total ?? '—';
  const completed = envelopeSummary?.completed ?? completionData?.completed ?? '—';
  const sent = envelopeSummary?.sent ?? 0;
  const partlySigned = envelopeSummary?.partially_signed ?? 0;
  const inProgress = sent + partlySigned || '—';
  const pendingMyAction =
    (inboxData?.counts?.signing ?? 0) + (inboxData?.counts?.approvals ?? 0) || '—';
  const completionRate = completionData?.completion_rate != null
    ? `${completionData.completion_rate}%`
    : '—';

  // Data arrays
  const auditEvents = auditData?.results ?? auditData ?? [];
  const inboxItems = [
    ...(inboxData?.signing ?? []).map((i) => ({ ...i, uiType: 'sign' })),
    ...(inboxData?.approvals ?? []).map((i) => ({ ...i, uiType: 'approve' })),
    ...(inboxData?.failed_tasks ?? []).map((i) => ({ ...i, uiType: 'task' })),
  ].slice(0, 5);
  const riskFindings = riskData?.results ?? riskData ?? [];
  const bottlenecks = Array.isArray(approvalData) ? approvalData : [];

  // Webhook health derived stats
  const recentDeliveries = webhookDeliveryData?.results ?? webhookDeliveryData ?? [];
  const whTotal = recentDeliveries.length;
  const whSucceeded = recentDeliveries.filter(
    (d) => d.status === 'delivered' || (d.response_status >= 200 && d.response_status < 300)
  ).length;
  const whFailed = recentDeliveries.filter(
    (d) => d.status === 'failed' || d.status === 'error'
  ).length;
  const whSuccessRate = whTotal > 0 ? Math.round((whSucceeded / whTotal) * 100) : null;

  // Workflow snapshot
  const recentRuns = workflowRunData?.results ?? workflowRunData ?? [];
  const workflows = workflowData?.results ?? workflowData ?? [];
  const activeWorkflows = workflows.filter((w) => w.is_active !== false).length;

  // Severity config for risk radar
  const severityConfig = {
    critical: { label: 'Critical', color: 'danger' },
    high: { label: 'High', color: 'danger' },
    medium: { label: 'Medium', color: 'warning' },
    low: { label: 'Low', color: 'success' },
    info: { label: 'Info', color: 'primary' },
  };

  const severityBadgeColor = (sev) => {
    return severityConfig[String(sev || 'info').toLowerCase()]?.color ?? 'secondary';
  };

  const auditSeverityColor = (severity) => {
    if (severity === 'critical' || severity === 'error') return '#ef4444';
    if (severity === 'warning') return '#f59e0b';
    return '#10b981';
  };

  // Inbox action label helper
  const inboxActionLabel = (item) => {
    if (item.uiType === 'sign') return 'Sign Now';
    if (item.uiType === 'approve') return 'Approve';
    return 'Review';
  };

  const inboxActionPath = (item) => {
    if (item.uiType === 'sign' && item.token) return `/sign/${item.token}`;
    if (item.uiType === 'approve') return '/approvals';
    return '/inbox';
  };

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}
          </h1>
          <p className="page-subtitle">
            {"Here's what's happening with HanMak today — "}
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn btn-ghost"
            onClick={() => navigate('/templates')}
          >
            Browse Templates
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate('/envelopes')}
          >
            + New Envelope
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <div className="stat-label">Total Envelopes</div>
          <div className="stat-value" style={{ color: '#4f8ef7' }}>
            {loadingCompletion ? <Spinner /> : total}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completed</div>
          <div className="stat-value" style={{ color: '#10b981' }}>
            {completed}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">In Progress</div>
          <div className="stat-value" style={{ color: '#f59e0b' }}>
            {inProgress}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending My Action</div>
          <div className="stat-value" style={{ color: '#ef4444' }}>
            {pendingMyAction}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Completion Rate</div>
          <div className="stat-value" style={{ color: '#14b8a6' }}>
            {completionRate}
          </div>
        </div>
      </div>

      {/* 2-column grid */}
      <div className="grid-2" style={{ marginBottom: '24px', alignItems: 'start' }}>

        {/* Left column */}
        <div className="flex flex-col gap-4">

          {/* Recent Activity */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Recent Activity</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/audit')}
              >
                View audit &rsaquo;
              </button>
            </div>
            <div style={{ maxHeight: '360px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {Array.isArray(auditEvents) && auditEvents.length > 0 ? (
                auditEvents.map((event, idx) => (
                  <div
                    key={event.id ?? idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <Avatar name={event.actor_username || 'System'} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.35 }}>
                        <strong>{event.actor_username || 'System'}</strong>{' '}
                        {String(event.message || event.event_type || 'Activity event').slice(0, 120)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '3px' }}>
                        {formatDateTime(event.created_at)} &middot; {event.event_type || 'audit'}
                      </div>
                    </div>
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: auditSeverityColor(event.severity),
                        flexShrink: 0,
                      }}
                    />
                  </div>
                ))
              ) : (
                <EmptyState title="No recent activity" message="Activity events will appear here." />
              )}
            </div>
          </div>

          {/* Inbox Summary */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Needs Your Attention</span>
              <Badge color="warning">
                {typeof pendingMyAction === 'number' ? pendingMyAction : '—'}
              </Badge>
            </div>
            <div>
              {inboxItems.length > 0 ? (
                inboxItems.map((item, idx) => {
                  const title = item.envelope_name || item.task_name || `Task #${item.id}`;
                  const due = item.due_at ? formatDate(item.due_at) : 'No due date';
                  const typeColor = item.uiType === 'sign' ? 'primary' : item.uiType === 'approve' ? 'warning' : 'danger';
                  const typeLabel = item.uiType === 'sign' ? 'Signing' : item.uiType === 'approve' ? 'Approval' : 'Task';
                  return (
                    <div
                      key={item.id ?? idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <Avatar name={item.recipient_name || 'HanMak'} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                          {title}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <Badge color={typeColor}>{typeLabel}</Badge>
                          {' '}&middot; Due: {due}
                        </div>
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => navigate(inboxActionPath(item))}
                        style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
                      >
                        {inboxActionLabel(item)}
                      </button>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="Nothing needs attention" message="You're all caught up." />
              )}
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/inbox')}>
                View all in Inbox
              </button>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* Approval Bottlenecks */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Approval Bottlenecks</span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/approvals')}
              >
                View queue &rsaquo;
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              {bottlenecks.length > 0 ? (
                bottlenecks.slice(0, 5).map((row, idx) => {
                  const stage = row.approval_role || `Stage ${idx + 1}`;
                  const count = Number(row.count || 0);
                  const avgWait = row.avg_wait_hours != null
                    ? `${Number(row.avg_wait_hours).toFixed(1)}h avg wait`
                    : row.avg_wait != null
                    ? `${Number(row.avg_wait).toFixed(1)}h avg wait`
                    : null;
                  return (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{stage}</div>
                        {avgWait && (
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{avgWait}</div>
                        )}
                      </div>
                      <Badge color={count > 5 ? 'danger' : count > 2 ? 'warning' : 'secondary'}>
                        {count} pending
                      </Badge>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No bottlenecks" message="No approval bottleneck data yet." />
              )}
            </div>
          </div>

          {/* Risk Findings */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">AI Risk Radar</span>
              <Badge color="primary">Beta</Badge>
            </div>
            <div style={{ padding: '16px' }}>
              {riskFindings.length > 0 ? (
                riskFindings.slice(0, 4).map((row, idx) => {
                  const severity = String(row.severity || 'info').toLowerCase();
                  const badgeColor = severityBadgeColor(severity);
                  const title = row.title || `Risk Finding #${row.id}`;
                  const description = row.description || row.status || 'No description recorded.';
                  const score = Number(
                    row.metadata?.score ?? row.metadata?.risk_score ?? (severity === 'critical' ? 95 : severity === 'high' ? 80 : severity === 'medium' ? 55 : 25)
                  );
                  return (
                    <div
                      key={row.id ?? idx}
                      style={{
                        padding: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        marginBottom: '10px',
                        background: 'var(--bg-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px', gap: '8px' }}>
                        <span style={{ fontWeight: 600, fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title}
                        </span>
                        <Badge color={badgeColor}>
                          {severityConfig[severity]?.label ?? 'Info'} Risk
                        </Badge>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        {description}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            flex: 1,
                            height: '6px',
                            background: 'var(--border)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.max(1, Math.min(100, score))}%`,
                              height: '100%',
                              background: badgeColor === 'danger' ? '#ef4444' : badgeColor === 'warning' ? '#f59e0b' : '#10b981',
                              borderRadius: '3px',
                            }}
                          />
                        </div>
                        {row.status !== 'resolved' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '11px', flexShrink: 0 }}
                            onClick={() => resolveRiskMutation.mutate(row.id)}
                            disabled={resolveRiskMutation.isPending}
                          >
                            Resolve
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <EmptyState title="No open risk findings" message="Risk findings will appear here." />
              )}
            </div>
          </div>

          {/* Webhook Health */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Webhook Health</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/developer/webhooks')}>
                Manage &rsaquo;
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              {whTotal > 0 ? (
                <>
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                      <span>Success Rate</span>
                      <span style={{ fontWeight: 700, color: whSuccessRate >= 95 ? '#10b981' : whSuccessRate >= 80 ? '#f59e0b' : '#ef4444' }}>
                        {whSuccessRate}%
                      </span>
                    </div>
                    <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ width: `${whSuccessRate}%`, height: '100%', background: whSuccessRate >= 95 ? '#10b981' : whSuccessRate >= 80 ? '#f59e0b' : '#ef4444', borderRadius: '4px' }} />
                    </div>
                  </div>
                  {[
                    ['Deliveries (recent)', whTotal],
                    ['Succeeded', whSucceeded],
                    ['Failed', whFailed],
                  ].map(([l, v]) => (
                    <div
                      key={l}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                      <span style={{ fontWeight: 600 }}>{v}</span>
                    </div>
                  ))}
                </>
              ) : (
                <EmptyState title="No delivery data" message="Webhook delivery stats appear here once your first event fires." />
              )}
            </div>
          </div>

          {/* Workflow Snapshot */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Workflow Snapshot</span>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/workflow')}>
                Builder &rsaquo;
              </button>
            </div>
            <div style={{ padding: '16px' }}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem' }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '0.625rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#10b981' }}>{activeWorkflows}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Active Workflows</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center', padding: '0.625rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#4f8ef7' }}>{recentRuns.length}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Recent Runs</div>
                </div>
              </div>
              {recentRuns.length > 0 ? (
                recentRuns.slice(0, 4).map((run, idx) => (
                  <div
                    key={run.id ?? idx}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {run.workflow_name || run.workflow || `Run #${run.id}`}
                    </span>
                    <Badge color={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : run.status === 'running' ? 'primary' : 'secondary'}>
                      {run.status || 'pending'}
                    </Badge>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No workflow runs yet</div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-header"><span className="card-title">Quick Actions</span></div>
            <div
              style={{
                padding: '12px',
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              {[
                { label: 'New Envelope', path: '/envelopes', color: '#4f8ef7' },
                { label: 'Browse Templates', path: '/templates', color: '#8b5cf6' },
                { label: 'Approval Queue', path: '/approvals', color: '#f59e0b' },
                { label: 'Workflow Builder', path: '/workflows', color: '#10b981' },
              ].map(({ label, path, color }) => (
                <button
                  key={path}
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', gap: '8px', padding: '10px 12px' }}
                  onClick={() => navigate(path)}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: color,
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: '12px' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
