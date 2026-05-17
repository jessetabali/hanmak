import { useState, useCallback, useRef } from 'react';
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
import Pagination from '../../components/ui/Pagination';

const EVENT_TYPES = [
  { value: '', label: 'All Event Types' },
  { value: 'envelope.sent', label: 'Envelope Sent' },
  { value: 'envelope.completed', label: 'Envelope Completed' },
  { value: 'envelope.voided', label: 'Envelope Voided' },
  { value: 'user.login', label: 'User Login' },
  { value: 'user.logout', label: 'User Logout' },
  { value: 'template.created', label: 'Template Created' },
  { value: 'template.updated', label: 'Template Updated' },
  { value: 'approval.approved', label: 'Approval Approved' },
  { value: 'approval.rejected', label: 'Approval Rejected' },
  { value: 'api.request', label: 'API Request' },
  { value: 'webhook.delivered', label: 'Webhook Delivered' },
];

const SEVERITY_COLORS = {
  info: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
  debug: 'secondary',
};

export default function AuditTrail() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [createBundleModal, setCreateBundleModal] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [bundleForm, setBundleForm] = useState({ name: '', description: '' });
  const [liveSearch, setLiveSearch] = useState('');
  const searchTimer = useRef(null);

  const { data, isLoading, refetch } = useApiQuery(
    ['audit-events', liveSearch, typeFilter, dateFrom, dateTo, page],
    EP.AUDIT_EVENTS,
    {
      search: liveSearch || undefined,
      event_type: typeFilter || undefined,
      date_after: dateFrom || undefined,
      date_before: dateTo ? dateTo + 'T23:59:59' : undefined,
      page,
    }
  );

  const events = data?.results ?? [];
  const totalCount = data?.count ?? 0;
  const hasNext = !!data?.next;
  const hasPrev = !!data?.previous;

  const createBundleMutation = useApiMutation(
    (payload) => apiClient.post(EP.EVIDENCE_BUNDLES, payload),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => {
        toast.success('Evidence bundle created');
        setCreateBundleModal(false);
        setSelectedEvents(new Set());
        setBundleForm({ name: '', description: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setLiveSearch(value); setPage(1); }, 300);
  }, []);

  const handleFilter = useCallback(() => {
    setPage(1);
    refetch();
  }, [refetch]);

  const handleClear = useCallback(() => {
    setSearch('');
    setLiveSearch('');
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  const toggleEvent = (id) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedEvents.size === events.length) setSelectedEvents(new Set());
    else setSelectedEvents(new Set(events.map(e => e.id)));
  };

  const handleCreateBundle = useCallback(() => {
    if (!bundleForm.name.trim()) { toast.error('Bundle name is required'); return; }
    if (selectedEvents.size === 0) { toast.error('Select at least one event'); return; }
    createBundleMutation.mutate({
      name: bundleForm.name.trim(),
      description: bundleForm.description,
      event_ids: [...selectedEvents],
    });
  }, [bundleForm, selectedEvents, createBundleMutation, toast]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">Immutable activity log for all organization events</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          {selectedEvents.size > 0 && (
            <button className="btn btn-primary" onClick={() => setCreateBundleModal(true)}>
              Create Bundle ({selectedEvents.size})
            </button>
          )}
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="card" style={{ padding: '0.75rem 1rem', marginBottom: '1rem' }}>
        <div className="table-toolbar" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
          <input
            className="form-input"
            placeholder="Search events…"
            style={{ width: 260 }}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
          <select
            className="form-input"
            style={{ width: 200 }}
            value={typeFilter}
            onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          >
            {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            className="form-input"
            type="date"
            style={{ width: 145 }}
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          />
          <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>→</span>
          <input
            className="form-input"
            type="date"
            style={{ width: 145 }}
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          />
          <button className="btn btn-ghost btn-sm" onClick={handleClear}>Clear</button>
        </div>
      </div>

      {/* Event Table */}
      {isLoading ? (
        <Spinner center />
      ) : events.length === 0 ? (
        <EmptyState title="No audit events" message="No events match your current filters." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--border)', fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>{totalCount} total events — page {page}</span>
            <span className="mono">Immutable log</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>
                  <input type="checkbox" checked={selectedEvents.size === events.length && events.length > 0} onChange={toggleAll} />
                </th>
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Actor</th>
                <th>Target</th>
                <th>IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedEvent(event)}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedEvents.has(event.id)} onChange={() => toggleEvent(event.id)} />
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(event.created_at)}
                  </td>
                  <td>
                    <span className="mono" style={{ fontSize: '0.75rem', padding: '0.2rem 0.4rem', background: 'var(--bg-secondary)', borderRadius: 4, color: 'var(--primary)' }}>
                      {event.event_type}
                    </span>
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>{event.actor_username || event.actor_name || 'System'}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {event.envelope_name || event.object_repr || event.target || '—'}
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }} className="mono">{event.ip_address || '—'}</td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.message || event.detail || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination
            count={totalCount}
            page={page}
            hasNext={hasNext}
            hasPrev={hasPrev}
            onNext={() => setPage(p => p + 1)}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
          />
        </div>
      )}

      {/* Event Detail Drawer */}
      <Drawer
        open={!!selectedEvent}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.event_type || 'Audit Event'}
        width={520}
      >
        {selectedEvent && (
          <div className="flex flex-col gap-3">
            <div>
              <Badge color={SEVERITY_COLORS[selectedEvent.severity] || 'primary'}>
                {selectedEvent.severity || 'info'}
              </Badge>
            </div>

            {[
              ['Event Type', <span className="mono">{selectedEvent.event_type}</span>],
              ['Actor', selectedEvent.actor_username || selectedEvent.actor_name || 'System'],
              ['Organization', selectedEvent.organization || '—'],
              ['IP Address', <span className="mono">{selectedEvent.ip_address || '—'}</span>],
              ['Timestamp', formatDateTime(selectedEvent.created_at)],
              ['Target', selectedEvent.envelope_name || selectedEvent.object_repr || selectedEvent.target || '—'],
              ['Message', selectedEvent.message || selectedEvent.detail || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <span style={{ fontSize: '0.875rem' }}>{value}</span>
              </div>
            ))}

            {selectedEvent.payload && (
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Payload</div>
                <pre style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 6, fontSize: '0.75rem', overflow: 'auto', maxHeight: 300, margin: 0 }}>
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => { setSelectedEvents(new Set([selectedEvent.id])); setSelectedEvent(null); setCreateBundleModal(true); }}
            >
              Create Evidence Bundle for This Event
            </button>
          </div>
        )}
      </Drawer>

      {/* Create Bundle Modal */}
      <Modal
        open={createBundleModal}
        onClose={() => setCreateBundleModal(false)}
        title="Create Evidence Bundle"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateBundleModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createBundleMutation.isPending} onClick={handleCreateBundle}>
              {createBundleMutation.isPending ? 'Creating…' : `Create Bundle (${selectedEvents.size} events)`}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Bundle Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            className="form-input"
            placeholder="e.g. Q4 Litigation Package"
            value={bundleForm.name}
            onChange={(e) => setBundleForm(f => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Brief description of the evidence package…"
            value={bundleForm.description}
            onChange={(e) => setBundleForm(f => ({ ...f, description: e.target.value }))}
          />
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
          {selectedEvents.size} audit event{selectedEvents.size !== 1 ? 's' : ''} selected.
        </p>
      </Modal>
    </div>
  );
}
