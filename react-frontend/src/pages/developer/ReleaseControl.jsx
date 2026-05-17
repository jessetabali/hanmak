import { useState } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Drawer from '../../components/ui/Drawer';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const STAGES = ['planned', 'internal', 'beta', 'released', 'paused', 'retired'];
const MODULES = ['core', 'signing', 'templates', 'workflow', 'developer', 'admin', 'compliance', 'billing', 'integrations', 'operations'];

function stageColor(stage) {
  if (stage === 'released') return 'success';
  if (stage === 'beta') return 'warning';
  if (stage === 'paused' || stage === 'retired') return 'danger';
  return 'secondary';
}

function FlagFormModal({ flag, onClose }) {
  const toast = useToast();
  const [key, setKey] = useState(flag?.key || '');
  const [name, setName] = useState(flag?.name || '');
  const [module, setModule] = useState(flag?.module || 'core');
  const [stage, setStage] = useState(flag?.release_stage || 'planned');
  const [rollout, setRollout] = useState(flag?.rollout_percentage ?? 0);
  const [owner, setOwner] = useState(flag?.owner || '');
  const [isEnabled, setIsEnabled] = useState(flag?.is_enabled || false);
  const [description, setDescription] = useState(flag?.description || '');
  const [notes, setNotes] = useState(flag?.release_notes || '');

  const mutation = useApiMutation(
    (payload) =>
      flag
        ? apiClient.patch(EP.FEATURE_FLAG(flag.id), payload)
        : apiClient.post(EP.FEATURE_FLAGS, payload),
    {
      invalidateKeys: ['feature-flags', 'feature-flags-summary'],
      onSuccess: () => { toast.success('Release control saved'); onClose(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const submit = () => {
    if (!key.trim()) return toast.error('Feature key is required');
    mutation.mutate({
      key: key.trim(),
      name: name.trim(),
      module,
      release_stage: stage,
      rollout_percentage: Math.max(0, Math.min(100, Number(rollout))),
      owner: owner.trim(),
      is_enabled: isEnabled,
      description,
      release_notes: notes,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={flag ? 'Edit Release Control' : 'New Release Control'}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </>
      }
    >
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Key *</label>
          <input className="form-input" value={key} onChange={(e) => setKey(e.target.value)} disabled={!!flag} placeholder="workflow_builder" />
        </div>
        <div className="form-group">
          <label className="form-label">Name</label>
          <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow Builder" />
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Module</label>
          <select className="form-input" value={module} onChange={(e) => setModule(e.target.value)}>
            {MODULES.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Stage</label>
          <select className="form-input" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Rollout %</label>
          <input className="form-input" type="number" min={0} max={100} value={rollout} onChange={(e) => setRollout(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">Owner</label>
          <input className="form-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Product / Engineering" />
        </div>
      </div>
      <div className="form-group">
        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
          Enabled
        </label>
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-input" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Release Notes</label>
        <textarea className="form-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function ReviewModal({ flag, onClose }) {
  const toast = useToast();
  const DEFAULT_CHECKLIST = [
    { label: 'Backend endpoint verified', done: false },
    { label: 'Frontend flow verified', done: false },
    { label: 'Permissions and audit behavior checked', done: false },
    { label: 'Release notes reviewed', done: false },
  ];
  const [checklist, setChecklist] = useState(flag?.qa_checklist?.length ? flag.qa_checklist : DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState(flag?.release_notes || '');

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.FEATURE_FLAG_REVIEW(flag.id), payload),
    {
      invalidateKeys: ['feature-flags', 'feature-flags-summary'],
      onSuccess: () => { toast.success('QA review saved'); onClose(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleItem = (i) =>
    setChecklist((prev) => prev.map((item, idx) => idx === i ? { ...item, done: !item.done } : item));

  return (
    <Modal
      open
      onClose={onClose}
      title="QA Checklist"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => mutation.mutate({ qa_checklist: checklist, release_notes: notes })} disabled={mutation.isPending}>
            Save Review
          </button>
        </>
      }
    >
      <div style={{ fontWeight: 800, marginBottom: '0.75rem' }}>{flag?.name || flag?.key}</div>
      <div className="flex flex-col gap-2" style={{ marginBottom: '1rem' }}>
        {checklist.map((item, i) => (
          <label key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={item.done} onChange={() => toggleItem(i)} />
            {item.label}
          </label>
        ))}
      </div>
      <div className="form-group">
        <label className="form-label">Review Notes</label>
        <textarea className="form-input" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function FlagDetailDrawer({ flag, onClose }) {
  if (!flag) return null;
  return (
    <Drawer open={!!flag} onClose={onClose} title={flag.name || flag.key}>
      <div className="flex flex-col gap-4">
        <div className="card" style={{ padding: '1rem' }}>
          <div className="flex gap-2" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <Badge color={flag.is_enabled ? 'success' : 'secondary'}>{flag.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
            <Badge color={stageColor(flag.release_stage)}>{flag.release_stage || 'planned'}</Badge>
            <Badge color="secondary">{flag.module || 'core'}</Badge>
          </div>
          {[
            ['Key', <code className="mono" key="k">{flag.key}</code>],
            ['Owner', flag.owner || '—'],
            ['Rollout', `${Number(flag.rollout_percentage || 0)}%`],
            ['Created', flag.created_at ? formatDate(flag.created_at) : '—'],
            ['Last Reviewed', flag.last_reviewed_at ? formatDate(flag.last_reviewed_at) : '—'],
          ].map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: '1px solid var(--border)', fontSize: '0.875rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
        {flag.description && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Description</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{flag.description}</p>
          </div>
        )}
        {flag.release_notes && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>Release Notes</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{flag.release_notes}</p>
          </div>
        )}
        {flag.qa_checklist?.length > 0 && (
          <div className="card" style={{ padding: '1rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.875rem' }}>QA Checklist</div>
            <div className="flex" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
              {flag.qa_checklist.map((item, i) => (
                <Badge key={i} color={item.done ? 'success' : 'secondary'}>
                  {item.done ? '✓' : '○'} {item.label}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}

export default function ReleaseControl() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedFlag, setSelectedFlag] = useState(null);
  const [reviewModal, setReviewModal] = useState(null);
  const [releaseConfirm, setReleaseConfirm] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [detailDrawer, setDetailDrawer] = useState(null);

  const { data, isLoading, refetch } = useApiQuery(['feature-flags'], EP.FEATURE_FLAGS, { page_size: 250 });
  const { data: summaryData } = useApiQuery(['feature-flags-summary'], EP.FEATURE_FLAGS_SUMMARY);
  const allFlags = data?.results ?? data ?? [];

  const seedMutation = useApiMutation(
    () => apiClient.post(EP.FEATURE_FLAGS_SEED),
    {
      invalidateKeys: ['feature-flags', 'feature-flags-summary'],
      onSuccess: (res) => toast.success(`Seeded: ${res.data?.created ?? 0} created, ${res.data?.updated ?? 0} updated`),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleMutation = useApiMutation(
    ({ id, is_enabled }) => apiClient.patch(EP.FEATURE_FLAG(id), { is_enabled }),
    {
      invalidateKeys: ['feature-flags', 'feature-flags-summary'],
      onSuccess: (_, vars) => toast.success(`Flag ${vars.is_enabled ? 'enabled' : 'disabled'}`),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const releaseMutation = useApiMutation(
    (id) => apiClient.post(EP.FEATURE_FLAG_RELEASE(id), { release_stage: 'released', rollout_percentage: 100 }),
    {
      invalidateKeys: ['feature-flags', 'feature-flags-summary'],
      onSuccess: () => { toast.success('Feature released to 100%'); setReleaseConfirm(null); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const filteredFlags = allFlags.filter((f) => {
    if (activeTab === 'enabled') return f.is_enabled;
    if (activeTab === 'disabled') return !f.is_enabled;
    if (activeTab === 'review') return ['planned', 'internal', 'beta'].includes(f.release_stage);
    return true;
  });

  const summary = {
    total: allFlags.length,
    enabled: allFlags.filter((f) => f.is_enabled).length,
    disabled: allFlags.filter((f) => !f.is_enabled).length,
    inReview: allFlags.filter((f) => ['planned', 'internal', 'beta'].includes(f.release_stage)).length,
  };

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Release Control</h1>
          <p className="page-subtitle">Enable, QA, stage, and roll out HanMak feature modules</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => refetch()}>↻ Refresh</button>
          <button className="btn btn-ghost" onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            {seedMutation.isPending ? 'Seeding…' : '+ Seed Defaults'}
          </button>
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>+ New Control</button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        {[
          ['Total Flags', summary.total],
          ['Enabled', summary.enabled],
          ['Disabled', summary.disabled],
          ['In Review', summary.inReview],
        ].map(([label, value]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + Table */}
      <div className="card" style={{ padding: 0 }}>
        <div className="table-toolbar">
          <div className="tabs">
            {[['all', 'All'], ['enabled', 'Enabled'], ['disabled', 'Disabled'], ['review', 'In Review']].map(([id, label]) => (
              <button
                key={id}
                className={`tab${activeTab === id ? ' active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filteredFlags.length === 0 ? (
          <div style={{ padding: '2rem' }}>
            <EmptyState title="No flags" message="No release controls match this filter. Seed defaults to populate." />
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Flag Key</th>
                <th>Description</th>
                <th>Status</th>
                <th>Rollout</th>
                <th>Stage</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFlags.map((flag) => (
                <tr
                  key={flag.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setDetailDrawer(flag)}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{flag.name || flag.key}</div>
                    <code className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{flag.key}</code>
                    {flag.module && (
                      <Badge color="secondary" style={{ marginLeft: '0.25rem', fontSize: '0.7rem' }}>{flag.module}</Badge>
                    )}
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                    {flag.description || '—'}
                  </td>
                  <td>
                    <Badge color={flag.is_enabled ? 'success' : 'secondary'}>{flag.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: '80px' }}>
                      <div style={{ flex: 1, height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px' }}>
                        <div style={{ height: '100%', width: `${Number(flag.rollout_percentage || 0)}%`, background: 'var(--primary)', borderRadius: '3px' }} />
                      </div>
                      <span style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>{Number(flag.rollout_percentage || 0)}%</span>
                    </div>
                  </td>
                  <td>
                    <Badge color={stageColor(flag.release_stage)}>{flag.release_stage || 'planned'}</Badge>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleMutation.mutate({ id: flag.id, is_enabled: !flag.is_enabled })}
                      >
                        {flag.is_enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedFlag(flag); setEditModal(flag); }}>✏</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setReviewModal(flag)}>QA</button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setReleaseConfirm(flag)}
                        disabled={flag.release_stage === 'released'}
                      >
                        Release
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createModal && <FlagFormModal onClose={() => { setCreateModal(false); refetch(); }} />}
      {editModal && <FlagFormModal flag={editModal} onClose={() => { setEditModal(null); refetch(); }} />}
      {reviewModal && <ReviewModal flag={reviewModal} onClose={() => { setReviewModal(null); refetch(); }} />}
      {detailDrawer && <FlagDetailDrawer flag={detailDrawer} onClose={() => setDetailDrawer(null)} />}

      <ConfirmDialog
        open={!!releaseConfirm}
        onClose={() => setReleaseConfirm(null)}
        onConfirm={() => releaseMutation.mutate(releaseConfirm.id)}
        title="Release Feature"
        message={`Release "${releaseConfirm?.name || releaseConfirm?.key}" to 100% rollout? This will set the stage to "released" and enable it for all users.`}
        confirmLabel="Release to 100%"
      />
    </div>
  );
}
