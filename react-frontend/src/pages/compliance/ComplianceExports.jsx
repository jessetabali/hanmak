import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate, formatDateTime, formatBytes } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const EXPORT_TYPES = [
  { value: 'audit_events', label: 'Audit Events' },
  { value: 'envelopes', label: 'Envelopes' },
  { value: 'signatures', label: 'Signatures' },
  { value: 'users', label: 'Users' },
  { value: 'full', label: 'Full Export' },
];

const PROCESSING_STATUSES = new Set(['processing', 'pending', 'queued']);

export default function ComplianceExports() {
  const toast = useToast();
  const [queueModal, setQueueModal] = useState(false);
  const [exportForm, setExportForm] = useState({ type: 'audit_events', date_from: '', date_to: '' });

  const { data, isLoading, refetch } = useApiQuery(
    ['compliance-exports'],
    EP.COMPLIANCE_EXPORTS,
    {},
    {
      refetchInterval: (query) => {
        const exports = query.state.data?.results ?? query.state.data ?? [];
        const processingCount = Array.isArray(exports)
          ? exports.filter((e) => PROCESSING_STATUSES.has(e.status)).length
          : 0;
        return processingCount > 0 ? 10000 : false;
      },
    }
  );

  const exports = data?.results ?? data ?? [];

  const total = exports.length;
  const processing = exports.filter((e) => PROCESSING_STATUSES.has(e.status)).length;
  const ready = exports.filter((e) => e.status === 'completed' || e.status === 'ready').length;
  const failed = exports.filter((e) => e.status === 'failed' || e.status === 'error').length;

  const queueMutation = useApiMutation(
    (payload) => apiClient.post(EP.COMPLIANCE_EXPORTS, payload),
    {
      invalidateKeys: ['compliance-exports'],
      onSuccess: () => {
        toast.success('Export queued successfully');
        setQueueModal(false);
        setExportForm({ type: 'audit_events', date_from: '', date_to: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleQueue = useCallback(() => {
    const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
    queueMutation.mutate({
      type: exportForm.type,
      date_from: exportForm.date_from || undefined,
      date_to: exportForm.date_to || undefined,
      organization: orgId ? Number(orgId) : undefined,
    });
  }, [exportForm, queueMutation]);

  const exportTypeLabel = (val) => EXPORT_TYPES.find((t) => t.value === val)?.label || val;

  const getStatusColor = (status) => {
    if (!status) return 'secondary';
    const s = String(status).toLowerCase();
    if (s === 'completed' || s === 'ready') return 'success';
    if (s === 'failed' || s === 'error') return 'danger';
    if (PROCESSING_STATUSES.has(s)) return 'warning';
    return 'secondary';
  };

  const formatSize = (bytes) => {
    if (bytes == null) return '—';
    if (typeof bytes === 'string') return bytes;
    return formatBytes(bytes);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Compliance Exports</h1>
          <p className="page-subtitle">Export audit and document packages for regulators</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setQueueModal(true)}>Queue Export</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total', value: total },
          { label: 'Processing', value: processing, color: processing > 0 ? 'var(--warning)' : undefined },
          { label: 'Ready', value: ready, color: ready > 0 ? 'var(--success)' : undefined },
          { label: 'Failed', value: failed, color: failed > 0 ? 'var(--danger)' : undefined },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Spinner center />
      ) : exports.length === 0 ? (
        <EmptyState title="No exports yet" message="Queue an export to generate a compliance package." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Requested By</th>
                <th>Date Range</th>
                <th>Created</th>
                <th>Size</th>
                <th>Download</th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exp) => (
                <tr key={exp.id}>
                  <td><strong>{exportTypeLabel(exp.type || exp.export_type)}</strong></td>
                  <td>
                    <Badge color={getStatusColor(exp.status)}>
                      {exp.status || '—'}
                    </Badge>
                  </td>
                  <td style={{ fontSize: '0.875rem' }}>
                    {exp.requested_by_name || exp.requested_by || exp.created_by || '—'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {exp.date_from || exp.date_to
                      ? `${exp.date_from || '∞'} → ${exp.date_to || '∞'}`
                      : 'All dates'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {formatDateTime(exp.created_at)}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {formatSize(exp.file_size ?? exp.size)}
                  </td>
                  <td>
                    {exp.file_url ? (
                      <a className="btn btn-ghost btn-sm" href={exp.file_url} download>
                        Download
                      </a>
                    ) : PROCESSING_STATUSES.has(exp.status) ? (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Processing…</span>
                    ) : (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Queue Export Modal */}
      <Modal
        open={queueModal}
        onClose={() => setQueueModal(false)}
        title="Queue Compliance Export"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setQueueModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={queueMutation.isPending} onClick={handleQueue}>
              {queueMutation.isPending ? 'Queuing…' : 'Queue Export'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Export Type</label>
          <select
            className="form-input"
            value={exportForm.type}
            onChange={(e) => setExportForm((f) => ({ ...f, type: e.target.value }))}
          >
            {EXPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Date From</label>
            <input
              className="form-input"
              type="date"
              value={exportForm.date_from}
              onChange={(e) => setExportForm((f) => ({ ...f, date_from: e.target.value }))}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Date To</label>
            <input
              className="form-input"
              type="date"
              value={exportForm.date_to}
              onChange={(e) => setExportForm((f) => ({ ...f, date_to: e.target.value }))}
            />
          </div>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
          Leave date fields empty to export all records. Exports are generated asynchronously and may take a few minutes.
        </p>
      </Modal>
    </div>
  );
}
