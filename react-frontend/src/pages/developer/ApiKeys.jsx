import { useState, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import { formatDate } from '../../utils/formatting';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

const ALL_SCOPES = [
  'envelopes:read',
  'envelopes:write',
  'templates:read',
  'templates:write',
  'signatures:write',
  'webhooks:read',
  'webhooks:manage',
  'users:read',
  'users:manage',
  'audit:read',
  'admin:all',
];

function copyToClipboard(text, toast) {
  navigator.clipboard.writeText(text).then(() => toast.success('Copied'));
}

function SecretRevealModal({ secret, name, title, onClose }) {
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title={title || 'API Key Created!'}
      size="lg"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done — I've Copied It
        </button>
      }
    >
      <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
        <strong>Copy this key now.</strong> This is the only time this key will be shown.
      </div>
      {name && (
        <div className="form-group">
          <label className="form-label">Key Name</label>
          <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{name}</div>
        </div>
      )}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.75rem',
          background: 'var(--bg-secondary)',
          borderRadius: '7px',
          wordBreak: 'break-all',
        }}
      >
        <code className="mono" style={{ flex: 1, fontSize: '0.8125rem' }}>
          {secret}
        </code>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => copyToClipboard(secret, toast)}
        >
          Copy
        </button>
      </div>
    </Modal>
  );
}

function CreateKeyModal({ onClose, onCreated }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['envelopes:read', 'envelopes:write']);

  const mutation = useApiMutation(
    (payload) => apiClient.post(EP.API_KEYS, payload),
    {
      invalidateKeys: ['api-keys'],
      onSuccess: (res) => {
        const secret = res.data?.key || res.data?.secret || '';
        onCreated(secret, name.trim());
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleScope = useCallback((s) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])), []);

  const submit = () => {
    if (!name.trim()) return toast.error('Key name is required');
    mutation.mutate({
      name: name.trim(),
      scopes,
      organization: Number(localStorage.getItem('HANMAK_ORGANIZATION_ID')),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Create API Key"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Generating…' : 'Generate Key'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Key Name *</label>
        <input
          className="form-input"
          placeholder="e.g. Production Backend Integration"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">Scopes</label>
        <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
          {ALL_SCOPES.map((s) => (
            <label
              key={s}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
            >
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
              <code style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{s}</code>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function EditScopesModal({ apiKey, onClose }) {
  const toast = useToast();
  const [scopes, setScopes] = useState(apiKey.scopes || []);

  const mutation = useApiMutation(
    (payload) => apiClient.patch(EP.API_KEY(apiKey.id), payload),
    {
      invalidateKeys: ['api-keys'],
      onSuccess: () => {
        toast.success('Scopes updated');
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleScope = useCallback((s) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])), []);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit Scopes — ${apiKey.name}`}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => mutation.mutate({ scopes })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Saving…' : 'Save Scopes'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
        {ALL_SCOPES.map((s) => (
          <label
            key={s}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.625rem',
              cursor: 'pointer',
              padding: '0.375rem',
              borderRadius: '5px',
            }}
          >
            <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
            <code style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{s}</code>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function ApiKeys() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['api-keys'], EP.API_KEYS);
  const keys = data?.results ?? data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [newKeyReveal, setNewKeyReveal] = useState({ open: false, secret: '', name: '' });
  const [editModal, setEditModal] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [rotateConfirm, setRotateConfirm] = useState(null);
  const [rotateReveal, setRotateReveal] = useState({ open: false, secret: '', name: '' });

  const total = keys.length;
  const active = keys.filter((k) => k.status === 'active' || k.is_active !== false).length;
  const revoked = keys.filter((k) => k.status === 'revoked' || k.is_active === false).length;

  const revokeMutation = useApiMutation(
    (id) => apiClient.post(EP.API_KEY_REVOKE(id)),
    {
      invalidateKeys: ['api-keys'],
      onSuccess: () => toast.success('Key revoked'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const rotateMutation = useApiMutation(
    (id) => apiClient.post(EP.API_KEY_ROTATE(id)),
    {
      invalidateKeys: ['api-keys'],
      onSuccess: (res, id) => {
        const key = keys.find((k) => k.id === id);
        setRotateReveal({ open: true, secret: res.data?.key || res.data?.secret || '', name: key?.name || '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreated = useCallback((secret, name) => {
    setCreateModal(false);
    setNewKeyReveal({ open: true, secret, name });
  }, []);

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Keys</h1>
          <p className="page-subtitle">Manage API credentials for programmatic access to HanMak</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
          + Create API Key
        </button>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ '--cols': 3, marginBottom: '1.5rem' }}>
        {[
          ['Total', total, 'secondary'],
          ['Active', active, 'success'],
          ['Revoked', revoked, 'danger'],
        ].map(([label, value, color]) => (
          <div key={label} className="stat-card">
            <div className="stat-label">{label}</div>
            <div className="stat-value" style={{ color: `var(--${color === 'secondary' ? 'text-primary' : color})` }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
        {/* Keys table */}
        <div className="card" style={{ padding: 0 }}>
          {keys.length === 0 ? (
            <div style={{ padding: '2rem' }}>
              <EmptyState title="No API Keys" message="Create an API key to get started with programmatic access." />
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Key Prefix</th>
                  <th>Scopes</th>
                  <th>Created</th>
                  <th>Last Used</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => {
                  const masked = (k.key_prefix || k.prefix || 'hm_???') + '••••••••••••';
                  const scopes = Array.isArray(k.scopes) ? k.scopes : [];
                  const isRevoked = k.status === 'revoked' || k.is_active === false;
                  return (
                    <tr key={k.id} style={{ opacity: isRevoked ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600, textDecoration: isRevoked ? 'line-through' : 'none' }}>
                        {k.name}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <code className="mono" style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {masked}
                          </code>
                          {!isRevoked && (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ padding: '1px 6px', fontSize: '0.7rem' }}
                              onClick={() => copyToClipboard(masked, toast)}
                            >
                              Copy
                            </button>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', maxWidth: '200px' }}>
                          {scopes.length === 0 ? (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>None</span>
                          ) : (
                            scopes.map((s) => (
                              <code
                                key={s}
                                style={{
                                  fontSize: '0.68rem',
                                  background: 'var(--bg-secondary)',
                                  padding: '1px 5px',
                                  borderRadius: '3px',
                                  color: 'var(--primary)',
                                }}
                              >
                                {s}
                              </code>
                            ))
                          )}
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {k.created_at ? formatDate(k.created_at) : '—'}
                      </td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {k.last_used_at ? formatDate(k.last_used_at) : 'Never'}
                      </td>
                      <td>
                        <Badge color={isRevoked ? 'danger' : 'success'}>
                          {isRevoked ? 'Revoked' : 'Active'}
                        </Badge>
                      </td>
                      <td>
                        {!isRevoked && (
                          <div className="flex gap-1">
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Edit Scopes"
                              onClick={() => setEditModal(k)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              title="Rotate"
                              onClick={() => setRotateConfirm(k)}
                            >
                              Rotate
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              title="Revoke"
                              onClick={() => setConfirmRevoke(k)}
                            >
                              Revoke
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Available Scopes</div>
            <div className="flex flex-col gap-1" style={{ fontSize: '0.78rem' }}>
              {[
                ['envelopes:read', 'Read envelope data'],
                ['envelopes:write', 'Create & modify envelopes'],
                ['templates:read', 'Read templates'],
                ['templates:write', 'Create & modify templates'],
                ['signatures:write', 'Place signatures via API'],
                ['webhooks:read', 'Read webhook configs'],
                ['webhooks:manage', 'Create & manage webhooks'],
                ['users:read', 'Read user profiles'],
                ['users:manage', 'Manage users & roles'],
                ['audit:read', 'Read audit trail'],
                ['admin:all', 'Full admin access'],
              ].map(([scope, desc]) => (
                <div
                  key={scope}
                  style={{ padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}
                >
                  <code
                    style={{
                      fontSize: '0.72rem',
                      background: 'var(--bg-secondary)',
                      padding: '1px 5px',
                      borderRadius: '3px',
                      color: 'var(--primary)',
                    }}
                  >
                    {scope}
                  </code>
                  <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: '1.25rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Security Best Practices</div>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {[
                'Never commit keys to source control',
                'Rotate keys every 90 days',
                'Use test keys for development',
                'Assign minimal required scopes',
                'Enable IP allowlisting',
                'Monitor usage for anomalies',
              ].map((tip) => (
                <div key={tip} style={{ display: 'flex', gap: '0.5rem' }}>
                  <span>&#x1F6E1;</span> {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {createModal && (
        <CreateKeyModal onClose={() => setCreateModal(false)} onCreated={handleCreated} />
      )}

      {newKeyReveal.open && (
        <SecretRevealModal
          secret={newKeyReveal.secret}
          name={newKeyReveal.name}
          title="API Key Created!"
          onClose={() => {
            setNewKeyReveal({ open: false, secret: '', name: '' });
            refetch();
          }}
        />
      )}

      {editModal && (
        <EditScopesModal apiKey={editModal} onClose={() => setEditModal(null)} />
      )}

      {rotateConfirm && (
        <Modal
          open
          onClose={() => setRotateConfirm(null)}
          title="Rotate API Key"
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setRotateConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={rotateMutation.isPending}
                onClick={() => {
                  rotateMutation.mutate(rotateConfirm.id);
                  setRotateConfirm(null);
                }}
              >
                {rotateMutation.isPending ? 'Rotating…' : 'Rotate Key'}
              </button>
            </>
          }
        >
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            <strong>A new secret will be generated. The old key stops working immediately.</strong> Update
            all services using this key before rotating.
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Rotating <strong>{rotateConfirm.name}</strong>. A new key will be issued with the same scopes.
          </p>
        </Modal>
      )}

      {rotateReveal.open && (
        <SecretRevealModal
          secret={rotateReveal.secret}
          name={rotateReveal.name}
          title="Key Rotated!"
          onClose={() => {
            setRotateReveal({ open: false, secret: '', name: '' });
            refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmRevoke}
        onClose={() => setConfirmRevoke(null)}
        onConfirm={() => {
          revokeMutation.mutate(confirmRevoke.id);
          setConfirmRevoke(null);
        }}
        title="Revoke API Key"
        message="Revoking this key immediately blocks all API requests using it. This cannot be undone."
        confirmLabel="Revoke Key"
        danger
      />
    </div>
  );
}
