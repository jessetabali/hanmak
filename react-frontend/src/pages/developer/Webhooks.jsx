import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatting';
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
  'envelope.signed',
  'approval.requested',
  'approval.decided',
  'template.created',
  'user.invited',
];

function generateSecret() {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function EndpointFormModal({ endpoint, onClose, onSaved }) {
  const toast = useToast();
  const [url, setUrl] = useState(endpoint?.target_url || '');
  const [description, setDescription] = useState(endpoint?.description || endpoint?.name || '');
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
        toast.success(endpoint ? 'Webhook endpoint saved' : 'Webhook endpoint created');
        onSaved?.();
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleEvent = useCallback(
    (ev) =>
      setEvents((prev) =>
        prev.includes(ev) ? prev.filter((x) => x !== ev) : [...prev, ev]
      ),
    []
  );

  const handleGenerate = () => {
    setSecret(generateSecret());
    toast.success('Secret generated');
  };

  const submit = () => {
    if (!url.trim()) return toast.error('Endpoint URL is required');
    const payload = {
      target_url: url.trim(),
      name: description.trim() || url.trim(),
      description: description.trim(),
      events,
      is_active: isActive,
      ...(!endpoint && { organization: Number(localStorage.getItem('HANMAK_ORGANIZATION_ID')) }),
    };
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
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : endpoint ? 'Save' : 'Add Endpoint'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Endpoint URL *</label>
        <input
          className="form-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://yourapp.com/webhooks/hanmak"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input
          className="form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="CRM integration"
        />
      </div>
      {endpoint && (
        <div className="form-group">
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
          >
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active
          </label>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Signing Secret</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="form-input"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Auto-generated on server if blank"
            style={{ flex: 1 }}
          />
          <button className="btn btn-ghost" type="button" onClick={handleGenerate}>
            Generate
          </button>
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Subscribe to Events</label>
        <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
          {ALL_EVENTS.map((ev) => (
            <label
              key={ev}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={events.includes(ev)}
                onChange={() => toggleEvent(ev)}
              />
              <code style={{ fontSize: '0.75rem' }}>{ev}</code>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function TestDeliveryModal({ endpointId, onClose }) {
  const toast = useToast();
  const [eventType, setEventType] = useState(ALL_EVENTS[0]);
  const [response, setResponse] = useState(null);

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.WEBHOOK_TEST(endpointId), payload),
    {
      onSuccess: (res) => {
        toast.success('Test delivery sent');
        setResponse(res.data);
      },
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
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={() => mutation.mutate({ event_type: eventType })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Sending…' : 'Send Test'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Event Type</label>
        <select
          className="form-input"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
        >
          {ALL_EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {ev}
            </option>
          ))}
        </select>
      </div>
      {response && (
        <div className="form-group">
          <label className="form-label">Response</label>
          <pre
            style={{
              background: 'var(--bg-secondary)',
              padding: '0.75rem',
              borderRadius: '6px',
              fontSize: '0.75rem',
              overflow: 'auto',
              maxHeight: '200px',
            }}
          >
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
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
      onSuccess: () => {
        toast.success('Delivery replayed');
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  return (
    <Drawer
      open={!!endpoint}
      onClose={onClose}
      title={`Delivery History — ${endpoint?.name || endpoint?.target_url || ''}`}
    >
      {isLoading ? (
        <Spinner center />
      ) : deliveries.length === 0 ? (
        <EmptyState
          title="No Deliveries"
          message="No webhook deliveries recorded yet for this endpoint."
        />
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Event Type</th>
              <th>Status</th>
              <th>HTTP Status</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <tr key={d.id}>
                <td>
                  <code style={{ fontSize: '0.75rem' }}>{d.event_type || d.event || '—'}</code>
                </td>
                <td>
                  <Badge
                    color={
                      d.status === 'delivered'
                        ? 'success'
                        : d.status === 'failed'
                        ? 'danger'
                        : 'secondary'
                    }
                  >
                    {d.status}
                  </Badge>
                </td>
                <td style={{ fontSize: '0.8125rem' }}>{d.response_status || d.http_status || '—'}</td>
                <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {d.created_at ? formatDateTime(d.created_at) : '—'}
                </td>
                <td>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Replay"
                    onClick={() => replayMutation.mutate(d.id)}
                    disabled={replayMutation.isPending}
                  >
                    Replay
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
  const { data, isLoading, refetch } = useApiQuery(
    ['webhook-endpoints'],
    EP.WEBHOOK_ENDPOINTS
  );
  const endpoints = data?.results ?? data ?? [];

  // Fetch recent deliveries for stats
  const { data: deliveriesData } = useApiQuery(
    ['webhook-deliveries-stats'],
    EP.WEBHOOK_DELIVERIES,
    { page_size: 200 }
  );
  const allDeliveries = deliveriesData?.results ?? deliveriesData ?? [];
  const deliveryTotal = allDeliveries.length;
  const deliverySucceeded = allDeliveries.filter(
    (d) => d.status === 'delivered' || (d.response_status >= 200 && d.response_status < 300)
  ).length;
  const deliveryFailed = allDeliveries.filter(
    (d) => d.status === 'failed' || d.status === 'error'
  ).length;
  const successRate = deliveryTotal > 0 ? Math.round((deliverySucceeded / deliveryTotal) * 100) : null;
  const latencies = allDeliveries
    .map((d) => d.response_time_ms ?? d.duration_ms ?? d.latency_ms)
    .filter((n) => typeof n === 'number' && n >= 0);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [historyDrawer, setHistoryDrawer] = useState({ open: false, endpoint: null });
  const [testModal, setTestModal] = useState({ open: false, endpointId: null });
  const [confirmDelete, setConfirmDelete] = useState(null);

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.WEBHOOK_ENDPOINT(id)),
    {
      invalidateKeys: ['webhook-endpoints'],
      onSuccess: () => toast.success('Webhook endpoint deleted'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-subtitle">
            Configure HTTP endpoints to receive real-time event notifications
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Add Endpoint
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
        {/* Endpoints list */}
        <div className="card" style={{ padding: 0 }}>
          {endpoints.length === 0 ? (
            <div style={{ padding: '2rem' }}>
              <EmptyState
                title="No Webhook Endpoints"
                message="Add an endpoint to start receiving real-time event notifications."
              />
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>URL</th>
                  <th>Events</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {endpoints.map((wh) => {
                  const events = Array.isArray(wh.events) ? wh.events : [];
                  const shownEvents = events.slice(0, 2);
                  const extraCount = events.length - 2;
                  return (
                    <tr key={wh.id}>
                      <td style={{ maxWidth: '260px' }}>
                        <code
                          className="mono"
                          style={{
                            fontSize: '0.78rem',
                            display: 'block',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {wh.target_url}
                        </code>
                        {(wh.name || wh.description) && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {wh.name || wh.description}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {shownEvents.map((ev) => (
                            <code
                              key={ev}
                              style={{
                                fontSize: '0.68rem',
                                background: 'var(--bg-secondary)',
                                padding: '1px 5px',
                                borderRadius: '3px',
                              }}
                            >
                              {ev}
                            </code>
                          ))}
                          {extraCount > 0 && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                                padding: '1px 4px',
                              }}
                            >
                              +{extraCount} more
                            </span>
                          )}
                          {events.length === 0 && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              None
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge color={wh.is_active ? 'success' : 'secondary'}>
                          {wh.is_active ? 'Active' : 'Disabled'}
                        </Badge>
                      </td>
                      <td
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {wh.created_at ? formatDate(wh.created_at) : '—'}
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Edit"
                            onClick={() => setEditModal(wh)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Test"
                            onClick={() =>
                              setTestModal({ open: true, endpointId: wh.id })
                            }
                          >
                            Test
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="History"
                            onClick={() =>
                              setHistoryDrawer({ open: true, endpoint: wh })
                            }
                          >
                            History
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete"
                            onClick={() => setConfirmDelete(wh)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '1rem' }}>Delivery Stats</div>

            {/* Success rate bar */}
            {successRate !== null && (
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                  <span>Success Rate</span>
                  <span style={{ fontWeight: 700, color: successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444' }}>
                    {successRate}%
                  </span>
                </div>
                <div style={{ height: '7px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${successRate}%`,
                      height: '100%',
                      background: successRate >= 95 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444',
                      borderRadius: '4px',
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>
            )}

            {[
              ['Total Endpoints', endpoints.length, 'secondary'],
              ['Active', endpoints.filter((e) => e.is_active).length, 'success'],
              ['Disabled', endpoints.filter((e) => !e.is_active).length, 'warning'],
              ['Recent Deliveries', deliveryTotal > 0 ? deliveryTotal : '—', 'secondary'],
              ['Succeeded', deliverySucceeded > 0 ? deliverySucceeded : '—', 'success'],
              ['Failed', deliveryFailed > 0 ? deliveryFailed : '—', deliveryFailed > 0 ? 'danger' : 'secondary'],
              ...(avgLatency !== null ? [['Avg Latency', `${avgLatency} ms`, avgLatency < 500 ? 'success' : avgLatency < 2000 ? 'warning' : 'danger']] : []),
            ].map(([l, v, c]) => (
              <div
                key={l}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.375rem 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: '0.8125rem' }}>{l}</span>
                <Badge color={c}>{v}</Badge>
              </div>
            ))}
          </div>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Retry Policy</div>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
              <div>
                Retries: <strong>5 attempts</strong>
              </div>
              <div>
                Backoff: <strong>Exponential (1m, 5m, 30m, 2h, 24h)</strong>
              </div>
              <div>
                Timeout: <strong>30 seconds per attempt</strong>
              </div>
            </div>
          </div>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Available Events</div>
            <div className="flex flex-col gap-1" style={{ fontSize: '0.78rem' }}>
              {ALL_EVENTS.map((ev) => (
                <div
                  key={ev}
                  style={{ padding: '0.25rem 0', borderBottom: '1px solid var(--border)' }}
                >
                  <code style={{ color: 'var(--primary)', fontSize: '0.72rem' }}>{ev}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals & Drawers */}
      {createModal && (
        <EndpointFormModal onClose={() => setCreateModal(false)} onSaved={refetch} />
      )}

      {editModal && (
        <EndpointFormModal
          endpoint={editModal}
          onClose={() => setEditModal(null)}
          onSaved={refetch}
        />
      )}

      {testModal.open && (
        <TestDeliveryModal
          endpointId={testModal.endpointId}
          onClose={() => setTestModal({ open: false, endpointId: null })}
        />
      )}

      {historyDrawer.open && (
        <DeliveryHistoryDrawer
          endpoint={historyDrawer.endpoint}
          onClose={() => setHistoryDrawer({ open: false, endpoint: null })}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title="Delete Webhook Endpoint"
        message="Delete this webhook endpoint? All delivery history will be lost."
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
