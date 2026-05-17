import { useApiQuery } from '../../hooks/useApi';
import { EP } from '../../api/endpoints';

export default function BackgroundTasks() {
  const { data, isLoading } = useApiQuery('task-runs', EP.TASK_RUNS, { page_size: 25 });
  const runs = data?.results || [];

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">Background Tasks</h1><p className="page-subtitle">Celery task queue status and history</p></div>
      </div>
      {isLoading ? <div>Loading…</div> : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead><tr><th>Task</th><th>Status</th><th>Queue</th><th>Started</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.task_name || r.task_type}</td>
                  <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                  <td>{r.queue || 'default'}</td>
                  <td>{r.started_at ? new Date(r.started_at).toLocaleTimeString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
