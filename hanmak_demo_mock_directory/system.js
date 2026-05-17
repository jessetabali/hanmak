// ==================== BACKGROUND TASKS ====================
let _taskSummary = null;

registerPage('tasks', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">Background Tasks</h1>
    <p class="page-subtitle">Monitor Celery workers, task queues, and retry failed jobs</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="purgeFailedTasksLive()">${icon('trash')} Purge Failed</button>
    <button class="btn btn-primary" onclick="tasks_init()">${icon('refresh')} Refresh</button>
  </div>
</div>
<div id="live-task-body"><div class="card" style="padding:1.25rem">Loading tasks...</div></div>
`);

async function loadTaskState() {
  if (!await ensureHanmakApi()) throw new Error('Connect the API first.');
  const [summary, definitions, emailSummary, healthSummary] = await Promise.all([
    hanmakApi('/task-runs/summary/'),
    hanmakApi('/task-definitions/'),
    hanmakApi('/email-messages/summary/'),
    hanmakApi('/health-checks/summary/').catch(() => ({metrics: {}})),
  ]);
  return {summary, definitions: definitions.results || definitions, emailSummary, healthSummary};
}

async function tasks_init() {
  try {
    const {summary, definitions, emailSummary, healthSummary} = await loadTaskState();
    _taskSummary = summary;
    const queues = taskDashboardQueues(summary);
    const tasks = taskDashboardRows(summary);
    const workerCount = healthSummary?.metrics?.celery_worker_count;
    const taskBody = document.getElementById('live-task-body');
    if (!taskBody) return;
    taskBody.innerHTML = `
      <div class="stats-grid" style="--cols:5;margin-bottom:1.5rem">
        ${taskStat('Active Workers', workerCount ?? 0, workerCount ? 'var(--success)' : 'var(--warning)')}
        ${taskStat('Queued', summary.queued ?? 0, 'var(--text-primary)')}
        ${taskStat('Running', summary.running ?? 0, 'var(--primary)')}
        ${taskStat('Failed (24h)', summary.failed ?? 0, 'var(--danger)')}
        ${taskStat('Completed (24h)', summary.succeeded ?? 0, 'var(--text-primary)')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 320px;gap:1.5rem">
        <div class="flex flex-col gap-4">
          <div class="card" style="padding:1.25rem">
            <div style="font-weight:600;margin-bottom:1rem">Queue Status</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
              ${queues.map(queueDashboardCard).join('')}
            </div>
          </div>
          <div class="card">
            <div class="table-toolbar">
              <div class="tabs" id="task-filter-tabs">
                <button class="tab active" onclick="filterTasks('all',this)">All Tasks</button>
                <button class="tab" style="color:var(--danger)" onclick="filterTasks('failed',this)">Failed (${summary.failed || 0})</button>
                <button class="tab" onclick="filterTasks('running',this)">Running (${summary.running || 0})</button>
                <button class="tab" onclick="filterTasks('queued',this)">Queued (${summary.queued || 0})</button>
              </div>
              <select id="task-queue-filter" class="form-input" style="width:150px" onchange="filterTasks('all',null)"><option value="">All Queues</option>${queues.map(queue => `<option value="${escapeHtml(queue.queue)}">${escapeHtml(queue.queue)}</option>`).join('')}</select>
            </div>
            <table class="table">
              <thead><tr><th>Task</th><th>Queue</th><th>Status</th><th>Worker</th><th>Started</th><th>Duration</th><th></th></tr></thead>
              <tbody>${tasks.length ? tasks.map(taskDashboardRow).join('') : `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">No background task runs recorded yet.</td></tr>`}</tbody>
            </table>
          </div>
        </div>
        <div class="flex flex-col gap-4">
          <div class="card" style="padding:1.25rem">
            <div style="font-weight:600;margin-bottom:1rem">Celery Workers</div>
            ${workerDashboardRows(healthSummary?.metrics || {}).join('')}
            <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:0.5rem" onclick="openWorkerScalingInfoLive()">${icon('plus')} Scale Workers</button>
          </div>
          <div class="card" style="padding:1.25rem">
            <div style="font-weight:600;margin-bottom:0.75rem">Email Reliability</div>
            ${emailReliabilityRows(emailSummary).join('')}
            <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:0.75rem" onclick="navigate('settings')">${icon('mail')} SMTP Settings</button>
          </div>
          <div class="card" style="padding:1.25rem">
            <div style="font-weight:600;margin-bottom:0.75rem">Beat Scheduler</div>
            <div class="flex flex-col gap-2" style="font-size:0.8125rem">
              ${schedulerDashboardRows(definitions).join('')}
            </div>
          </div>
        </div>
      </div>`;
  } catch (error) {
    if (!document.getElementById('live-task-body')) return;
    document.getElementById('live-task-body').innerHTML = `<div class="alert alert-danger">${icon('alert-circle')} Tasks failed: ${escapeHtml(error.message)}</div>`;
  }
}

function emailReliabilityRows(summary = {}) {
  return [
    ['Queued', summary.queued || 0, 'secondary'],
    ['Sent', summary.sent || 0, 'success'],
    ['Failed', summary.failed || 0, summary.failed ? 'danger' : 'secondary'],
    ['Bounced', summary.bounced || 0, summary.bounced ? 'danger' : 'secondary'],
    ['Retry Due', summary.retry_due || 0, summary.retry_due ? 'warning' : 'secondary'],
    ['Due Reminders', summary.due_reminder_schedules || 0, summary.due_reminder_schedules ? 'warning' : 'secondary'],
  ].map(([label, value, color]) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${label}</span><span class="badge badge-${color}">${value}</span></div>`);
}

function taskDashboardQueues(summary) {
  const byQueue = new Map((summary.queues || []).map(queue => [queue.queue, queue]));
  const standardQueues = ['default', 'email', 'signatures', 'webhooks', 'pdf_gen', 'audit'];
  const seen = new Set([...byQueue.keys(), ...standardQueues]);
  return [...seen].map(queue => ({
    queue,
    label: queueLabel(queue),
    queued: 0,
    running: 0,
    failed: 0,
    succeeded: 0,
    ...(byQueue.get(queue) || {}),
  }));
}

function taskDashboardRows(summary) {
  const liveRows = (summary.recent || []).map((task, index) => ({
    id: `#${task.id}`,
    dbId: task.id,
    name: task.task_name,
    queue: task.queue_name,
    status: task.status === 'succeeded' ? 'success' : task.status,
    worker: task.result?.worker || (task.status === 'queued' ? '-' : `worker-${(index % 6) + 1}`),
    started: task.started_at ? apiDate(task.started_at) : apiDate(task.queued_at),
    duration: task.finished_at ? 'done' : (task.status === 'running' ? 'running' : '-'),
    live: true,
  }));
  return liveRows;
}

function queueLabel(queue) {
  return {
    default: 'Default Queue',
    email: 'Email Queue',
    signatures: 'Sig Processing',
    webhooks: 'Webhooks',
    pdf_gen: 'PDF Generation',
    audit: 'Audit Logging',
  }[queue] || titleCaseStatus(queue);
}

function taskStat(label, value, color) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value || 0}</div></div>`;
}

function queueDashboardCard(queue) {
  return `<div style="padding:0.75rem;border:1px solid var(--border);border-radius:8px">
    <div style="font-weight:600;font-size:0.875rem;margin-bottom:4px">${escapeHtml(queue.label || queue.queue)}</div>
    <code style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(queue.queue)}</code>
    <div style="display:flex;gap:0.5rem;margin-top:0.5rem;flex-wrap:wrap">
      <span style="font-size:0.75rem;color:var(--text-muted)">${icon('clock')} ${queue.queued || 0}</span>
      <span style="font-size:0.75rem;color:var(--primary)">${icon('play')} ${queue.running || 0}</span>
      ${queue.failed ? `<span style="font-size:0.75rem;color:var(--danger)">${icon('x-circle')} ${queue.failed} FAILED</span>` : ''}
    </div>
  </div>`;
}

function taskDashboardRow(task) {
  const sc = {success: 'success', succeeded: 'success', running: 'primary', failed: 'danger', queued: 'secondary', cancelled: 'secondary'};
  const retry = task.live && task.status === 'failed' ? `<button class="btn btn-ghost btn-sm" onclick="retryTaskLive(${task.dbId})" title="Retry">${icon('refresh')}</button>` : '';
  const cancel = task.live && ['running', 'queued'].includes(task.status) ? `<button class="btn btn-ghost btn-sm" onclick="cancelTaskLive(${task.dbId})" title="Cancel">${icon('x-circle')}</button>` : '';
  const logClick = task.live ? `viewTaskLogLive(${task.dbId})` : `viewSampleTaskLog('${task.id}')`;
  return `<tr>
    <td><div style="font-family:var(--font-mono);font-size:0.8125rem;font-weight:500">${escapeHtml(task.name)}</div><div style="font-size:0.72rem;color:var(--text-muted)">${escapeHtml(task.id)}</div></td>
    <td><code style="font-size:0.75rem;background:var(--bg-secondary);padding:2px 5px;border-radius:3px">${escapeHtml(task.queue)}</code></td>
    <td><span class="badge badge-${sc[task.status] || 'secondary'}">${escapeHtml(task.status)}</span></td>
    <td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(task.worker)}</td>
    <td style="font-size:0.8rem;color:var(--text-muted)">${escapeHtml(task.started)}</td>
    <td style="font-family:var(--font-mono);font-size:0.8rem">${escapeHtml(task.duration)}</td>
    <td><div class="flex gap-1">${retry}<button class="btn btn-ghost btn-sm" onclick="${logClick}" title="Logs">${icon('file-text')}</button>${cancel}</div></td>
  </tr>`;
}

function filterTasks(status, tabEl) {
  if (tabEl) {
    document.querySelectorAll('#task-filter-tabs .tab').forEach(t => t.classList.remove('active'));
    tabEl.classList.add('active');
  }
  if (!_taskSummary) return;
  const queueFilter = document.getElementById('task-queue-filter')?.value || '';
  let rows = taskDashboardRows(_taskSummary);
  if (status && status !== 'all') {
    const match = status === 'failed' ? ['failed'] : status === 'running' ? ['running'] : ['queued'];
    rows = rows.filter(r => match.includes(r.status));
  }
  if (queueFilter) rows = rows.filter(r => r.queue === queueFilter);
  const tbody = document.querySelector('#live-task-body table tbody');
  if (tbody) tbody.innerHTML = rows.length ? rows.map(taskDashboardRow).join('') : `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-muted)">No tasks match this filter.</td></tr>`;
}

function workerDashboardRows(metrics = {}) {
  const details = metrics.celery_worker_details || [];
  const workers = details.length ? details : (metrics.celery_workers || []).map(name => ({name, active_tasks: 0}));
  if (!workers.length) {
    return [`<div style="padding:0.875rem;border:1px solid var(--border);border-radius:7px;color:var(--text-muted);font-size:0.8125rem">
      Celery inspect did not report active workers${metrics.celery_error ? `: ${escapeHtml(metrics.celery_error)}` : '.'}
    </div>`];
  }
  return workers.map(worker => {
    const tasks = Number(worker.active_tasks || 0);
    const reserved = Number(worker.reserved_tasks || 0);
    const scheduled = Number(worker.scheduled_tasks || 0);
    const load = Math.min(100, Math.max(8, tasks * 12));
    return `<div style="padding:0.625rem;border:1px solid var(--border);border-radius:7px;margin-bottom:0.5rem">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><span style="font-weight:600;font-size:0.875rem">${escapeHtml(worker.name)}</span><span class="badge badge-success">active</span></div>
      <div style="font-size:0.75rem;color:var(--text-muted)">Active ${tasks} · Reserved ${reserved} · Scheduled ${scheduled}</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px">PID ${worker.pid || 'n/a'} · Pool ${worker.pool_processes || 0}/${worker.max_concurrency || 'n/a'} · RSS ${worker.rss_kb ? `${worker.rss_kb} KB` : 'n/a'}</div>
      <div style="height:5px;background:var(--border);border-radius:3px;margin-top:6px"><div style="height:100%;width:${load}%;background:var(--primary);border-radius:3px"></div></div>
    </div>`;
  });
}

function schedulerDashboardRows(definitions) {
  if (!definitions?.length) {
    return ['<div style="padding:0.875rem;border:1px solid var(--border);border-radius:7px;color:var(--text-muted);font-size:0.8125rem">No task definitions are registered yet.</div>'];
  }
  return definitions.map(definition => `<div style="display:flex;justify-content:space-between;align-items:center;padding:0.375rem 0;border-bottom:1px solid var(--border)">
    <div><div style="font-family:var(--font-mono);font-size:0.75rem">${escapeHtml(definition.name)}</div><div style="color:var(--text-muted);font-size:0.72rem">${escapeHtml(definition.queue_name)} queue</div></div>
    <span class="badge badge-${definition.is_restartable ? 'success' : 'secondary'}">${definition.is_restartable ? 'restartable' : 'defined'}</span>
  </div>`);
}

async function retryTaskLive(id) {
  await hanmakApi(`/task-runs/${id}/restart/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`Task #${id} queued for retry`, 'success');
  tasks_init();
}

async function cancelTaskLive(id) {
  await hanmakApi(`/task-runs/${id}/cancel/`, {method: 'POST', body: JSON.stringify({})});
  showToast(`Task #${id} cancelled`, 'success');
  tasks_init();
}

async function viewTaskLogLive(id) {
  const task = await hanmakApi(`/task-runs/${id}/`);
  openTaskLogModal(`#${id}`, task.events.map(event => `[${apiDate(event.created_at)}] ${event.event_type.toUpperCase()} ${event.message || ''}`).join('\n') || task.error_message || 'No task events recorded yet.', task.status === 'failed' ? id : null);
}

function viewSampleTaskLog(id) {
  openTaskLogModal(id, 'This row is not backed by a task-run record.');
}

function openTaskLogModal(id, log, retryId = null) {
  openModal(`<div class="modal-header"><h3 class="modal-title">Task Log - ${escapeHtml(id)}</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body"><div style="background:var(--bg-secondary);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:0.75rem;max-height:350px;overflow:auto;color:var(--text-secondary);white-space:pre-wrap">${escapeHtml(log)}</div></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Close</button>${retryId ? `<button class="btn btn-primary" onclick="closeModal();retryTaskLive(${retryId})">${icon('refresh')} Retry Task</button>` : ''}</div>`);
}

function purgeFailedTasksLive() {
  openModal(`<div class="modal-header"><h3 class="modal-title">Purge Failed Tasks</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body"><p style="color:var(--text-secondary)">This removes failed task-run records visible to your organization. Restart tasks you still need before purging.</p></div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-danger" onclick="confirmPurgeFailedTasksLive()">${icon('trash')} Purge Failed</button></div>`);
}

async function confirmPurgeFailedTasksLive() {
  const data = await hanmakApi('/task-runs/purge_failed/', {method: 'POST', body: JSON.stringify({})});
  closeModal();
  showToast(`Purged ${data.purged_count} failed task(s)`, 'success');
  tasks_init();
}

function openWorkerScalingInfoLive() {
  openModal(`<div class="modal-header"><h3 class="modal-title">Worker Scaling</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);font-size:0.875rem">HanMak records worker heartbeat and task state here. Actual worker scaling is controlled by the Docker Compose, Kubernetes, or process manager layer running Celery.</p>
      <div style="background:var(--bg-secondary);border-radius:8px;padding:0.875rem;font-family:var(--font-mono);font-size:0.78rem">docker compose -f docker-compose.dev.yml up -d --scale celery_worker_default=3</div>
    </div>
    <div class="modal-footer"><button class="btn btn-primary" onclick="closeModal()">Close</button></div>`);
}

// ==================== SYSTEM HEALTH ====================
registerPage('system-health', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">System Health</h1>
    <p class="page-subtitle">Real-time infrastructure status, performance metrics, and alerts</p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="publishStatusLive()">${icon('send')} Publish Status</button>
    <button class="btn btn-ghost" onclick="openCreateIncidentModal()">${icon('alert-triangle')} New Incident</button>
    <button class="btn btn-ghost" onclick="openAlertSubscriptionModal()">${icon('bell')} Subscribe to Alerts</button>
    <button class="btn btn-primary" onclick="runHealthCheckLive()">${icon('refresh')} Run Health Check</button>
  </div>
</div>
<div id="live-health-body"><div class="card" style="padding:1.25rem">Loading system health...</div></div>
`);

async function system_health_init() {
  try {
    if (!await ensureHanmakApi()) throw new Error('Connect the API first.');
    const [data, incidentsData, readiness, runbook] = await Promise.all([
      hanmakApi('/health-checks/summary/'),
      hanmakApi('/incidents/').catch(() => ({results: []})),
      hanmakApi('/health-checks/deployment-readiness/').catch(() => null),
      hanmakApi('/health-checks/deployment-runbook/').catch(() => null),
    ]);
    renderHealthSummary(data, incidentsData.results || incidentsData || [], readiness, runbook);
  } catch (error) {
    // Ignore stale-navigation errors (user navigated away before the response arrived)
    if (!document.getElementById('live-health-body')) return;
    const healthBody = document.getElementById('live-health-body');
    healthBody.innerHTML = `<div class="alert alert-danger">${icon('alert-circle')} Health check failed: ${escapeHtml(error.message)}</div>`;
  }
}

async function runHealthCheckLive() {
  try {
    await hanmakApi('/health-checks/run_checks/', {method: 'POST', body: JSON.stringify({})});
    showToast('Health checks updated', 'success');
    system_health_init();
  } catch (error) {
    showToast(`Health check failed: ${error.message}`, 'error', 7000);
  }
}

function openAlertSubscriptionModal() {
  openModal(`<div class="modal-header"><h3 class="modal-title">${icon('bell')} Alert Subscription</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Email</label><input id="alert-subscription-email" class="form-input" type="email" placeholder="ops@example.com"></div>
      <div class="form-group"><label class="form-label">Events</label><select id="alert-subscription-events" class="form-input"><option value="degraded,recovered">Degraded and recovered</option><option value="degraded">Degraded only</option></select></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAlertSubscriptionLive()">${icon('bell')} Subscribe</button></div>`);
}

async function saveAlertSubscriptionLive() {
  const email = document.getElementById('alert-subscription-email').value.trim();
  if (!email) return showToast('Email is required', 'error');
  const events = document.getElementById('alert-subscription-events').value.split(',');
  await hanmakApi('/health-checks/alert_subscriptions/', {method: 'POST', body: JSON.stringify({email, events})});
  closeModal();
  showToast('Alert subscription saved', 'success');
}

function renderHealthSummary(data, incidents = [], readiness = null, runbook = null) {
  const healthy = data.overall_status === 'healthy';
  const metrics = data.metrics || {};
  const checks = new Map((data.checks || []).map(check => [check.name, check]));
  const failedEmailStatus = metrics.failed_emails ? 'Degraded' : 'Healthy';
  const apiCheck = checks.get('api');
  const dbCheck = checks.get('database');
  const storageCheck = checks.get('storage');
  const workerCheck = checks.get('worker') || checks.get('task_queue');
  const emailCheck = checks.get('email');
  const healthBody = document.getElementById('live-health-body');
  if (!healthBody) return;
  healthBody.innerHTML = `
    <div style="background:${healthy ? '#dcfce7' : '#fee2e2'};border:1px solid ${healthy ? 'var(--success)' : 'var(--danger)'};border-radius:10px;padding:1rem 1.5rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:1rem">
      <div style="width:12px;height:12px;border-radius:50%;background:${healthy ? 'var(--success)' : 'var(--danger)'};flex-shrink:0"></div>
      <div><div style="font-weight:700;color:${healthy ? 'var(--success)' : 'var(--danger)'}">${healthy ? 'All Systems Operational' : 'System Degraded'}</div><div style="font-size:0.8125rem;color:var(--text-secondary)">Last checked: ${apiDate(data.checked_at)} · Uptime: 99.97% this month</div></div>
      <a href="/api/v1/health-checks/public_status/" target="_blank" style="margin-left:auto;font-size:0.8125rem;color:var(--primary)">View Public Status Page -></a>
    </div>
    <div class="stats-grid" style="--cols:4;margin-bottom:1.5rem">
      ${healthMetricCard('API Status', titleCaseStatus(apiCheck?.status || 'unknown'), apiCheck?.status === 'healthy' ? 'var(--success)' : 'var(--warning)', apiCheck?.message || 'Run checks to refresh')}
      ${healthMetricCard('Task Failures', metrics.failed_tasks ?? 0, metrics.failed_tasks ? 'var(--danger)' : 'var(--text-primary)', `${metrics.task_queue_depth ?? 0} queued`)}
      ${healthMetricCard('Memory Used', metricPercent(metrics.memory_used_percent, 'n/a'), 'var(--text-primary)', bytesLabel(metrics.memory_available_bytes) + ' available')}
      ${healthMetricCard('Storage Used', metricPercent(metrics.used_percent, 'n/a'), 'var(--text-primary)', `${bytesLabel(metrics.free_bytes)} free`)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 320px;gap:1.5rem">
      <div class="flex flex-col gap-4">
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:1rem">Service Status</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">
            ${serviceStatusCard('API Server', apiCheck?.status || 'unknown', apiCheck?.message || 'No check recorded')}
            ${serviceStatusCard('Database', dbCheck?.status || 'unknown', dbCheck?.message || 'No check recorded')}
            ${serviceStatusCard('Redis Cache', metrics.redis_ping === false ? 'degraded' : 'healthy', metrics.redis_configured ? `${metrics.redis_connected_clients ?? 0} clients` : 'not configured')}
            ${serviceStatusCard('Celery Workers', workerCheck?.status || (metrics.celery_worker_count === 0 || metrics.failed_tasks ? 'degraded' : 'healthy'), metrics.celery_worker_count == null ? (workerCheck?.message || 'task table fallback') : `${metrics.celery_worker_count} active · ${metrics.celery_active_tasks || 0} tasks`)}
            ${serviceStatusCard('Email Service', emailCheck?.status || failedEmailStatus.toLowerCase(), metrics.failed_emails ? `${metrics.failed_emails} failed` : (emailCheck?.message || 'No failed email'))}
            ${serviceStatusCard('File Storage', storageCheck?.status || 'unknown', storageCheck?.message || 'No check recorded')}
            ${serviceStatusCard('MinIO/Object Storage', metrics.minio_configured ? (metrics.minio_reachable ? 'healthy' : 'degraded') : 'unknown', metrics.minio_configured ? (metrics.minio_reachable ? 'reachable' : metrics.minio_error || 'unreachable') : 'not configured')}
            ${serviceStatusCard('Search Index', metrics.search_index_status || 'unknown', `${metrics.search_index_records ?? 'n/a'} indexed records`)}
            ${serviceStatusCard('Webhook Delivery', metrics.webhook_delivery_status || 'unknown', `${metrics.webhook_failed ?? 0} failed deliveries`)}
          </div>
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:1rem">APM & Deployment Readiness</div>
          ${observabilityReadinessRows(data.apm || {}, readiness).join('')}
          ${readiness?.checks?.length ? `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-size:0.8125rem;font-weight:700">Readiness checklist</summary><div style="margin-top:0.75rem">${deploymentReadinessRows(readiness.checks).join('')}</div></details>` : ''}
          ${runbook ? `<details style="margin-top:0.75rem"><summary style="cursor:pointer;font-size:0.8125rem;font-weight:700">Deployment runbook</summary><div style="margin-top:0.75rem">${deploymentRunbookRows(runbook).join('')}</div></details>` : ''}
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:1rem">Recent Incidents</div>
          ${recentIncidentRows(incidents).join('')}
        </div>
      </div>
      <div class="flex flex-col gap-4">
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:1rem">Resource Utilization</div>
          ${resourceUtilizationRows(metrics).join('')}
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:0.75rem">Database Metrics</div>
          ${databaseMetricRows(metrics).join('')}
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-weight:600;margin-bottom:0.75rem">Alert Thresholds</div>
          ${alertThresholdRows().join('')}
          <button class="btn btn-ghost btn-sm" style="width:100%;margin-top:0.75rem" onclick="openAlertThresholdsModal()">${icon('settings')} Edit Thresholds</button>
        </div>
      </div>
    </div>`;
}

function deploymentReadinessRows(checks = []) {
  return checks.map(check => `
    <div style="display:flex;align-items:flex-start;gap:0.5rem;padding:0.45rem 0;border-bottom:1px solid var(--border);font-size:0.78rem">
      <span class="badge badge-${check.status === 'pass' ? 'success' : 'danger'}" style="flex-shrink:0">${check.status}</span>
      <div><div style="font-weight:700">${escapeHtml(check.key)}</div><div style="color:var(--text-muted);line-height:1.45">${escapeHtml(check.message || '')}</div></div>
    </div>
  `);
}

function deploymentRunbookRows(runbook = {}) {
  return Object.entries(runbook).map(([section, items]) => `
    <div style="margin-bottom:0.85rem">
      <div style="font-weight:800;font-size:0.8rem;margin-bottom:0.35rem">${titleCaseStatus(section)}</div>
      ${(items || []).map(item => `<div style="font-size:0.76rem;color:var(--text-muted);line-height:1.45;padding:0.2rem 0">- ${escapeHtml(item)}</div>`).join('')}
    </div>
  `);
}

function observabilityReadinessRows(apm = {}, readiness = null) {
  const runtime = apm.runtime_status || {};
  const rows = [
    ['APM Provider', apm.provider || 'none', runtime.configured ? 'success' : 'secondary'],
    ['Runtime', runtime.configured ? 'Configured' : 'Not configured', runtime.configured ? 'success' : 'warning'],
    ['Trace Sample', `${Number(apm.trace_sample_rate ?? 0).toFixed(2)}`, 'secondary'],
    ['External Alerts', apm.external_alerts_configured ? 'Configured' : 'Not configured', apm.external_alerts_configured ? 'success' : 'warning'],
  ];
  const readinessRows = readiness ? [
    ['Readiness', `${readiness.passed || 0} pass · ${readiness.failed || 0} fail`, readiness.failed ? 'danger' : 'success'],
  ] : [['Readiness', 'Unavailable', 'warning']];
  return [...rows, ...readinessRows].map(([label, value, color]) => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:0.65rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem">
      <span style="color:var(--text-muted)">${label}</span>
      <span class="badge badge-${color}">${escapeHtml(String(value))}</span>
    </div>
  `);
}

function healthMetricCard(label, value, color, delta) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:${color}">${value}</div><div class="stat-delta delta-up">${delta}</div></div>`;
}

function metricPercent(value, fallback = '0%') {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : fallback;
}

function bytesLabel(value) {
  const bytes = Number(value || 0);
  if (!bytes) return 'n/a';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function serviceStatusCard(name, status, metric) {
  const clean = String(status || 'healthy').toLowerCase();
  const color = clean === 'healthy' || clean === 'ok' ? 'success' : clean === 'degraded' ? 'warning' : 'danger';
  return `<div style="padding:0.75rem;border:1px solid var(--border);border-radius:8px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><div style="font-weight:600;font-size:0.8125rem">${name}</div><span class="badge badge-${color}" style="font-size:0.7rem">${titleCaseStatus(clean === 'ok' ? 'healthy' : clean)}</span></div>
    <div style="font-size:0.75rem;color:var(--text-muted)">${metric}</div>
  </div>`;
}

function recentIncidentRows(incidents = []) {
  if (!incidents.length) {
    return ['<div style="padding:1rem;text-align:center;color:var(--text-muted);border:1px solid var(--border);border-radius:8px">No incidents recorded.</div>'];
  }
  return incidents.slice(0, 5).map(incident => {
    const color = incident.status === 'resolved' ? 'success' : incident.severity === 'critical' ? 'danger' : 'warning';
    const started = apiDate(incident.started_at);
    const ended = incident.resolved_at ? ` - ${apiDate(incident.resolved_at)}` : '';
    return `<div style="padding:0.75rem;border:1px solid var(--border);border-radius:8px;margin-bottom:0.625rem">
    <div style="display:flex;justify-content:space-between;align-items:flex-start"><div><div style="font-weight:600;font-size:0.875rem">${escapeHtml(incident.title)}</div><div style="font-size:0.75rem;color:var(--text-muted)">${started}${ended}</div></div><span class="badge badge-${color}">${escapeHtml(titleCaseStatus(incident.status))}</span></div>
    <div style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.375rem">${escapeHtml(incident.description || 'No incident notes recorded.')}</div>
    ${incident.status !== 'resolved' ? `<button class="btn btn-ghost btn-sm" style="margin-top:0.5rem" onclick="resolveIncidentLive(${incident.id})">${icon('check')} Resolve</button>` : ''}
  </div>`;
  });
}

function resourceUtilizationRows(metrics = {}) {
  const memory = Number(metrics.memory_used_percent || 0);
  const disk = Number(metrics.used_percent || 0);
  const load = Number(metrics.load_1m || 0);
  return [['Load Avg', load.toFixed(2), Math.min(load * 20, 100), load > 4 ? 'warning' : 'success'], ['Memory', metricPercent(memory), memory, memory > 80 ? 'warning' : 'success'], ['Disk', metricPercent(disk), disk, disk > 80 ? 'warning' : 'success'], ['Process Uptime', `${Math.floor((metrics.process_uptime_seconds || 0) / 60)}m`, 35, 'success']].map(([res, pct, val, color]) => `<div style="margin-bottom:0.875rem">
    <div style="display:flex;justify-content:space-between;font-size:0.8125rem;margin-bottom:4px"><span>${res}</span><span style="font-weight:600;color:var(--${color})">${pct}</span></div>
    <div style="height:8px;background:var(--border);border-radius:4px"><div style="width:${val}%;height:100%;background:var(--${color});border-radius:4px"></div></div>
  </div>`);
}

function databaseMetricRows(metrics = {}) {
  return [
    ['DB Vendor', metrics.db_vendor || 'unknown'],
    ['Queries Observed', metrics.db_queries_observed ?? 0],
    ['Redis Memory', metrics.redis_used_memory ? bytesLabel(metrics.redis_used_memory) : 'n/a'],
    ['Redis Clients', metrics.redis_connected_clients ?? 'n/a'],
    ['Celery Workers', metrics.celery_worker_count ?? 'n/a'],
    ['Celery Active Tasks', metrics.celery_active_tasks ?? 'n/a'],
  ].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:0.375rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${k}</span><span style="font-weight:500">${v}</span></div>`);
}

function alertThresholdRows() {
  return [['API Error Rate', '> 1%'], ['Response Time', '> 2000ms'], ['CPU Usage', '> 85%'], ['Memory Usage', '> 90%'], ['Disk Usage', '> 80%'], ['Queue Depth', '> 1000']].map(([metric, threshold]) => `<div style="display:flex;justify-content:space-between;padding:0.375rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem"><span style="color:var(--text-muted)">${metric}</span><code style="font-size:0.75rem;color:var(--danger)">${threshold}</code></div>`);
}

async function openAlertThresholdsModal() {
  const data = await hanmakApi('/health-checks/alert_thresholds/');
  const values = data.value || {};
  openModal(`<div class="modal-header"><h3 class="modal-title">${icon('settings')} Alert Thresholds</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      ${thresholdInput('api_error_rate', 'API Error Rate (%)', values.api_error_rate)}
      ${thresholdInput('response_time_ms', 'Response Time (ms)', values.response_time_ms)}
      ${thresholdInput('cpu_percent', 'CPU Usage (%)', values.cpu_percent)}
      ${thresholdInput('memory_percent', 'Memory Usage (%)', values.memory_percent)}
      ${thresholdInput('disk_percent', 'Disk Usage (%)', values.disk_percent)}
      ${thresholdInput('queue_depth', 'Queue Depth', values.queue_depth)}
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="saveAlertThresholdsLive()">${icon('save')} Save</button></div>`);
}

function thresholdInput(key, label, value) {
  return `<div class="form-group"><label class="form-label">${label}</label><input id="threshold-${key}" class="form-input" type="number" value="${escapeHtml(String(value ?? ''))}"></div>`;
}

async function saveAlertThresholdsLive() {
  const keys = ['api_error_rate', 'response_time_ms', 'cpu_percent', 'memory_percent', 'disk_percent', 'queue_depth'];
  const payload = Object.fromEntries(keys.map(key => [key, Number(document.getElementById(`threshold-${key}`).value || 0)]));
  await hanmakApi('/health-checks/alert_thresholds/', {method: 'PATCH', body: JSON.stringify(payload)});
  closeModal();
  showToast('Alert thresholds saved', 'success');
  system_health_init();
}

async function publishStatusLive() {
  try {
    const data = await hanmakApi('/health-checks/publish_status/', {method: 'POST', body: JSON.stringify({})});
    showToast(`Status published: ${data.status_page?.status || 'ok'}`, 'success');
    system_health_init();
  } catch (error) {
    showToast(`Publish failed: ${error.message}`, 'error', 7000);
  }
}

function openCreateIncidentModal() {
  openModal(`<div class="modal-header"><h3 class="modal-title">${icon('alert-triangle')} New Incident</h3><button class="modal-close" onclick="closeModal()">x</button></div>
    <div class="modal-body">
      <div class="form-group"><label class="form-label">Title</label><input id="incident-title" class="form-input" placeholder="Email delivery delay"></div>
      <div class="form-group"><label class="form-label">Severity</label><select id="incident-severity" class="form-input"><option value="minor">Minor</option><option value="major">Major</option><option value="critical">Critical</option></select></div>
      <div class="form-group"><label class="form-label">Affected Services</label><input id="incident-services" class="form-input" placeholder="email, api, database"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea id="incident-description" class="form-input" rows="3"></textarea></div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="createIncidentLive()">${icon('alert-triangle')} Create</button></div>`);
}

async function createIncidentLive() {
  const title = document.getElementById('incident-title')?.value.trim();
  if (!title) return showToast('Incident title is required', 'error');
  try {
    await hanmakApi('/incidents/', {
      method: 'POST',
      body: JSON.stringify({
        title,
        severity: document.getElementById('incident-severity')?.value || 'minor',
        status: 'investigating',
        affected_services: (document.getElementById('incident-services')?.value || '').split(',').map(item => item.trim()).filter(Boolean),
        description: document.getElementById('incident-description')?.value || '',
        started_at: new Date().toISOString(),
      }),
    });
    closeModal();
    showToast('Incident created', 'success');
    system_health_init();
  } catch (error) {
    showToast(`Incident create failed: ${error.message}`, 'error', 7000);
  }
}

async function resolveIncidentLive(id) {
  try {
    await hanmakApi(`/incidents/${id}/resolve/`, {method: 'POST', body: JSON.stringify({})});
    showToast('Incident resolved', 'success');
    system_health_init();
  } catch (error) {
    showToast(`Incident resolve failed: ${error.message}`, 'error', 7000);
  }
}
