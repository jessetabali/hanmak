import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime } from '../../utils/formatting';
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

export default function ComplianceExports() {
  const toast = useToast();
  const [queueModal, setQueueModal] = useState(false);
  const [exportType, setExportType] = useState('audit_events');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, refetch } = useApiQuery(['compliance-exports'], EP.COMPLIANCE_EXPORTS);
  const exports = data?.results ?? [];

  const queueMutation = useApiMutation(
    (payload) => apiClient.post(EP.COMPLIANCE_EXPORTS, payload),
    {
      invalidateKeys: ['compliance-exports'],
      onSuccess: () => {
        toast.success('Export queued successfully');
        setQueueModal(false);
        setExportType('audit_events');
        setDateFrom('');
        setDateTo('');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleQueue = useCallback(() => {
    queueMutation.mutate({
      type: exportType,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    });
  }, [exportType, dateFrom, dateTo, queueMutation]);

  const exportTypeLabel = (val) => EXPORT_TYPES.find(t => t.value === val)?.label || val;

  const getStatusColor = (status) => {
    if (!status) return 'secondary';
    const s = String(status).toLowerCase();
    if (s === 'completed' || s === 'ready') return 'success';
    if (s === 'failed' || s === 'error') return 'danger';
    if (s === 'processing' || s === 'pending' || s === 'queued') return 'warning';
    return 'secondary';
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
                  <td>{exp.requested_by_name || exp.requested_by || exp.created_by || '—'}</td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {exp.date_from || exp.date_to
                      ? `${exp.date_from || '∞'} → ${exp.date_to || '∞'}`
                      : 'All dates'}
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {formatDateTime(exp.created_at)}
                  </td>
                  <td>
                    {exp.file_url ? (
                      <a className="btn btn-ghost btn-sm" href={exp.file_url} target="_blank" rel="noreferrer">
                        Download
                      </a>
                    ) : (exp.status === 'processing' || exp.status === 'pending' || exp.status === 'queued') ? (
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
          <select className="form-input" value={exportType} onChange={(e) => setExportType(e.target.value)}>
            {EXPORT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Date From</label>
            <input className="form-input" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Date To</label>
            <input className="form-input" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', margin: 0 }}>
          Leave date fields empty to export all records. Exports are generated asynchronously.
        </p>
      </Modal>
    </div>
  );
}
