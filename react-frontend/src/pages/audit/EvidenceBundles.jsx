import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDateTime, formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge, { statusColor } from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

export default function EvidenceBundles() {
  const toast = useToast();
  const [createModal, setCreateModal] = useState(false);
  const [verifyModal, setVerifyModal] = useState(false);
  const [selectedBundle, setSelectedBundle] = useState(null);
  const [detailDrawer, setDetailDrawer] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', event_ids_text: '' });
  const [qaResult, setQaResult] = useState(null);
  const [qaModal, setQaModal] = useState(false);

  const { data, isLoading, refetch } = useApiQuery(['evidence-bundles'], EP.EVIDENCE_BUNDLES);
  const bundles = data?.results ?? [];

  const createMutation = useApiMutation(
    (payload) => apiClient.post(EP.EVIDENCE_BUNDLES, payload),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => {
        toast.success('Evidence bundle created');
        setCreateModal(false);
        setForm({ name: '', description: '', event_ids_text: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generateMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_GENERATE(id), {}),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => toast.success('Manifest generated'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const generatePdfMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_GENERATE_PDF(id), {}),
    {
      invalidateKeys: ['evidence-bundles'],
      onSuccess: () => toast.success('Signed PDF generated'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const verifyMutation = useApiMutation(
    (id) => apiClient.post(EP.EVIDENCE_VERIFY(id), {}),
    {
      onSuccess: (res) => {
        setVerifyResult(res.data);
        setVerifyModal(true);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const visualQaMutation = useApiMutation(
    (id) => apiClient.get(`/evidence-bundles/${id}/visual-qa/`),
    {
      onSuccess: (res) => {
        setQaResult(res.data);
        setQaModal(true);
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreate = useCallback(() => {
    if (!form.name.trim()) { toast.error('Bundle name is required'); return; }
    const eventIds = form.event_ids_text
      .split(/[\n,\s]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(Number)
      .filter(n => !isNaN(n));
    createMutation.mutate({
      name: form.name.trim(),
      description: form.description,
      event_ids: eventIds.length > 0 ? eventIds : undefined,
    });
  }, [form, createMutation, toast]);

  const openDetail = (bundle) => { setSelectedBundle(bundle); setDetailDrawer(true); };

  const getBundleStatus = (bundle) => bundle.status || (bundle.sha256 ? 'generated' : 'pending');

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

      {isLoading ? (
        <Spinner center />
      ) : bundles.length === 0 ? (
        <EmptyState title="No evidence bundles" message="Create a bundle to generate a court-admissible evidence package." />
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Events</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bundles.map((bundle) => (
                <tr key={bundle.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(bundle)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{bundle.name || `Bundle #${bundle.id}`}</div>
                    {bundle.sha256 && (
                      <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 }}>
                        {bundle.sha256.slice(0, 16)}…
                      </div>
                    )}
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{bundle.description || '—'}</td>
                  <td>{bundle.event_count ?? bundle.events?.length ?? '—'}</td>
                  <td>
                    <Badge color={statusColor(getBundleStatus(bundle))}>
                      {getBundleStatus(bundle)}
                    </Badge>
                  </td>
                  <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{formatDate(bundle.created_at)}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={generateMutation.isPending}
                        onClick={() => generateMutation.mutate(bundle.id)}
                        title="Generate Manifest"
                      >
                        Manifest
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={generatePdfMutation.isPending}
                        onClick={() => generatePdfMutation.mutate(bundle.id)}
                        title="Generate Signed PDF"
                      >
                        PDF
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={verifyMutation.isPending}
                        onClick={() => { setSelectedBundle(bundle); verifyMutation.mutate(bundle.id); }}
                        title="Verify"
                      >
                        Verify
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={visualQaMutation.isPending}
                        onClick={() => { setSelectedBundle(bundle); visualQaMutation.mutate(bundle.id); }}
                        title="Visual QA"
                      >
                        QA
                      </button>
                    </div>
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
        title="New Evidence Bundle"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={createMutation.isPending} onClick={handleCreate}>
              {createMutation.isPending ? 'Creating…' : 'Create Bundle'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
          <input className="form-input" placeholder="e.g. Q4 2024 Evidence Package" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea className="form-input" rows={2} placeholder="Purpose of this evidence bundle…" value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Audit Event IDs (comma or newline separated, optional)</label>
          <textarea
            className="form-input mono"
            rows={4}
            placeholder="1001, 1002, 1003&#10;or one per line"
            value={form.event_ids_text}
            onChange={(e) => setForm(f => ({ ...f, event_ids_text: e.target.value }))}
          />
        </div>
      </Modal>

      {/* Verify Result Modal */}
      <Modal
        open={verifyModal}
        onClose={() => { setVerifyModal(false); setVerifyResult(null); }}
        title={`Verification — Bundle #${selectedBundle?.id}`}
        size="lg"
        footer={<button className="btn btn-ghost" onClick={() => { setVerifyModal(false); setVerifyResult(null); }}>Close</button>}
      >
        {verifyResult && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <Badge color={verifyResult.valid ? 'success' : 'danger'}>
                {verifyResult.valid ? 'Valid' : 'Needs Review'}
              </Badge>
            </div>
            <pre style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, fontSize: '0.75rem', overflow: 'auto', maxHeight: 400, margin: 0 }}>
              {JSON.stringify(verifyResult, null, 2)}
            </pre>
          </div>
        )}
      </Modal>

      {/* Visual QA Modal */}
      <Modal
        open={qaModal}
        onClose={() => { setQaModal(false); setQaResult(null); }}
        title={`Visual QA — Bundle #${selectedBundle?.id}`}
        size="lg"
        footer={<button className="btn btn-ghost" onClick={() => { setQaModal(false); setQaResult(null); }}>Close</button>}
      >
        {qaResult && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <Badge color={qaResult.status === 'ready' ? 'success' : 'warning'}>
                {qaResult.status || 'Unknown'}
              </Badge>
            </div>
            {qaResult.warnings?.length > 0 ? (
              <div className="flex flex-col gap-2" style={{ marginBottom: '1rem' }}>
                {qaResult.warnings.map((w, i) => (
                  <div key={i} style={{ color: 'var(--warning)', fontSize: '0.875rem', display: 'flex', gap: '0.5rem' }}>
                    <span>⚠</span> {w}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--success)', fontSize: '0.875rem', marginBottom: '1rem' }}>No visual QA warnings.</p>
            )}
            {qaResult.documents && (
              <pre style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 8, fontSize: '0.75rem', overflow: 'auto', maxHeight: 300, margin: 0 }}>
                {JSON.stringify(qaResult.documents, null, 2)}
              </pre>
            )}
          </div>
        )}
      </Modal>

      {/* Detail Drawer */}
      <Drawer open={detailDrawer} onClose={() => setDetailDrawer(false)} title={selectedBundle?.name || `Bundle #${selectedBundle?.id}`} width={480}>
        {selectedBundle && (
          <div className="flex flex-col gap-3">
            {[
              ['Status', <Badge color={statusColor(getBundleStatus(selectedBundle))}>{getBundleStatus(selectedBundle)}</Badge>],
              ['Description', selectedBundle.description || '—'],
              ['Event Count', selectedBundle.event_count ?? selectedBundle.events?.length ?? '—'],
              ['Created', formatDateTime(selectedBundle.created_at)],
              ['Generated At', formatDateTime(selectedBundle.generated_at)],
            ].map(([label, value]) => (
              <div key={label} style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>{label}</div>
                <div style={{ fontSize: '0.875rem' }}>{value}</div>
              </div>
            ))}

            {selectedBundle.sha256 && (
              <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Manifest SHA-256</div>
                <div className="mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{selectedBundle.sha256}</div>
              </div>
            )}

            {selectedBundle.signed_pdf_sha256 && (
              <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Signed PDF SHA-256</div>
                <div className="mono" style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}>{selectedBundle.signed_pdf_sha256}</div>
              </div>
            )}

            {selectedBundle.manifest_items?.length > 0 && (
              <div>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Manifest Items</div>
                <div className="flex flex-col gap-1">
                  {selectedBundle.manifest_items.map((item, i) => (
                    <div key={i} style={{ fontSize: '0.8125rem', padding: '0.375rem 0.625rem', background: 'var(--bg-secondary)', borderRadius: 6 }}>
                      {typeof item === 'string' ? item : JSON.stringify(item)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <button className="btn btn-ghost btn-sm" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate(selectedBundle.id)}>
                Generate Manifest
              </button>
              <button className="btn btn-ghost btn-sm" disabled={generatePdfMutation.isPending} onClick={() => generatePdfMutation.mutate(selectedBundle.id)}>
                Generate Signed PDF
              </button>
              <button className="btn btn-primary btn-sm" disabled={verifyMutation.isPending} onClick={() => { setDetailDrawer(false); verifyMutation.mutate(selectedBundle.id); }}>
                Verify Bundle
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
