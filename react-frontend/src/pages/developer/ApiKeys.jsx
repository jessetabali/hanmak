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

function SecretRevealModal({ secret, title, onClose }) {
  const toast = useToast();
  const copy = () => {
    navigator.clipboard.writeText(secret);
    toast.success('Key copied to clipboard');
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done — I've Copied It
        </button>
      }
    >
      <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
        <strong>Copy this key now.</strong> It will not be shown again after you close this dialog.
      </div>
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
        <button className="btn btn-primary btn-sm" onClick={copy}>
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
        onCreated(res.data?.key || res.data?.secret || '');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleScope = (s) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const submit = () => {
    if (!name.trim()) return toast.error('Key name is required');
    mutation.mutate({ name: name.trim(), scopes });
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
        />
      </div>
      <div className="form-group">
        <label className="form-label">Scopes</label>
        <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
          {ALL_SCOPES.map((s) => (
            <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
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

  const toggleScope = (s) =>
    setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Scopes"
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
            Save Scopes
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-2" style={{ fontSize: '0.8125rem' }}>
        {ALL_SCOPES.map((s) => (
          <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', cursor: 'pointer', padding: '0.375rem', borderRadius: '5px' }}>
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
  const [newKeySecret, setNewKeySecret] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [confirmRevoke, setConfirmRevoke] = useState(null);
  const [rotateConfirm, setRotateConfirm] = useState(null);
  const [rotateSecret, setRotateSecret] = useState(null);

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
      onSuccess: (res) => setRotateSecret(res.data?.key || res.data?.secret || ''),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const handleCreated = useCallback((secret) => {
    setCreateModal(false);
    setNewKeySecret(secret);
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1.5rem' }}>
        <div className="flex flex-col gap-4">
          {keys.length === 0 ? (
            <EmptyState title="No API Keys" message="Create an API key to get started with programmatic access." />
          ) : (
            keys.map((k) => {
              const masked = (k.key_prefix || k.prefix || 'hm_???') + '••••••••••••••••••••';
              const scopes = Array.isArray(k.scopes) ? k.scopes : [];
              const isRevoked = k.status === 'revoked' || k.is_active === false;
              return (
                <div key={k.id} className="card" style={{ padding: '1.25rem', opacity: isRevoked ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '4px', textDecoration: isRevoked ? 'line-through' : 'none' }}>
                        {k.name}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Badge color={isRevoked ? 'danger' : 'success'}>{isRevoked ? 'Revoked' : 'Active'}</Badge>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Created {k.created_at ? formatDate(k.created_at) : '—'}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!isRevoked && (
                        <>
                          <button className="btn btn-ghost btn-sm" title="Rotate" onClick={() => setRotateConfirm(k)}>
                            ↻
                          </button>
                          <button className="btn btn-ghost btn-sm" title="Edit Scopes" onClick={() => setEditModal(k)}>
                            ✏
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            title="Revoke"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => setConfirmRevoke(k)}
                          >
                            🗑
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.625rem 0.75rem',
                      background: 'var(--bg-secondary)',
                      borderRadius: '7px',
                      marginBottom: '1rem',
                    }}
                  >
                    <code className="mono" style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {masked}
                    </code>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ padding: '2px 8px', fontSize: '0.75rem' }}
                      onClick={() => {
                        navigator.clipboard.writeText(masked);
                        toast.success('Prefix copied (full key not stored)');
                      }}
                    >
                      Copy
                    </button>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '0.75rem',
                      marginBottom: '1rem',
                      textAlign: 'center',
                    }}
                  >
                    {[
                      ['Last Used', k.last_used_at ? formatDate(k.last_used_at) : 'Never'],
                      ['Scopes', scopes.length],
                      ['Status', k.status || (isRevoked ? 'revoked' : 'active')],
                    ].map(([l, v]) => (
                      <div key={l} style={{ padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{v}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{l}</div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>Scopes</div>
                    <div className="flex" style={{ flexWrap: 'wrap', gap: '4px' }}>
                      {scopes.length === 0 ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No scopes assigned</span>
                      ) : (
                        scopes.map((s) => (
                          <code
                            key={s}
                            style={{ fontSize: '0.72rem', background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', color: 'var(--primary)' }}
                          >
                            {s}
                          </code>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

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
                <div key={scope} style={{ padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                  <code style={{ fontSize: '0.72rem', background: 'var(--bg-secondary)', padding: '1px 5px', borderRadius: '3px', color: 'var(--primary)' }}>
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
                  🛡 {tip}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {createModal && (
        <CreateKeyModal onClose={() => setCreateModal(false)} onCreated={handleCreated} />
      )}

      {newKeySecret && (
        <SecretRevealModal
          secret={newKeySecret}
          title="API Key Created!"
          onClose={() => {
            setNewKeySecret(null);
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
                Rotate Key
              </button>
            </>
          }
        >
          <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
            <strong>This will invalidate the current key immediately.</strong> Update all services using this key before rotating.
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            Rotating <strong>{rotateConfirm.name}</strong>. A new key will be issued with the same scopes.
          </p>
        </Modal>
      )}

      {rotateSecret && (
        <SecretRevealModal
          secret={rotateSecret}
          title="Key Rotated!"
          onClose={() => {
            setRotateSecret(null);
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
