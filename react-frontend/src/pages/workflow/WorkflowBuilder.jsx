import { useState, useCallback } from 'react';
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
import ConfirmDialog from '../../components/ui/ConfirmDialog';

// ─── constants ───────────────────────────────────────────────────────────────

const STAGE_TYPES = [
  { value: 'signing', label: 'Signing', color: '#4f8ef7' },
  { value: 'approval', label: 'Approval', color: '#f59e0b' },
  { value: 'review', label: 'Review', color: '#14b8a6' },
  { value: 'notification', label: 'Notification', color: '#8b5cf6' },
  { value: 'condition', label: 'Condition', color: '#ef4444' },
];

function stageTypeColor(type) {
  return STAGE_TYPES.find((t) => t.value === type)?.color || '#6b7280';
}

function labelToKey(label, idx) {
  const k = String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return k || `stage_${idx + 1}`;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function WorkflowBuilder() {
  const navigate = useNavigate();
  const toast = useToast();

  // Create workflow modal
  const [createModal, setCreateModal] = useState({ open: false });
  const [createName, setCreateName] = useState('');
  const [createDesc, setCreateDesc] = useState('');
  const [createStages, setCreateStages] = useState([
    { label: 'Signer Review', stage_type: 'signing' },
    { label: 'Manager Approval', stage_type: 'approval' },
  ]);

  // Edit workflow drawer
  const [editDrawer, setEditDrawer] = useState({ open: false, workflow: null });
  const [stages, setStages] = useState([]); // local editor stages

  // Run modal
  const [runModal, setRunModal] = useState({ open: false, workflowId: null, workflowName: '' });
  const [runEnvelopeId, setRunEnvelopeId] = useState('');

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState({ open: false, id: null, name: '' });

  // ─── Data ───────────────────────────────────────────────────────────────────

  const { data, isLoading, refetch } = useApiQuery(['workflows'], EP.WORKFLOWS);
  const workflows = data?.results ?? data ?? [];

  const { data: runsData, refetch: refetchRuns } = useApiQuery(['workflow-runs'], EP.WORKFLOW_RUNS);
  const allRuns = runsData?.results ?? runsData ?? [];

  const { data: usersData, refetch: refetchUsers } = useApiQuery(['users'], EP.USERS);
  const users = usersData?.results ?? usersData ?? [];

  const { data: teamsData, refetch: refetchTeams } = useApiQuery(['teams'], EP.TEAMS);
  const teams = teamsData?.results ?? teamsData ?? [];

  // Envelopes for run modal (active)
  const { data: envelopesData, refetch: refetchEnvelopes } = useApiQuery(
    ['envelopes-active'],
    EP.ENVELOPES,
    { status: 'sent', page_size: 50 }
  );
  const envelopes = envelopesData?.results ?? envelopesData ?? [];

  // Stats
  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter((w) => w.status === 'active').length;
  const totalStages = workflows.reduce((sum, w) => sum + (w.stages?.length || 0), 0);
  const runningRuns = allRuns.filter((r) => r.status === 'running').length;

  // Build a quick lookup: workflowId -> workflow
  const workflowById = Object.fromEntries(workflows.map((w) => [w.id, w]));

  const handleRefresh = useCallback(() => {
    refetch();
    refetchRuns();
    refetchUsers();
    refetchTeams();
    refetchEnvelopes();
  }, [refetch, refetchRuns, refetchUsers, refetchTeams, refetchEnvelopes]);

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createWorkflowMutation = useApiMutation(
    (payload) => apiClient.post(EP.WORKFLOWS, payload),
    {
      invalidateKeys: ['workflows'],
      onSuccess: async (res) => {
        toast.success('Workflow created');
        setCreateModal({ open: false });
        // Post stages
        const newId = res.data?.id;
        if (newId && createStages.length) {
          const stagePayload = createStages
            .filter((s) => s.label.trim())
            .map((s, idx) => ({
              key: labelToKey(s.label, idx),
              label: s.label.trim(),
              stage_type: s.stage_type,
              order: idx + 1,
              config: {},
            }));
          if (stagePayload.length) {
            try {
              await apiClient.post(EP.WORKFLOW_REPLACE_STAGES(newId), { stages: stagePayload });
            } catch (e) {
              toast.error(`Stages not saved: ${e.message}`);
            }
          }
          // Open edit drawer for the new workflow
          const newWorkflow = { ...res.data, stages: stagePayload };
          openEditDrawer(newWorkflow);
        }
        handleRefresh();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const updateWorkflowMutation = useApiMutation(
    ({ id, payload }) => apiClient.patch(EP.WORKFLOW(id), payload),
    {
      invalidateKeys: ['workflows'],
      onSuccess: () => { toast.success('Workflow updated'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteWorkflowMutation = useApiMutation(
    (id) => apiClient.delete(EP.WORKFLOW(id)),
    {
      invalidateKeys: ['workflows'],
      onSuccess: () => { toast.success('Workflow deleted'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const saveStageMutation = useApiMutation(
    ({ id, stages: stagesPayload }) => apiClient.post(EP.WORKFLOW_REPLACE_STAGES(id), { stages: stagesPayload }),
    {
      invalidateKeys: ['workflows'],
      onSuccess: () => { toast.success('Stages saved'); handleRefresh(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const createRunMutation = useApiMutation(
    (payload) => apiClient.post(EP.WORKFLOW_RUNS, payload),
    {
      invalidateKeys: ['workflow-runs'],
      onSuccess: () => {
        toast.success('Workflow run started');
        setRunModal({ open: false, workflowId: null, workflowName: '' });
        setRunEnvelopeId('');
        handleRefresh();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function openEditDrawer(workflow) {
    setEditDrawer({ open: true, workflow });
    const existing = (workflow.stages ?? [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => ({
        key: s.key || labelToKey(s.label, 0),
        label: s.label || '',
        stage_type: s.stage_type || 'approval',
        assignee_user: s.assignee_user ?? s.config?.assignee_user ?? '',
        assignee_team: s.assignee_team ?? s.config?.assignee_team ?? '',
        order: s.order,
      }));
    setStages(existing);
  }

  function addStage(type) {
    setStages((prev) => {
      const order = prev.length + 1;
      const label = STAGE_TYPES.find((t) => t.value === type)?.label ?? 'Stage';
      return [
        ...prev,
        { key: labelToKey(`${label} ${order}`, order - 1), label: `${label} ${order}`, stage_type: type, assignee_user: '', assignee_team: '', order },
      ];
    });
  }

  function removeStage(idx) {
    setStages((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  }

  function moveStage(idx, dir) {
    setStages((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }

  function updateStageField(idx, field, value) {
    setStages((prev) => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  function saveStages() {
    if (!editDrawer.workflow) return;
    const stagePayload = stages
      .filter((s) => s.label.trim())
      .map((s, idx) => ({
        key: s.key || labelToKey(s.label, idx),
        label: s.label.trim(),
        stage_type: s.stage_type,
        order: s.order ?? idx + 1,
        config: {
          assignee_user: s.assignee_user || null,
          assignee_team: s.assignee_team || null,
        },
      }));
    saveStageMutation.mutate({ id: editDrawer.workflow.id, stages: stagePayload });
  }

  function submitCreate() {
    if (!createName.trim()) { toast.error('Workflow name is required.'); return; }
    const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
    createWorkflowMutation.mutate({
      name: createName.trim(),
      description: createDesc,
      status: 'draft',
      organization: orgId ? Number(orgId) : undefined,
    });
  }

  function submitRun() {
    if (!runEnvelopeId) { toast.error('Select an envelope.'); return; }
    createRunMutation.mutate({ workflow: runModal.workflowId, envelope: runEnvelopeId });
  }

  // ─── render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Workflow Builder</h1>
          <p className="page-subtitle">Design and manage multi-stage signing and approval workflows</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={handleRefresh}>Refresh</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setCreateName('');
              setCreateDesc('');
              setCreateStages([
                { label: 'Signer Review', stage_type: 'signing' },
                { label: 'Manager Approval', stage_type: 'approval' },
              ]);
              setCreateModal({ open: true });
            }}
          >
            + Create Workflow
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 4, marginBottom: '1.5rem' }}>
        <div className="stat-card"><div className="stat-label">Definitions</div><div className="stat-value">{totalWorkflows}</div></div>
        <div className="stat-card"><div className="stat-label">Active</div><div className="stat-value" style={{ color: '#10b981' }}>{activeWorkflows}</div></div>
        <div className="stat-card"><div className="stat-label">Total Stages</div><div className="stat-value">{totalStages}</div></div>
        <div className="stat-card"><div className="stat-label">Running</div><div className="stat-value" style={{ color: '#f59e0b' }}>{runningRuns}</div></div>
      </div>

      {/* Workflow card grid */}
      {isLoading ? (
        <Spinner center />
      ) : workflows.length === 0 ? (
        <EmptyState
          title="No workflows yet"
          message="Create your first workflow to automate document signing and approvals."
        />
      ) : (
        <div className="grid-auto" style={{ marginBottom: '2rem' }}>
          {workflows.map((workflow) => {
            const wfStages = (workflow.stages ?? []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const wfRuns = allRuns.filter((r) => r.workflow === workflow.id);
            const completedRuns = wfRuns.filter((r) => r.status === 'completed').length;

            return (
              <div
                key={workflow.id}
                className="card"
                style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                {/* Card header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {workflow.name}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {workflow.description || 'No description'}
                    </div>
                  </div>
                  <Badge color={statusColor(workflow.status)}>{workflow.status}</Badge>
                </div>

                {/* Stage badges */}
                <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                  {wfStages.length > 0 ? (
                    wfStages.map((stage, idx) => (
                      <span
                        key={stage.key || idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.72rem',
                          padding: '2px 7px',
                          borderRadius: '20px',
                          border: `1.5px solid ${stageTypeColor(stage.stage_type)}`,
                          color: stageTypeColor(stage.stage_type),
                          background: `${stageTypeColor(stage.stage_type)}15`,
                        }}
                      >
                        {stage.label} · {stage.stage_type}
                      </span>
                    ))
                  ) : (
                    <Badge color="warning">No stages</Badge>
                  )}
                </div>

                {/* Stats row */}
                <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  <span>{wfStages.length} stage{wfStages.length !== 1 ? 's' : ''}</span>
                  <span>{wfRuns.length} run{wfRuns.length !== 1 ? 's' : ''}</span>
                  <span>{completedRuns} completed</span>
                  {workflow.updated_at && (
                    <span style={{ marginLeft: 'auto' }}>{formatDate(workflow.updated_at)}</span>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-1" style={{ flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openEditDrawer(workflow)}
                  >
                    Edit Stages
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setRunEnvelopeId('');
                      setRunModal({ open: true, workflowId: workflow.id, workflowName: workflow.name });
                    }}
                  >
                    Create Run
                  </button>
                  {workflow.status === 'active' ? (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => updateWorkflowMutation.mutate({ id: workflow.id, payload: { status: 'archived' } })}
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ color: '#10b981' }}
                      onClick={() => updateWorkflowMutation.mutate({ id: workflow.id, payload: { status: 'active' } })}
                    >
                      Activate
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setConfirmDelete({ open: true, id: workflow.id, name: workflow.name })}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent runs section */}
      {allRuns.length > 0 && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><span className="card-title">Recent Workflow Runs</span></div>
          <table className="table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Workflow</th>
                <th>Current Stage</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody>
              {allRuns.slice(0, 10).map((run) => {
                const wf = workflowById[run.workflow];
                const currentStage = wf?.stages?.find((s) => s.key === run.current_stage_key);
                return (
                  <tr key={run.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>#{run.id}</div>
                      {run.envelope && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Envelope #{run.envelope}</div>
                      )}
                    </td>
                    <td style={{ fontSize: '0.875rem' }}>{wf?.name ?? `#${run.workflow}`}</td>
                    <td style={{ fontSize: '0.875rem' }}>
                      {currentStage ? (
                        <span>
                          {currentStage.label}{' '}
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>({run.current_stage_key})</span>
                        </span>
                      ) : run.current_stage_key ? (
                        run.current_stage_key
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Not started</span>
                      )}
                    </td>
                    <td><Badge color={statusColor(run.status)}>{run.status}</Badge></td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDateTime(run.started_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Create Workflow Modal ───────────────────────────────────────── */}
      <Modal
        open={createModal.open}
        onClose={() => setCreateModal({ open: false })}
        title="New Workflow"
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setCreateModal({ open: false })}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={submitCreate}
              disabled={createWorkflowMutation.isPending}
            >
              {createWorkflowMutation.isPending ? <Spinner /> : 'Create Workflow'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Name *</label>
          <input
            className="form-input"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Standard Approval Flow"
          />
        </div>
        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            rows={2}
            value={createDesc}
            onChange={(e) => setCreateDesc(e.target.value)}
            placeholder="Describe this workflow..."
          />
        </div>

        {/* Initial stages builder */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <label className="form-label" style={{ margin: 0 }}>Initial Stages</label>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCreateStages((prev) => [...prev, { label: `Stage ${prev.length + 1}`, stage_type: 'approval' }])}
            >
              + Add Stage
            </button>
          </div>
          {createStages.map((stage, idx) => (
            <div
              key={idx}
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px 40px', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}
            >
              <input
                className="form-input"
                value={stage.label}
                placeholder="Stage name"
                onChange={(e) => {
                  const next = [...createStages];
                  next[idx] = { ...next[idx], label: e.target.value };
                  setCreateStages(next);
                }}
              />
              <select
                className="form-input"
                value={stage.stage_type}
                onChange={(e) => {
                  const next = [...createStages];
                  next[idx] = { ...next[idx], stage_type: e.target.value };
                  setCreateStages(next);
                }}
              >
                {STAGE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--danger)' }}
                onClick={() => setCreateStages((prev) => prev.filter((_, i) => i !== idx))}
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      </Modal>

      {/* ─── Edit Stages Drawer ──────────────────────────────────────────── */}
      <Drawer
        open={editDrawer.open}
        onClose={() => setEditDrawer({ open: false, workflow: null })}
        title={editDrawer.workflow ? `Stage Editor — ${editDrawer.workflow.name}` : 'Stage Editor'}
      >
        {editDrawer.workflow && (
          <div className="flex flex-col gap-4">
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
              Add, reorder, and configure stages. Click Save when done.
            </p>

            {/* Stage list */}
            {stages.length === 0 ? (
              <EmptyState title="No stages" message="Add stages below." />
            ) : (
              <div className="flex flex-col gap-3">
                {stages.map((stage, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '0.875rem',
                      border: `2px solid ${stageTypeColor(stage.stage_type)}`,
                      borderRadius: '8px',
                      background: 'var(--bg-secondary)',
                    }}
                  >
                    {/* Stage header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          background: stageTypeColor(stage.stage_type),
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontWeight: 700, fontSize: '0.8125rem', flex: 1 }}>
                        Stage {idx + 1}
                      </span>
                      {/* Reorder buttons */}
                      <div className="flex gap-1">
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={idx === 0}
                          onClick={() => moveStage(idx, -1)}
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          disabled={idx === stages.length - 1}
                          onClick={() => moveStage(idx, 1)}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ color: 'var(--danger)' }}
                          onClick={() => removeStage(idx)}
                          title="Remove stage"
                        >
                          &times;
                        </button>
                      </div>
                    </div>

                    {/* Stage fields */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Label</label>
                        <input
                          className="form-input"
                          value={stage.label}
                          onChange={(e) => updateStageField(idx, 'label', e.target.value)}
                          placeholder="Stage label"
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Type</label>
                        <select
                          className="form-input"
                          value={stage.stage_type}
                          onChange={(e) => updateStageField(idx, 'stage_type', e.target.value)}
                        >
                          {STAGE_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Assignee User</label>
                        <select
                          className="form-input"
                          value={stage.assignee_user || ''}
                          onChange={(e) => updateStageField(idx, 'assignee_user', e.target.value)}
                        >
                          <option value="">Any / unassigned</option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.display_name || u.username || u.email}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">Assignee Team</label>
                        <select
                          className="form-input"
                          value={stage.assignee_team || ''}
                          onChange={(e) => updateStageField(idx, 'assignee_team', e.target.value)}
                        >
                          <option value="">Any / no team</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add stage buttons */}
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Add Stage</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {STAGE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    className="btn btn-ghost btn-sm"
                    style={{ border: `2px solid ${t.color}`, color: t.color }}
                    onClick={() => addStage(t.value)}
                  >
                    + {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Save button */}
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={saveStages}
                disabled={saveStageMutation.isPending}
              >
                {saveStageMutation.isPending ? <Spinner /> : 'Save Stages'}
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* ─── Create Run Modal ────────────────────────────────────────────── */}
      <Modal
        open={runModal.open}
        onClose={() => setRunModal({ open: false, workflowId: null, workflowName: '' })}
        title={`Create Run — ${runModal.workflowName}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRunModal({ open: false, workflowId: null, workflowName: '' })}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={submitRun}
              disabled={createRunMutation.isPending}
            >
              {createRunMutation.isPending ? <Spinner /> : 'Start Run'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Envelope *</label>
          <select
            className="form-input"
            value={runEnvelopeId}
            onChange={(e) => setRunEnvelopeId(e.target.value)}
          >
            <option value="">Select envelope...</option>
            {envelopes.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name || `Envelope #${env.id}`}
                {env.status ? ` (${env.status})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Recent runs for this workflow */}
        {runModal.workflowId && (() => {
          const wfRuns = allRuns.filter((r) => r.workflow === runModal.workflowId).slice(0, 5);
          if (!wfRuns.length) return null;
          return (
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                Recent Runs
              </div>
              {wfRuns.map((run) => (
                <div
                  key={run.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.5rem 0',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.8125rem',
                  }}
                >
                  <span>Run #{run.id} — Envelope #{run.envelope}</span>
                  <Badge color={statusColor(run.status)}>{run.status}</Badge>
                </div>
              ))}
            </div>
          );
        })()}
      </Modal>

      {/* ─── Confirm Delete ──────────────────────────────────────────────── */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, id: null, name: '' })}
        onConfirm={() => {
          deleteWorkflowMutation.mutate(confirmDelete.id);
          setConfirmDelete({ open: false, id: null, name: '' });
        }}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${confirmDelete.name}"? This cannot be undone.`}
        danger
      />
    </div>
  );
}
