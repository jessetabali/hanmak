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
  'signatures:write',
  'users:read',
];

function SecretRevealModal({ secret, onClose }) {
  const toast = useToast();
  return (
    <Modal
      open
      onClose={onClose}
      title="OAuth Client Secret"
      size="lg"
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          Done — I've Copied It
        </button>
      }
    >
      <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
        <strong>Copy this client secret now.</strong> It will never be shown again.
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
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            navigator.clipboard.writeText(secret).then(() => toast.success('Copied'));
          }}
        >
          Copy
        </button>
      </div>
    </Modal>
  );
}

function AppFormModal({ app, onClose, onSaved }) {
  const toast = useToast();
  const [name, setName] = useState(app?.name || '');
  const [description, setDescription] = useState(app?.description || '');
  const [redirectUris, setRedirectUris] = useState((app?.redirect_uris || []).join('\n'));
  const [scopes, setScopes] = useState(app?.scopes || []);
  const [status, setStatus] = useState(app?.status || 'active');

  const mutation = useApiMutation(
    (payload) =>
      app
        ? apiClient.patch(EP.OAUTH_APP(app.id), payload)
        : apiClient.post(EP.OAUTH_APPS, payload),
    {
      invalidateKeys: ['oauth-apps'],
      onSuccess: (res) => {
        toast.success(app ? 'OAuth app saved' : 'OAuth app created');
        onSaved?.(res.data);
        onClose();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleScope = useCallback(
    (s) => setScopes((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])),
    []
  );

  const submit = () => {
    if (!name.trim()) return toast.error('Application name is required');
    const uris = redirectUris
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);
    if (!uris.length) return toast.error('At least one redirect URI is required');
    const organizationId = Number(localStorage.getItem('HANMAK_ORGANIZATION_ID'));
    mutation.mutate({
      name: name.trim(),
      description: description.trim(),
      redirect_uris: uris,
      scopes,
      ...(app ? { status } : {}),
      ...(!app && organizationId ? { organization: organizationId } : {}),
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={app ? 'Edit OAuth Application' : 'New OAuth Application'}
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving…' : app ? 'Save' : 'Create Application'}
          </button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label">Application Name *</label>
        <input
          className="form-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Integration"
          autoFocus
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input
          className="form-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description"
        />
      </div>
      {app && (
        <div className="form-group">
          <label className="form-label">Status</label>
          <select className="form-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Redirect URIs *</label>
        <textarea
          className="form-input"
          rows={3}
          value={redirectUris}
          onChange={(e) => setRedirectUris(e.target.value)}
          placeholder="https://yourapp.com/auth/callback"
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
          One URI per line.
        </div>
      </div>
      <div className="form-group">
        <label className="form-label">Requested Scopes</label>
        <div className="flex" style={{ flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.8125rem' }}>
          {ALL_SCOPES.map((s) => (
            <label
              key={s}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={scopes.includes(s)}
                onChange={() => toggleScope(s)}
              />
              <code style={{ fontSize: '0.75rem', color: 'var(--primary)' }}>{s}</code>
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export default function OAuthApps() {
  const toast = useToast();
  const { data, isLoading, refetch } = useApiQuery(['oauth-apps'], EP.OAUTH_APPS);
  const apps = data?.results ?? data ?? [];

  const { data: grantsData, refetch: refetchGrants } = useApiQuery(
    ['oauth-grants'],
    EP.OAUTH_GRANTS
  );
  const grants = grantsData?.results ?? grantsData ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(null);
  const [rotateModal, setRotateModal] = useState(null);
  const [rotatedSecret, setRotatedSecret] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const rotateMutation = useApiMutation(
    (id) => apiClient.post(EP.OAUTH_APP_ROTATE_SECRET(id)),
    {
      invalidateKeys: ['oauth-apps'],
      onSuccess: (res) => {
        setRotateModal(null);
        setRotatedSecret(res.data?.client_secret || '');
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const toggleMutation = useApiMutation(
    ({ id, is_enabled }) => apiClient.patch(EP.OAUTH_APP(id), { status: is_enabled ? 'active' : 'disabled' }),
    {
      invalidateKeys: ['oauth-apps'],
      onSuccess: (_, vars) =>
        toast.success(`App ${vars.is_enabled ? 'enabled' : 'disabled'}`),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deleteMutation = useApiMutation(
    (id) => apiClient.delete(EP.OAUTH_APP(id)),
    {
      invalidateKeys: ['oauth-apps'],
      onSuccess: () => toast.success('OAuth app deleted'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const revokeMutation = useApiMutation(
    (id) => apiClient.post(EP.OAUTH_GRANT_REVOKE(id)),
    {
      invalidateKeys: ['oauth-grants'],
      onSuccess: () => {
        toast.success('OAuth grant revoked');
        refetchGrants();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  if (isLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">OAuth Applications</h1>
          <p className="page-subtitle">
            Manage OAuth 2.0 client applications and their permissions
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => { refetch(); refetchGrants(); }}>
            ↺ Refresh
          </button>
          <button className="btn btn-primary" onClick={() => setCreateModal(true)}>
            + New OAuth App
          </button>
        </div>
      </div>

      {apps.length === 0 ? (
        <EmptyState
          title="No OAuth Apps"
          message="Create your first OAuth application to enable third-party integrations."
        />
      ) : (
        <div className="grid-auto" style={{ marginBottom: '2rem' }}>
          {apps.map((app) => {
            const scopes = Array.isArray(app.scopes) ? app.scopes : [];
            const uris = Array.isArray(app.redirect_uris) ? app.redirect_uris : [];
            const isEnabled = app.is_enabled !== false && app.status !== 'disabled';
            return (
              <div key={app.id} className="card" style={{ padding: '1.25rem' }}>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.875rem',
                    marginBottom: '1rem',
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: '0.9375rem',
                        lineHeight: 1.35,
                        marginBottom: '4px',
                        overflowWrap: 'anywhere',
                        wordBreak: 'break-word',
                      }}
                    >
                      {app.name}
                    </div>
                    {app.description && (
                      <div
                        style={{
                          fontSize: '0.8125rem',
                          color: 'var(--text-muted)',
                          marginBottom: '4px',
                        }}
                      >
                        {app.description}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Badge color={isEnabled ? 'success' : 'secondary'}>
                        {isEnabled ? 'active' : 'disabled'}
                      </Badge>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        Created {app.created_at ? formatDate(app.created_at) : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Edit"
                      onClick={() => setEditModal(app)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title={isEnabled ? 'Disable' : 'Enable'}
                      onClick={() =>
                        toggleMutation.mutate({ id: app.id, is_enabled: !isEnabled })
                      }
                    >
                      {isEnabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Rotate Secret"
                      onClick={() => setRotateModal(app)}
                    >
                      Rotate
                    </button>
                    <button
                      className="btn btn-danger btn-sm"
                      title="Delete"
                      onClick={() => setConfirmDelete(app)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      Client ID
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                      <code
                        className="mono"
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontSize: '0.78rem',
                          lineHeight: 1.5,
                          wordBreak: 'break-all',
                          whiteSpace: 'normal',
                        }}
                      >
                        {app.client_id || '—'}
                      </code>
                      {app.client_id && (
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ padding: '1px 6px', fontSize: '0.7rem', flexShrink: 0 }}
                          onClick={() =>
                            navigator.clipboard
                              .writeText(app.client_id)
                              .then(() => toast.success('Copied'))
                          }
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        marginBottom: '4px',
                      }}
                    >
                      Redirect URIs
                    </div>
                    {uris.length ? (
                      uris.slice(0, 2).map((u, i) => (
                        <code
                          key={i}
                          className="mono"
                          style={{
                            fontSize: '0.72rem',
                            display: 'block',
                            color: 'var(--primary)',
                            lineHeight: 1.5,
                            wordBreak: 'break-all',
                            whiteSpace: 'normal',
                          }}
                        >
                          {u}
                        </code>
                      ))
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        None
                      </span>
                    )}
                    {uris.length > 2 && (
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                        +{uris.length - 2} more
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.375rem',
                    }}
                  >
                    Requested Scopes
                  </div>
                  <div className="flex" style={{ flexWrap: 'wrap', gap: '4px' }}>
                    {scopes.length === 0 ? (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        No scopes
                      </span>
                    ) : (
                      scopes.map((s) => (
                        <code
                          key={s}
                          style={{
                            fontSize: '0.72rem',
                            background: 'var(--bg-secondary)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            color: 'var(--primary)',
                          }}
                        >
                          {s}
                        </code>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* OAuth Grants Section */}
      <div className="card">
        <div className="table-toolbar">
          <h2 className="section-title" style={{ margin: 0 }}>
            OAuth Grants
          </h2>
        </div>
        {grants.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            No OAuth grants yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>App</th>
                <th>User</th>
                <th>Scopes</th>
                <th>Granted At</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grants.map((grant) => (
                <tr key={grant.id}>
                  <td style={{ fontWeight: 600 }}>
                    {grant.application_name || `App #${grant.application}`}
                  </td>
                  <td>{grant.user_email || `User #${grant.user}`}</td>
                  <td>
                    <div className="flex" style={{ flexWrap: 'wrap', gap: '4px' }}>
                      {(grant.scopes || []).map((s) => (
                        <code
                          key={s}
                          style={{
                            fontSize: '0.72rem',
                            background: 'var(--bg-secondary)',
                            padding: '2px 4px',
                            borderRadius: '3px',
                          }}
                        >
                          {s}
                        </code>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                    {grant.created_at ? formatDate(grant.created_at) : '—'}
                  </td>
                  <td>
                    {!grant.revoked_at ? (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => revokeMutation.mutate(grant.id)}
                      >
                        Revoke
                      </button>
                    ) : (
                      <Badge color="danger">Revoked</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modals */}
      {createModal && (
        <AppFormModal
          onClose={() => setCreateModal(false)}
          onSaved={(createdApp) => {
            refetch();
            if (createdApp?.client_secret) setRotatedSecret(createdApp.client_secret);
          }}
        />
      )}

      {editModal && (
        <AppFormModal app={editModal} onClose={() => setEditModal(null)} onSaved={refetch} />
      )}

      {rotateModal && (
        <ConfirmDialog
          open
          onClose={() => setRotateModal(null)}
          onConfirm={() => rotateMutation.mutate(rotateModal.id)}
          title="Rotate Client Secret"
          message={`Rotating the secret for "${rotateModal.name}" will immediately invalidate the current secret. This cannot be undone.`}
          confirmLabel="Rotate Secret"
          danger
        />
      )}

      {rotatedSecret && (
        <SecretRevealModal
          secret={rotatedSecret}
          onClose={() => {
            setRotatedSecret(null);
            refetch();
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
        title="Delete OAuth App"
        message={`Delete "${confirmDelete?.name}"? This will immediately revoke all grants.`}
        confirmLabel="Delete App"
        danger
      />
    </div>
  );
}
