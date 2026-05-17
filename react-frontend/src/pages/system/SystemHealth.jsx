import { useApiQuery } from '../../hooks/useApi';
import { EP } from '../../api/endpoints';

export default function SystemHealth() {
  const { data: summary, isLoading } = useApiQuery('health-summary', EP.HEALTH_SUMMARY, {}, { refetchInterval: 30_000 });

  return (
    <div>
      <div className="page-header">
        <div><h1 className="page-title">System Health</h1><p className="page-subtitle">Live service status and metrics</p></div>
      </div>
      {isLoading ? <div>Loading…</div> : (
        <div className="card" style={{ padding: '1.5rem' }}>
          <pre style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{JSON.stringify(summary, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}
