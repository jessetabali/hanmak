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
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [releaseReasonModal, setReleaseReasonModal] = useState(false);
  const [selectedHold, setSelectedHold] = useState(null);
  const [releaseReason, setReleaseReason] = useState('');

  // Form state
  const [form, setForm] = useState({ name: '', description: '', reason: '', custodians: '' });

  const { data, isLoading, refetch } = useApiQuery(['legal-holds'], EP.LEGAL_HOLDS);
  const holds = data?.results ?? [];

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.LEGAL_HOLDS, payload),
    {
      invalidateKeys: ['legal-holds'],
      onSuccess: () => { toast.success('Legal hold created'); setCreateModal(false); setForm({ name: '', description: '', reason: '', custodians: '' }); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const releaseMutation = useApiMutation(
    ({ id, reason }) => apiClient.post(EP.LEGAL_HOLD_RELEASE(id), { reason }),
    {
      invalidateKeys: ['legal-holds'],
      onSuccess: () => { toast.success('Legal hold released'); setConfirmRelease(false); setDetailDrawer(false); setReleaseReason(''); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreate = useCallback(() => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    const custodians = form.custodians.split('\n').map(e => e.trim()).filter(Boolean);
    createMutation.mutate({ name: form.name.trim(), description: form.description, reason: form.reason, custodians });
  }, [form, createMutation, toast]);

  const openDetail = (hold) => { setSelectedHold(hold); setDetailDrawer(true); };
  const handleReleaseClick = () => { setReleaseReasonModal(true); };
  const handleReleaseConfirm = () => {
    if (!releaseReason.trim()) { toast.error('Release reason is required'); return; }
    setReleaseReasonModal(false);
    setConfirmRelease(true);
  };

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
                <th>Release Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={hold.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(hold)}>
                  <td><strong>{hold.name}</strong></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{hold.description || '—'}</td>
                  <td>
                    <Badge color={hold.is_active ? 'danger' : 'secondary'}>
                      {hold.is_active ? 'Active' : 'Released'}
                    </Badge>
                  </td>
                  <td>{hold.custodians?.length ?? 0}</td>
                  <td>{hold.document_count ?? hold.documents?.length ?? 0}</td>
                  <td>{formatDate(hold.created_at)}</td>
                  <td>{hold.released_at ? formatDate(hold.released_at) : '—'}</td>
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
          <input className="form-input" placeholder="e.g. Q4 2024 Litigation Hold" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} placeholder="Brief description of the hold" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Reason</label>
          <input className="form-input" placeholder="Legal basis for the hold" value={form.reason} onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Custodians (one email per line)</label>
          <textarea className="form-input" rows={4} placeholder="alice@company.com&#10;bob@company.com" value={form.custodians} onChange={(e) => setForm(f => ({ ...f, custodians: e.target.value }))} />
        </div>
      </Modal>

      {/* Release Reason Modal */}
      <Modal
        open={releaseReasonModal}
        onClose={() => setReleaseReasonModal(false)}
        title="Release Hold"
        size="sm"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setReleaseReasonModal(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleReleaseConfirm}>Proceed</button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Release Reason <span style={{ color: 'var(--danger)' }}>*</span></label>
          <textarea className="form-input" rows={3} placeholder="Reason for releasing this hold…" value={releaseReason} onChange={(e) => setReleaseReason(e.target.value)} />
        </div>
      </Modal>

      {/* Confirm Release */}
      <ConfirmDialog
        open={confirmRelease}
        onClose={() => setConfirmRelease(false)}
        onConfirm={() => releaseMutation.mutate({ id: selectedHold?.id, reason: releaseReason })}
        title="Confirm Release"
        message={`Release hold "${selectedHold?.name}"? Documents will no longer be preserved by this hold.`}
        confirmLabel="Release Hold"
        danger
        loading={releaseMutation.isPending}
      />

      {/* Detail Drawer */}
      <Drawer open={detailDrawer} onClose={() => setDetailDrawer(false)} title={selectedHold?.name || 'Legal Hold'} width={480}>
        {selectedHold && (
          <div className="flex flex-col gap-4">
            <div>
              <div className="detail-row" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Status</span>
                <Badge color={selectedHold.is_active ? 'danger' : 'secondary'}>
                  {selectedHold.is_active ? 'Active' : 'Released'}
                </Badge>
              </div>
              {[
                ['Description', selectedHold.description || '—'],
                ['Reason', selectedHold.reason || '—'],
                ['Created', formatDateTime(selectedHold.created_at)],
                ['Last Modified', formatDateTime(selectedHold.updated_at)],
                ['Release Date', selectedHold.released_at ? formatDate(selectedHold.released_at) : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  <span style={{ maxWidth: '60%', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            <div>
              <div className="section-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Custodians</div>
              {selectedHold.custodians?.length ? (
                <div className="flex flex-col gap-2">
                  {selectedHold.custodians.map((c, i) => (
                    <div key={i} style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: '0.875rem' }}>
                      {typeof c === 'string' ? c : (c.email || c.username || JSON.stringify(c))}
                    </div>
                  ))}
                </div>
              ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No custodians specified.</p>}
            </div>

            <div>
              <div className="section-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Documents</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {selectedHold.document_count ?? selectedHold.documents?.length ?? 0} document(s) under hold
              </p>
            </div>

            {selectedHold.is_active && (
              <button className="btn btn-danger" onClick={handleReleaseClick} disabled={releaseMutation.isPending}>
                Release Hold
              </button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
