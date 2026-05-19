import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Pagination from '../../components/ui/Pagination';
import Avatar from '../../components/ui/Avatar';

const EVENT_TYPES = [
  { value: '', label: 'All Event Types' },
  { value: 'envelope.sent', label: 'Envelope Sent' },
  { value: 'envelope.completed', label: 'Envelope Completed' },
  { value: 'envelope.voided', label: 'Envelope Voided' },
  { value: 'user.login', label: 'User Login' },
  { value: 'user.created', label: 'User Created' },
  { value: 'template.created', label: 'Template Created' },
  { value: 'approval.approved', label: 'Approval Approved' },
  { value: 'approval.rejected', label: 'Approval Rejected' },
  { value: 'signing.completed', label: 'Signing Completed' },
];

const SEVERITY_COLOR = {
  info: 'primary',
  success: 'success',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
  debug: 'secondary',
};

const COMPLIANCE_STANDARDS = [
  {
    code: 'GDPR',
    label: 'GDPR',
    description: 'EU General Data Protection Regulation',
    color: '#2563eb',
    checks: [
      'Immutable audit log',
      'Actor & IP captured per event',
      'Evidence bundles for data subject requests',
    ],
  },
  {
    code: 'HIPAA',
    label: 'HIPAA',
    description: 'Health Insurance Portability and Accountability Act',
    color: '#059669',
    checks: [
      'Access log with timestamps',
      'SHA-256 manifest integrity',
      'Chain-of-custody evidence',
    ],
  },
  {
    code: 'SOC2',
    label: 'SOC 2',
    description: 'Service Organization Control 2',
    color: '#7c3aed',
    checks: [
      'Availability & security events logged',
      'Verifiable event integrity',
      'Retention policy enforcement',
    ],
  },
];

// SHA-256 of a string using Web Crypto API
async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function AuditTrail() {
  const toast = useToast();
  const navigate = useNavigate();

  // Filter state
  const [search, setSearch] = useState('');
  const [liveSearch, setLiveSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const searchTimer = useRef(null);

  // Modals / drawers
  const [createBundleModal, setCreateBundleModal] = useState(false);
  const [bundleEnvelopeId, setBundleEnvelopeId] = useState('');
  const [eventDrawer, setEventDrawer] = useState(null);

  // Integrity verifier
  const [hashInput, setHashInput] = useState('');
  const [hashResult, setHashResult] = useState(null); // { match: bool, computed: string }
  const [hashVerifying, setHashVerifying] = useState(false);

  // Compliance expanded standard
  const [expandedStandard, setExpandedStandard] = useState(null);

  // Data
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

  const { data: envelopesData, refetch: refetchEnvelopes } = useApiQuery(['envelopes-picker'], EP.ENVELOPES, { page_size: 100, status: 'completed' });
  const envelopes = envelopesData?.results ?? [];

  const handleRefresh = useCallback(() => {
    refetch();
    refetchEnvelopes();
  }, [refetch, refetchEnvelopes]);

  const createBundleMutation = useApiMutation(
    (payload) => apiClient.post(EP.EVIDENCE_BUNDLES, payload),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => {
        toast.success('Evidence bundle created');
        setCreateBundleModal(false);
        setBundleEnvelopeId('');
        navigate('/evidence-bundles');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleSearchChange = useCallback((value) => {
    setSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setLiveSearch(value);
      setPage(1);
    }, 300);
  }, []);

  const handleClear = useCallback(() => {
    setSearch('');
    setLiveSearch('');
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }, []);

  const handleCreateBundle = useCallback(() => {
    if (!bundleEnvelopeId) { toast.error('Select an envelope'); return; }
    createBundleMutation.mutate({ envelope: Number(bundleEnvelopeId) });
  }, [bundleEnvelopeId, createBundleMutation, toast]);

  const openCreateBundle = () => {
    setBundleEnvelopeId('');
    setCreateBundleModal(true);
  };

  // Integrity verification: hash the user-supplied canonical event ID or payload string
  const handleVerifyHash = useCallback(async () => {
    const trimmed = hashInput.trim();
    if (!trimmed) { toast.error('Enter a hash or event data to verify'); return; }
    setHashVerifying(true);
    setHashResult(null);
    try {
      // If input looks like a raw hash (64 hex chars), try to find a matching event
      const isHash = /^[0-9a-f]{64}$/i.test(trimmed);
      if (isHash) {
        // Try to match against any loaded event's payload hash
        const matchedEvent = events.find(
          (e) => e.sha256 === trimmed || e.integrity_hash === trimmed
        );
        if (matchedEvent) {
          setHashResult({ match: true, mode: 'event', event: matchedEvent });
        } else {
          setHashResult({ match: false, mode: 'event', hash: trimmed });
        }
      } else {
        // Treat as raw data — compute its SHA-256 and display
        const computed = await sha256Hex(trimmed);
        setHashResult({ mode: 'compute', computed });
      }
    } catch {
      toast.error('Hash verification failed');
    } finally {
      setHashVerifying(false);
    }
  }, [hashInput, events, toast]);

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(searchTimer.current), []);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Trail</h1>
          <p className="page-subtitle">Immutable activity log for all organization events</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={handleRefresh}>Refresh</button>
          <button className="btn btn-primary" onClick={openCreateBundle}>
            Create Evidence Bundle
          </button>
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
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
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

      {/* 2-column layout: event table + sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem', alignItems: 'start' }}>

        {/* Event Table */}
        <div>
          {isLoading ? (
            <Spinner center />
          ) : events.length === 0 ? (
            <EmptyState title="No audit events" message="No events match your current filters." />
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div
                style={{
                  padding: '0.75rem 1.25rem',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  {totalCount} total event{totalCount !== 1 ? 's' : ''} — page {page}
                </span>
                <span className="mono" style={{ fontSize: '0.75rem' }}>Immutable log</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Event Type</th>
                    <th>Actor</th>
                    <th>Target</th>
                    <th>IP / Location</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => {
                    const actor = event.actor_username || event.actor_name || 'System';
                    const geo = event.geolocation || event.geo_city
                      ? `${event.geo_city || ''}${event.geo_country ? `, ${event.geo_country}` : ''}`
                      : null;
                    return (
                      <tr
                        key={event.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setEventDrawer(event)}
                      >
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          {formatDateTime(event.created_at)}
                        </td>
                        <td>
                          <span
                            className="mono"
                            style={{
                              fontSize: '0.72rem',
                              padding: '0.2rem 0.4rem',
                              background: 'var(--bg-secondary)',
                              borderRadius: 4,
                              color: 'var(--primary)',
                            }}
                          >
                            {event.event_type}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Avatar name={actor} size={24} />
                            <span style={{ fontSize: '0.875rem' }}>{actor}</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          {event.object_type && (
                            <span style={{ fontSize: '0.72rem', marginRight: '0.3rem', color: 'var(--text-muted)' }}>
                              {event.object_type}
                            </span>
                          )}
                          {event.envelope_name || event.object_repr || event.target || '—'}
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>
                          <div className="mono" style={{ color: 'var(--text-muted)' }}>
                            {event.ip_address || '—'}
                          </div>
                          {geo && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 1 }}>
                              {geo}
                            </div>
                          )}
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={(e) => { e.stopPropagation(); setEventDrawer(event); }}
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <Pagination
                count={totalCount}
                page={page}
                hasNext={hasNext}
                hasPrev={hasPrev}
                onNext={() => setPage((p) => p + 1)}
                onPrev={() => setPage((p) => Math.max(1, p - 1))}
              />
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">

          {/* Integrity Verification */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem', fontSize: '0.9375rem' }}>
              Integrity Verification
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Paste a SHA-256 hash to verify event integrity, or paste raw event data to compute its hash.
            </p>
            <textarea
              className="form-input mono"
              rows={3}
              style={{ fontSize: '0.72rem', resize: 'vertical' }}
              placeholder="Paste SHA-256 hash or raw event data…"
              value={hashInput}
              onChange={(e) => { setHashInput(e.target.value); setHashResult(null); }}
            />
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: '0.5rem', width: '100%' }}
              disabled={hashVerifying || !hashInput.trim()}
              onClick={handleVerifyHash}
            >
              {hashVerifying ? 'Verifying…' : 'Verify / Compute Hash'}
            </button>

            {hashResult && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.75rem',
                  borderRadius: 6,
                  background: hashResult.match === false
                    ? 'rgba(239,68,68,0.08)'
                    : hashResult.match === true
                      ? 'rgba(16,185,129,0.08)'
                      : 'var(--bg-secondary)',
                  border: `1px solid ${hashResult.match === false ? '#ef4444' : hashResult.match === true ? '#10b981' : 'var(--border)'}`,
                }}
              >
                {hashResult.mode === 'event' && hashResult.match && (
                  <>
                    <div style={{ fontWeight: 600, color: '#10b981', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                      ✓ Hash matched
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Event: <strong>{hashResult.event.event_type}</strong> · {formatDateTime(hashResult.event.created_at)}
                    </div>
                  </>
                )}
                {hashResult.mode === 'event' && !hashResult.match && (
                  <>
                    <div style={{ fontWeight: 600, color: '#ef4444', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                      ✗ No matching event found
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                      {hashResult.hash}
                    </div>
                  </>
                )}
                {hashResult.mode === 'compute' && (
                  <>
                    <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                      Computed SHA-256
                    </div>
                    <div
                      className="mono"
                      style={{ fontSize: '0.68rem', wordBreak: 'break-all', color: 'var(--text-muted)', userSelect: 'all' }}
                    >
                      {hashResult.computed}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Compliance Standards */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9375rem' }}>
              Compliance Standards
            </div>
            <div className="flex flex-col gap-2">
              {COMPLIANCE_STANDARDS.map((std) => (
                <div key={std.code}>
                  <button
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.625rem',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '0.5rem 0',
                      textAlign: 'left',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onClick={() => setExpandedStandard(expandedStandard === std.code ? null : std.code)}
                  >
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0.2rem 0.5rem',
                        borderRadius: 4,
                        background: std.color,
                        color: '#fff',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        letterSpacing: '0.04em',
                        minWidth: 52,
                      }}
                    >
                      {std.label}
                    </span>
                    <span style={{ flex: 1, fontSize: '0.8125rem', fontWeight: 500 }}>
                      {std.description}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {expandedStandard === std.code ? '▲' : '▼'}
                    </span>
                  </button>
                  {expandedStandard === std.code && (
                    <ul style={{ margin: '0.5rem 0 0.5rem 0.5rem', padding: 0, listStyle: 'none' }}>
                      {std.checks.map((check) => (
                        <li
                          key={check}
                          style={{
                            fontSize: '0.75rem',
                            color: 'var(--text-muted)',
                            padding: '0.2rem 0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                          }}
                        >
                          <span style={{ color: '#10b981', fontWeight: 700 }}>✓</span>
                          {check}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.75rem', marginBottom: 0 }}>
              This audit log supports the above frameworks. Consult your compliance team for full coverage assessments.
            </p>
          </div>

          {/* Quick stats */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9375rem' }}>Log Summary</div>
            <div className="flex flex-col gap-2">
              {[
                ['Total Events', totalCount],
                ['Current Page', `${events.length} events`],
                ['Active Filters', [liveSearch, typeFilter, dateFrom, dateTo].filter(Boolean).length || 'None'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.3rem 0', borderBottom: '1px solid var(--border)' }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Event Drawer */}
      <Drawer
        open={!!eventDrawer}
        onClose={() => setEventDrawer(null)}
        title={eventDrawer?.event_type || 'Audit Event'}
        width={560}
      >
        {eventDrawer && (
          <div className="flex flex-col gap-3">
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <Badge color={SEVERITY_COLOR[eventDrawer.severity] || 'primary'}>
                {eventDrawer.severity || 'info'}
              </Badge>
              {eventDrawer.event_type && (
                <span
                  className="mono"
                  style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: 4, color: 'var(--primary)' }}
                >
                  {eventDrawer.event_type}
                </span>
              )}
            </div>

            {[
              ['Timestamp', formatDateTime(eventDrawer.created_at)],
              ['Actor', eventDrawer.actor_username || eventDrawer.actor_name || 'System'],
              ['Organization', eventDrawer.organization_name || eventDrawer.organization || '—'],
              ['IP Address', eventDrawer.ip_address || '—'],
              ['Geolocation', [
                eventDrawer.geo_city,
                eventDrawer.geo_region,
                eventDrawer.geo_country,
              ].filter(Boolean).join(', ') || eventDrawer.geolocation || '—'],
              ['Object Type', eventDrawer.object_type || '—'],
              ['Target / Reference', eventDrawer.envelope_name || eventDrawer.object_repr || eventDrawer.target || '—'],
              ['Message', eventDrawer.message || eventDrawer.detail || '—'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.875rem', wordBreak: 'break-word' }}>
                  {label === 'IP Address' ? (
                    <span className="mono">{value}</span>
                  ) : value}
                </div>
              </div>
            ))}

            {/* Integrity hash */}
            {(eventDrawer.sha256 || eventDrawer.integrity_hash) && (
              <div style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                  SHA-256 Integrity Hash
                </div>
                <div
                  className="mono"
                  style={{ fontSize: '0.68rem', wordBreak: 'break-all', color: 'var(--text-muted)', userSelect: 'all', cursor: 'text' }}
                >
                  {eventDrawer.sha256 || eventDrawer.integrity_hash}
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginTop: '0.4rem', fontSize: '0.72rem' }}
                  onClick={() => {
                    setHashInput(eventDrawer.sha256 || eventDrawer.integrity_hash);
                    setEventDrawer(null);
                  }}
                >
                  Verify in panel →
                </button>
              </div>
            )}

            {/* JSON Payload (collapsible) */}
            {eventDrawer.payload && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  JSON Payload
                </summary>
                <pre
                  className="mono"
                  style={{
                    background: 'var(--bg-secondary)',
                    padding: '0.75rem',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    overflow: 'auto',
                    maxHeight: 320,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  {JSON.stringify(eventDrawer.payload, null, 2)}
                </pre>
              </details>
            )}

            {/* Extra fields fallback */}
            {eventDrawer.extra && Object.keys(eventDrawer.extra).length > 0 && (
              <details>
                <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Extra Fields
                </summary>
                <pre
                  className="mono"
                  style={{
                    background: 'var(--bg-secondary)',
                    padding: '0.75rem',
                    borderRadius: 6,
                    fontSize: '0.72rem',
                    overflow: 'auto',
                    maxHeight: 200,
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {JSON.stringify(eventDrawer.extra, null, 2)}
                </pre>
              </details>
            )}

            <button
              className="btn btn-ghost btn-sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => {
                setEventDrawer(null);
                setCreateBundleModal(true);
              }}
            >
              Create Bundle for Envelope
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
            <button
              className="btn btn-primary"
              disabled={createBundleMutation.isPending || !bundleEnvelopeId}
              onClick={handleCreateBundle}
            >
              {createBundleMutation.isPending ? 'Creating…' : 'Create Bundle'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">
            Envelope <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <select
            className="form-input"
            value={bundleEnvelopeId}
            onChange={(e) => setBundleEnvelopeId(e.target.value)}
            autoFocus
          >
            <option value="">Select an envelope…</option>
            {envelopes.map((env) => (
              <option key={env.id} value={env.id}>{env.name} (#{env.id})</option>
            ))}
          </select>
          <p className="form-hint">Evidence bundles are generated per completed envelope.</p>
        </div>
      </Modal>
    </div>
  );
}
