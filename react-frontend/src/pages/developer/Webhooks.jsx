import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const ALL_EVENTS = [
  'envelope.sent',
  'envelope.completed',
  'envelope.voided',
  'envelope.viewed',
  'signature.applied',
  'approval.granted',
  'approval.declined',
  'user.created',
  'template.updated',
];

function EndpointFormModal({ endpoint, onClose, onSaved }) {
  const toast = useToast();
  const [url, setUrl] = useState(endpoint?.target_url || '');
  const [name, setName] = useState(endpoint?.name || '');
  const [events, setEvents] = useState(endpoint?.events || []);
  const [isActive, setIsActive] = useState(endpoint?.is_active !== false);
  const [secret, setSecret] = useState('');

  const mutation = useApiMutation(
    (payload) =>
      endpoint
        ? apiClient.patch(EP.WEBHOOK_ENDPOINT(endpoint.id), payload)
        : apiClient.post(EP.WEBHOOK_ENDPOINTS, payload),
    {
      invalidateKeys: ['webhook-endpoints'],
      onSuccess: () => {
        toast.success(endpoint ? 'Webhook saved' : 'Webhook endpoint created');
        onSaved?.();
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleEvent = (ev) =>
    setEvents((prev) => (prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]));

  const submit = () => {
    if (!url.trim()) return toast.error('Endpoint URL is required');
    const payload = { target_url: url.trim(), name: name.trim() || url.trim(), events, is_active: isActive };
    if (secret) payload.signing_secret = secret;
    mutation.mutate(payload);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={endpoint ? 'Edit Webhook Endpoint' : 'Add Webhook Endpoint'}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : endpoint ? 'Save' : 'Add Endpoint'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Endpoint URL *</label>
        <input className="form-input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourapp.com/webhooks/hanmak" />
      </div>
      <div className="form-group">
        <label className="form-label">Name (optional)</label>
        <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="CRM integration" />
      </div>
      {endpoint && (
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Signing Secret (leave blank to auto-generate)</label>
        <input className="form-input" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Auto-generated if empty" />
      </div>
      <div className="form-group">
        <label className="form-label">Subscribe to Events</label>
        <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
          {ALL_EVENTS.map((ev) => (
            <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={events.includes(ev)} onChange={() => toggleEvent(ev)} />
              <code style={{ fontSize: '0.75rem' }}>{ev}</code>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TestDeliveryModal({ endpoint, onClose }) {
  const toast = useToast();
  const [eventType, setEventType] = useState((endpoint?.events || [])[0] || 'envelope.completed');

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.WEBHOOK_TEST(endpoint.id), payload),
    {
      onSuccess: () => { toast.success('Test delivery queued'); onClose(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  return (
    <Modal
      open
      onClose={onClose}
      title="Test Webhook Delivery"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate({ event_type: eventType })} disabled={mutation.isPending}>
            {mutation.isPending ? 'Sending…' : 'Send Test'}
          </button>
        </>
      }
    >
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
        Sends a test payload to <code className="mono">{endpoint.target_url}</code>
      </p>
      <div className="form-group">
        <label className="form-label">Event Type</label>
        <select className="form-input" value={eventType} onChange={(e) => setEventType(e.target.value)}>
          {ALL_EVENTS.map((ev) => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

function DeliveryHistoryDrawer({ endpoint, onClose }) {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(
    ['webhook-deliveries', endpoint?.id],
    EP.WEBHOOK_DELIVERIES,
    { endpoint: endpoint?.id, page_size: 20 },
    { enabled: !!endpoint?.id }
  );
  const deliveries = data?.results ?? data ?? [];

  const replayMutation = useApiMutation(
    (id) => apiClient.post(EP.WEBHOOK_DELIVERY_REPLAY(id)),
    {
      onSuccess: () => { toast.success('Delivery replayed'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  return (
    <Drawer open={!!endpoint} onClose={onClose} title={`Delivery History — ${endpoint?.name || endpoint?.target_url}`}>
      {isLoading ? (
        <Spinner center />
      ) : deliveries.length === 0 ? (
        <EmptyState title="No Deliveries" message="No webhook deliveries recorded yet for this endpoint." />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Event</th>
              <th>Status</th>
              <th>Response</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td><code style={{ fontSize: '0.75rem' }}>{d.event_type || d.event || '—'}</code></td>
                <td>
                  <Badge color={d.status === 'delivered' ? 'success' : d.status === 'failed' ? 'danger' : 'secondary'}>
                    {d.response_status || d.status}
                  </Badge>
                </td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.error_message || '—'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.created_at ? formatDateTime(d.created_at) : '—'}</td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Replay"
                    onClick={() => replayMutation.mutate(d.id)}
                    disabled={replayMutation.isPending}
                  >
                    ↻
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Drawer>
  );
}

export default function Webhooks() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['webhook-endpoints'], EP.WEBHOOK_ENDPOINTS);
  const endpoints = data?.results ?? data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [historyDrawer, setHistoryDrawer] = useState(null);
  const [testModal, setTestModal] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.WEBHOOK_ENDPOINT(id)),
    {
      invalidateKeys: ['webhook-endpoints'],
      onSuccess: () => toast.success('Webhook deleted'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const successCount = endpoints.filter((e) => e.last_delivery_status === 'delivered').length;
  const totalCount = endpoints.length;

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-subtitle">Configure HTTP endpoints to receive real-time event notifications</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Add Endpoint
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
        <div className="flex flex-col gap-4">
          {endpoints.length === 0 ? (
            <EmptyState title="No Webhook Endpoints" message="Add an endpoint to start receiving real-time event notifications." />
          ) : (
            endpoints.map((wh) => {
              const events = Array.isArray(wh.events) ? wh.events : [];
              return (
                <div key={wh.id} className="card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mono" style={{ fontSize: '0.8125rem', fontWeight: 600, wordBreak: 'break-all', marginBottom: '6px' }}>
                        {wh.target_url}
                      </div>
                      <div className="flex gap-2">
                        <Badge color={wh.is_active ? 'success' : 'secondary'}>{wh.is_active ? 'Active' : 'Disabled'}</Badge>
                        {wh.name && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{wh.name}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1" style={{ marginLeft: '0.75rem', flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-sm" title="Test" onClick={() => setTestModal(wh)}>▶</button>
                      <button className="btn btn-ghost btn-sm" title="History" onClick={() => setHistoryDrawer(wh)}>🕐</button>
                      <button className="btn btn-ghost btn-sm" title="Edit" onClick={() => setEditModal(wh)}>✏</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        title="Delete"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => setConfirmDelete(wh)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Subscribed Events</div>
                    <div className="flex" style={{ flexWrap: 'wrap', gap: '4px' }}>
                      {events.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No events subscribed</span>
                      ) : events.map((ev) => (
                        <code key={ev} style={{ fontSize: '0.72rem', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px' }}>{ev}</code>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    🔒 Signing secret:{' '}
                    <code className="mono">
                      {wh.signing_secret ? wh.signing_secret.slice(0, 8) + '••••••••' : '—'}
                    </code>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Delivery Stats</div>
            {[['Delivered', successCount, 'success'], ['Total Endpoints', totalCount, 'secondary']].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.8125rem' }}>{l}</span>
                <Badge color={c}>{v}</Badge>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Retry Policy</div>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
              <div>Retries: <strong>5 attempts</strong></div>
              <div>Backoff: <strong>Exponential (1m, 5m, 30m, 2h, 24h)</strong></div>
              <div>Timeout: <strong>30 seconds per attempt</strong></div>
            </div>
          </div>
        </div>
      </div>

      {createModal && (
        <EndpointFormModal onClose={() => setCreateModal(false)} onSaved={refetch} />
      )}

      {editModal && (
        <EndpointFormModal endpoint={editModal} onClose={() => setEditModal(null)} onSaved={refetch} />
      )}

      {testModal && (
        <TestDeliveryModal endpoint={testModal} onClose={() => setTestModal(null)} />
      )}

      {historyDrawer && (
        <DeliveryHistoryDrawer endpoint={historyDrawer} onClose={() => setHistoryDrawer(null)} />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { deleteMutation.mutate(confirmDelete.id); setConfirmDelete(null); }}
        title="Delete Webhook Endpoint"
        message="Delete this webhook endpoint? All delivery history will be lost."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
