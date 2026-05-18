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

const BUNDLE_STATUS_COLOR = {
  generated: 'success',
  pending: 'warning',
  generating: 'warning',
  verified: 'primary',
  failed: 'danger',
};

function getBundleStatus(bundle) {
  return bundle.status || (bundle.sha256 ? 'generated' : 'pending');
}

export default function EvidenceBundles() {
  const toast = useToast();

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [bundleForm, setBundleForm] = useState({ name: '', description: '', event_ids_text: '' });

  // Verify drawer state
  const [verifyDrawer, setVerifyDrawer] = useState({ open: false, bundle: null, result: null });

  // Detail drawer
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [detailDrawer, setDetailDrawer] = useState(false);

  const { data, isLoading, refetch } = useApiQuery(['evidence-bundles'], EP.EVIDENCE_BUNDLES);
  const bundles = data?.results ?? data ?? [];

  // Stats
  const total = bundles.length;
  const generated = bundles.filter((b) => getBundleStatus(b) === 'generated').length;
  const pending = bundles.filter((b) => getBundleStatus(b) === 'pending').length;
  const verified = bundles.filter((b) => getBundleStatus(b) === 'verified').length;

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.EVIDENCE_BUNDLES, payload),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => {
        toast.success('Evidence bundle created');
        setCreateModal(false);
        setBundleForm({ name: '', description: '', event_ids_text: '' });
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generateMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_GENERATE(id), {}),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => {
        toast.success('Generation started');
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generatePdfMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_GENERATE_PDF(id), {}),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: (res) => {
        toast.success('Signed PDF generated');
        if (res?.data?.url) window.open(res.data.url, '_blank');
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const verifyMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_VERIFY(id), {}),
    {
      onSuccess: (res, id) => {
        const bundle = bundles.find((b) => b.id === id) || null;
        setVerifyDrawer({ open: true, bundle, result: res.data });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreate = useCallback(() => {
    if (!bundleForm.name.trim()) { toast.error('Bundle name is required'); return; }
    const eventIds = bundleForm.event_ids_text
      .split(/[\n,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter((n) => !isNaN(n) && n > 0);
    createMutation.mutate({
      name: bundleForm.name.trim(),
      description: bundleForm.description,
      ...(eventIds.length > 0 && { audit_event_ids: eventIds }),
    });
  }, [bundleForm, createMutation, toast]);

  const openDetail = (bundle) => {
    setSelectedBundle(bundle);
    setDetailDrawer(true);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Evidence Bundles</h1>
          <p className="page-subtitle">Generate, verify, and inspect evidence packages for legal admissibility</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>Refresh</button>
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>+ New Bundle</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {[
          ['Total', total],
          ['Generated', generated],
          ['Pending', pending],
          ['Verified', verified],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      {isLoading ? (
        <Spinner center />
      ) : bundles.length === 0 ? (
        <EmptyState
          title="No evidence bundles"
          message="Create a bundle to generate a court-admissible evidence package."
          action={
            <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
              New Bundle
            </button>
          }
        />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Event Count</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => {
                const status = getBundleStatus(bundle);
                return (
                  <tr
                    key={bundle.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openDetail(bundle)}
                  >
                    <td>
                      <div style={{ fontWeight: 600 }}>{bundle.name || `Bundle #${bundle.id}`}</div>
                      {bundle.sha256 && (
                        <div
                          className="mono"
                          style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}
                        >
                          {bundle.sha256.slice(0, 16)}…
                        </div>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                      {bundle.description || '—'}
                    </td>
                    <td>{bundle.event_count ?? bundle.events?.length ?? '—'}</td>
                    <td>
                      <Badge color={BUNDLE_STATUS_COLOR[status] || statusColor(status)}>
                        {status}
                      </Badge>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {formatDate(bundle.created_at)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={generateMutation.isPending}
                          onClick={() => generateMutation.mutate(bundle.id)}
                          title="Generate Manifest"
                        >
                          Generate
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={generatePdfMutation.isPending}
                          onClick={() => generatePdfMutation.mutate(bundle.id)}
                          title="Generate Signed PDF"
                        >
                          Signed PDF
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={verifyMutation.isPending}
                          onClick={() => verifyMutation.mutate(bundle.id)}
                          title="Verify integrity"
                        >
                          Verify
                        </button>
                        {bundle.file_url && (
                          <a
                            className="btn btn-ghost btn-sm"
                            href={bundle.file_url}
                            download
                            onClick={(e) => e.stopPropagation()}
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Bundle Modal */}
      <Modal
        open={createModal}
        onClose={() => setCreateModal(false)}
        title="New Evidence Bundle"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={createMutation.isPending}
              onClick={handleCreate}
            >
              {createMutation.isPending ? 'Creating…' : 'Create Bundle'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">
            Name <span style={{ color: 'var(--danger)' }}>*</span>
          </label>
          <input
            className="form-input"
            placeholder="e.g. Q4 2024 Evidence Package"
            value={bundleForm.name}
            onChange={(e) => setBundleForm((f) => ({ ...f, name: e.target.value }))}
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="Purpose of this evidence bundle…"
            value={bundleForm.description}
            onChange={(e) => setBundleForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="form-group">
          <label className="form-label">
            Audit Event IDs
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
              (comma or newline separated, optional)
            </span>
          </label>
          <textarea
            className="form-input mono"
            rows={4}
            placeholder={'1001, 1002, 1003\nor one per line'}
            value={bundleForm.event_ids_text}
            onChange={(e) => setBundleForm((f) => ({ ...f, event_ids_text: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Verify Result Drawer */}
      <Drawer
        open={verifyDrawer.open}
        onClose={() => setVerifyDrawer({ open: false, bundle: null, result: null })}
        title={verifyDrawer.bundle ? `Verification — ${verifyDrawer.bundle.name || `Bundle #${verifyDrawer.bundle.id}`}` : 'Verification'}
        width={520}
      >
        {verifyDrawer.result && (
          <div className="flex flex-col gap-4">
            <div>
              <Badge color={verifyDrawer.result.valid ? 'success' : 'danger'} style={{ fontSize: '0.875rem', padding: '0.3rem 0.75rem' }}>
                {verifyDrawer.result.valid ? 'Valid' : 'Needs Review'}
              </Badge>
            </div>

            {/* Hash comparison */}
            {verifyDrawer.result.sha256 && (
              <div style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                  Manifest SHA-256
                </div>
                <div className="mono" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                  {verifyDrawer.result.sha256}
                </div>
              </div>
            )}

            {verifyDrawer.result.timestamp && (
              <div style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.3rem' }}>
                  Verification Timestamp
                </div>
                <div style={{ fontSize: '0.875rem' }}>
                  {formatDateTime(verifyDrawer.result.timestamp)}
                </div>
              </div>
            )}

            {/* Chain of custody */}
            {verifyDrawer.result.chain_of_custody?.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>
                  Chain of Custody
                </div>
                <div className="flex flex-col gap-2">
                  {verifyDrawer.result.chain_of_custody.map((entry, i) => (
                    <div
                      key={i}
                      style={{
                        padding: '0.5rem 0.75rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: 6,
                        fontSize: '0.8125rem',
                      }}
                    >
                      {typeof entry === 'string' ? entry : JSON.stringify(entry)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full JSON */}
            <details>
              <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Full Verification Response
              </summary>
              <pre
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.75rem',
                  borderRadius: 6,
                  fontSize: '0.72rem',
                  overflow: 'auto',
                  maxHeight: 360,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {JSON.stringify(verifyDrawer.result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Drawer>

      {/* Bundle Detail Drawer */}
      <Drawer
        open={detailDrawer}
        onClose={() => setDetailDrawer(false)}
        title={selectedBundle?.name || `Bundle #${selectedBundle?.id}`}
        width={480}
      >
        {selectedBundle && (
          <div className="flex flex-col gap-3">
            {[
              ['Status', (
                <Badge color={BUNDLE_STATUS_COLOR[getBundleStatus(selectedBundle)] || 'secondary'}>
                  {getBundleStatus(selectedBundle)}
                </Badge>
              )],
              ['Description', selectedBundle.description || '—'],
              ['Event Count', selectedBundle.event_count ?? selectedBundle.events?.length ?? '—'],
              ['Created', formatDateTime(selectedBundle.created_at)],
              ['Generated At', selectedBundle.generated_at ? formatDateTime(selectedBundle.generated_at) : '—'],
            ].map(([label, value]) => (
              <div
                key={label}
                style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}
              >
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                  {label}
                </div>
                <div style={{ fontSize: '0.875rem' }}>{value}</div>
              </div>
            ))}

            {selectedBundle.sha256 && (
              <div style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                  Manifest SHA-256
                </div>
                <div className="mono" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                  {selectedBundle.sha256}
                </div>
              </div>
            )}

            {selectedBundle.signed_pdf_sha256 && (
              <div style={{ paddingBottom: '0.625rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.2rem' }}>
                  Signed PDF SHA-256
                </div>
                <div className="mono" style={{ fontSize: '0.72rem', wordBreak: 'break-all' }}>
                  {selectedBundle.signed_pdf_sha256}
                </div>
              </div>
            )}

            {/* Manifest items (event IDs/types) */}
            {selectedBundle.manifest_items?.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Manifest Items
                </div>
                <div className="flex flex-col gap-1">
                  {selectedBundle.manifest_items.map((item, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: '0.8125rem',
                        padding: '0.375rem 0.625rem',
                        background: 'var(--bg-secondary)',
                        borderRadius: 6,
                      }}
                    >
                      {typeof item === 'string' ? item : JSON.stringify(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Event IDs list */}
            {selectedBundle.audit_event_ids?.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Audit Event IDs
                </div>
                <div className="mono" style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                  {selectedBundle.audit_event_ids.join(', ')}
                </div>
              </div>
            )}

            {/* Verification history */}
            {selectedBundle.verifications?.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                  Verification History
                </div>
                <div className="flex flex-col gap-2">
                  {selectedBundle.verifications.map((v, i) => (
                    <div
                      key={i}
                      style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}
                    >
                      <span style={{ color: 'var(--text-muted)' }}>{formatDateTime(v.created_at || v.timestamp)}</span>
                      <Badge color={v.valid ? 'success' : 'danger'} size="sm">
                        {v.valid ? 'Valid' : 'Failed'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2" style={{ marginTop: '0.5rem' }}>
              <button
                className="btn btn-ghost btn-sm"
                disabled={generateMutation.isPending}
                onClick={() => generateMutation.mutate(selectedBundle.id)}
              >
                Generate Manifest
              </button>
              <button
                className="btn btn-ghost btn-sm"
                disabled={generatePdfMutation.isPending}
                onClick={() => generatePdfMutation.mutate(selectedBundle.id)}
              >
                Generate Signed PDF
              </button>
              <button
                className="btn btn-primary btn-sm"
                disabled={verifyMutation.isPending}
                onClick={() => {
                  setDetailDrawer(false);
                  verifyMutation.mutate(selectedBundle.id);
                }}
              >
                Verify Bundle
              </button>
              {selectedBundle.file_url && (
                <a className="btn btn-ghost btn-sm" href={selectedBundle.file_url} download>
                  Download Bundle
                </a>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
