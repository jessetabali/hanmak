import { useState, useCallback } from 'react';
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
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function LegalHolds() {
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState({ open: false, hold: null });
  const [releaseModal, setReleaseModal] = useState({ open: false, holdId: null });
  const [releaseReason, setReleaseReason] = useState('');
  const [form, setForm] = useState({ name: '', description: '', reason: '', custodians: '' });

  const { data, isLoading, refetch } = useApiQuery(['legal-holds'], EP.LEGAL_HOLDS);
  const holds = data?.results ?? data ?? [];

  const total = holds.length;
  const active = holds.filter((h) => h.status === 'active' || h.is_active).length;
  const released = holds.filter((h) => h.status === 'released' || (!h.is_active && h.released_at)).length;

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.LEGAL_HOLDS, payload),
    {
      invalidateKeys: ['legal-holds'],
      onSuccess: () => {
        toast.success('Legal hold created');
        setCreateModal(false);
        setForm({ name: '', description: '', reason: '', custodians: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const releaseMutation = useApiMutation(
    ({ id, reason }) => apiClient.post(EP.LEGAL_HOLD_RELEASE(id), { reason }),
    {
      invalidateKeys: ['legal-holds'],
      onSuccess: () => {
        toast.success('Legal hold released');
        setReleaseModal({ open: false, holdId: null });
        setDetailDrawer({ open: false, hold: null });
        setReleaseReason('');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreate = useCallback(() => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const custodian_emails = form.custodians.split('\n').map((e) => e.trim()).filter(Boolean);
    const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
    createMutation.mutate({
      name: form.name.trim(),
      description: form.description,
      reason: form.reason,
      custodian_emails,
      organization: orgId ? Number(orgId) : undefined,
    });
  }, [form, createMutation, toast]);

  const handleRelease = useCallback(() => {
    if (!releaseReason.trim()) { toast.error('Release reason is required'); return; }
    releaseMutation.mutate({ id: releaseModal.holdId, reason: releaseReason });
  }, [releaseReason, releaseModal.holdId, releaseMutation, toast]);

  const openDetail = (hold) => setDetailDrawer({ open: true, hold });
  const selectedHold = detailDrawer.hold;
  const holdIsActive = (h) => h && (h.status === 'active' || (h.is_active && h.status !== 'released'));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Legal Holds</h1>
          <p className="page-subtitle">Prevent deletion of documents under active holds</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>+ Create Legal Hold</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total', value: total },
          { label: 'Active', value: active, color: active > 0 ? 'var(--danger)' : undefined },
          { label: 'Released', value: released },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Spinner center />
      ) : holds.length === 0 ? (
        <EmptyState title="No legal holds" message="Create a hold to preserve documents for litigation or compliance." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Status</th>
                <th>Custodians</th>
                <th>Documents</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={hold.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(hold)}>
                  <td><strong>{hold.name}</strong></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem', maxWidth: 240 }}>
                    {hold.description ? (hold.description.length > 60 ? hold.description.slice(0, 60) + '…' : hold.description) : '—'}
                  </td>
                  <td>
                    <Badge color={holdIsActive(hold) ? 'danger' : 'secondary'}>
                      {holdIsActive(hold) ? 'Active' : 'Released'}
                    </Badge>
                  </td>
                  <td>{hold.custodian_emails?.length ?? hold.custodians?.length ?? 0}</td>
                  <td>{hold.document_count ?? hold.documents?.length ?? 0}</td>
                  <td>{formatDate(hold.created_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openDetail(hold)}>View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="Create Legal Hold"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? 'Creating…' : 'Create Hold'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input
            className="form-input"
            placeholder="e.g. Q4 2024 Litigation Hold"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="Brief description of the hold"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <input
            className="form-input"
            placeholder="Legal basis for the hold"
            value={form.reason}
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">Custodians</label>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem', marginTop: 0 }}>
            Enter email addresses, one per line
          </p>
          <textarea
            className="form-input"
            rows={4}
            placeholder={'alice@company.com\nbob@company.com'}
            value={form.custodians}
            onChange={(e) => setForm((f) => ({ ...f, custodians: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Release Reason Modal */}
      <Modal
        open={releaseModal.open}
        onClose={() => { setReleaseModal({ open: false, holdId: null }); setReleaseReason(''); }}
        title="Release Legal Hold"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => { setReleaseModal({ open: false, holdId: null }); setReleaseReason(''); }}>Cancel</button>
            <button className="btn btn-danger" disabled={releaseMutation.isPending} onClick={handleRelease}>
              {releaseMutation.isPending ? 'Releasing…' : 'Release Hold'}
            </button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginTop: 0, marginBottom: '1rem' }}>
          Releasing this hold will allow documents to be deleted per retention policies.
        </p>
        <div className="form-group">
          <label className="form-label">Release Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Reason for releasing this hold…"
            value={releaseReason}
            onChange={(e) => setReleaseReason(e.target.value)}
          />
        </div>
      </Modal>

      {/* Detail Drawer */}
      <Drawer
        open={detailDrawer.open}
        onClose={() => setDetailDrawer({ open: false, hold: null })}
        title={selectedHold?.name || 'Legal Hold'}
        width={480}
      >
        {selectedHold && (
          <div className="flex flex-col gap-4">
            <div>
              {[
                ['Status', <Badge key="status" color={holdIsActive(selectedHold) ? 'danger' : 'secondary'}>{holdIsActive(selectedHold) ? 'Active' : 'Released'}</Badge>],
                ['Description', selectedHold.description || '—'],
                ['Reason', selectedHold.reason || '—'],
                ['Documents', selectedHold.document_count ?? selectedHold.documents?.length ?? 0],
                ['Created', formatDateTime(selectedHold.created_at)],
                ['Last Modified', formatDateTime(selectedHold.updated_at)],
                ['Released', selectedHold.released_at ? formatDate(selectedHold.released_at) : '—'],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}
                >
                  <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{label}</span>
                  <span style={{ textAlign: 'right', maxWidth: '60%' }}>{value}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="section-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Custodians</div>
              {(selectedHold.custodian_emails?.length || selectedHold.custodians?.length) ? (
                <div className="flex flex-col gap-2">
                  {(selectedHold.custodian_emails || selectedHold.custodians || []).map((c, i) => (
                    <div
                      key={i}
                      style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: '0.875rem' }}
                    >
                      {typeof c === 'string' ? c : (c.email || c.username || JSON.stringify(c))}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No custodians specified.</p>
              )}
            </div>

            {holdIsActive(selectedHold) && (
              <button
                className="btn btn-danger"
                onClick={() => setReleaseModal({ open: true, holdId: selectedHold.id })}
                disabled={releaseMutation.isPending}
              >
                Release Hold
              </button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
