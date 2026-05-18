import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

// ─── IdP presets ─────────────────────────────────────────────────────────────
const IDP_PRESETS = {
  Okta: {
    name: 'Okta SAML',
    entity_id: 'https://example.okta.com/app/hanmak/sso/saml/metadata',
    sso_url: 'https://example.okta.com/app/hanmak/sso/saml',
  },
  'Azure AD': {
    name: 'Azure AD SAML',
    entity_id: 'https://sts.windows.net/{tenant-id}/',
    sso_url: 'https://login.microsoftonline.com/{tenant-id}/saml2',
  },
  'Google Workspace': {
    name: 'Google Workspace SAML',
    entity_id: 'https://accounts.google.com/o/saml2?idpid={idp-id}',
    sso_url: 'https://accounts.google.com/o/saml2/idp?idpid={idp-id}',
  },
  Generic: {
    name: 'Generic SAML',
    entity_id: '',
    sso_url: '',
  },
};

const SOCIAL_PROVIDER_DEFS = [
  { type: 'google', name: 'Google', emoji: 'G', color: '#4285f4' },
  { type: 'microsoft', name: 'Microsoft', emoji: 'M', color: '#0072c6' },
  { type: 'github', name: 'GitHub', emoji: 'GH', color: '#333' },
  { type: 'linkedin', name: 'LinkedIn', emoji: 'Li', color: '#0a66c2' },
  { type: 'apple', name: 'Apple', emoji: '', color: '#000' },
];

const SP_DETAILS = [
  ['SP Entity ID', 'https://app.hanmak.io/saml/metadata'],
  ['ACS URL', 'https://app.hanmak.io/saml/acs'],
  ['SLS URL', 'https://app.hanmak.io/saml/sls'],
  ['Metadata URL', 'https://app.hanmak.io/saml/metadata.xml'],
];

const TABS = [
  ['oidc', 'OIDC'],
  ['saml', 'SAML'],
  ['scim', 'SCIM'],
  ['ldap', 'LDAP'],
  ['jit', 'JIT'],
  ['social', 'Social'],
];

// ─── Blank form states ────────────────────────────────────────────────────────
const blankOIDC = () => ({ name: '', issuer_url: '', client_id: '', client_secret: '', discovery_url: '', scope: 'openid email profile groups' });
const blankSAML = () => ({ name: '', entity_id: '', sso_url: '', certificate: '', name_attr: 'email', email_attr: 'mail', sign_requests: true, want_signed_assertions: true, want_encrypted_assertions: false });
const blankSCIM = () => ({ name: '', base_url: '' });
const blankLDAP = () => ({ name: '', host: '', port: 389, bind_dn: '', bind_password: '', base_dn: '', user_filter: '(objectClass=person)' });

export default function SSO() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('oidc');

  // Edit modals
  const [editModal, setEditModal] = useState({ open: false, type: '', item: null });
  const [editForm, setEditForm] = useState({});

  // SCIM bearer token reveal after creation
  const [scimToken, setScimToken] = useState(null);

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState({ open: false, endpoint: '', label: '', refetch: null });

  // JIT form
  const [jitForm, setJitForm] = useState({ is_enabled: false, auto_provision: false, default_role: 'signer', name_attr: '', email_attr: '' });
  const [jitId, setJitId] = useState(null);

  // Social modal
  const [socialModal, setSocialModal] = useState(null);
  const [socialForm, setSocialForm] = useState({ client_id: '', client_secret: '' });

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: ssoData, isLoading: ssoLoading, refetch: refetchSSO } = useApiQuery(['sso-connections'], EP.SSO_CONNECTIONS);
  const { data: scimData, isLoading: scimLoading, refetch: refetchSCIM } = useApiQuery(['scim-connections'], EP.SCIM_CONNECTIONS);
  const { data: ldapData, isLoading: ldapLoading, refetch: refetchLDAP } = useApiQuery(['ldap-connections'], EP.LDAP_CONNECTIONS);
  const { data: jitData, isLoading: jitLoading, refetch: refetchJIT } = useApiQuery(['jit-settings'], EP.JIT_SETTINGS);
  const { data: socialData, isLoading: socialLoading, refetch: refetchSocial } = useApiQuery(['social-providers'], EP.SOCIAL_PROVIDERS);

  // Hydrate JIT form from API
  useEffect(() => {
    if (jitData) {
      const item = jitData?.results?.[0] ?? (Array.isArray(jitData) ? jitData[0] : jitData);
      if (item) {
        setJitId(item.id);
        setJitForm({
          is_enabled: item.is_enabled ?? false,
          auto_provision: item.auto_create_user ?? false,
          default_role: item.default_role ?? 'signer',
          name_attr: item.name_attr ?? '',
          email_attr: item.email_attr ?? '',
        });
      }
    }
  }, [jitData]);

  // ── Derived lists ──────────────────────────────────────────────────────────
  const ssoList = ssoData?.results ?? (Array.isArray(ssoData) ? ssoData : []);
  const oidcList = ssoList.filter((c) => c.provider_type === 'oidc');
  const samlList = ssoList.filter((c) => c.provider_type === 'saml');
  const scimList = scimData?.results ?? (Array.isArray(scimData) ? scimData : []);
  const ldapList = ldapData?.results ?? (Array.isArray(ldapData) ? ldapData : []);
  const socialList = socialData?.results ?? (Array.isArray(socialData) ? socialData : []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function openCreate(type) {
    let form = {};
    if (type === 'oidc') form = blankOIDC();
    if (type === 'saml') form = blankSAML();
    if (type === 'scim') form = blankSCIM();
    if (type === 'ldap') form = blankLDAP();
    setEditForm(form);
    setEditModal({ open: true, type, item: null });
  }

  function openEdit(type, item) {
    let form = {};
    if (type === 'oidc') {
      const cfg = item.config ?? {};
      form = { name: item.name ?? '', issuer_url: cfg.issuer ?? '', client_id: cfg.client_id ?? '', client_secret: '', discovery_url: cfg.discovery_url ?? '', scope: cfg.scope ?? 'openid email profile groups' };
    } else if (type === 'saml') {
      const cfg = item.config ?? {};
      form = { name: item.name ?? '', entity_id: cfg.entity_id ?? '', sso_url: cfg.sso_url ?? '', certificate: cfg.x509_cert ?? '', name_attr: cfg.name_attr ?? 'email', email_attr: cfg.email_attr ?? 'mail', sign_requests: cfg.sign_requests ?? true, want_signed_assertions: cfg.require_signed_assertions ?? true, want_encrypted_assertions: cfg.require_encrypted_assertions ?? false };
    } else if (type === 'ldap') {
      form = { name: item.name ?? '', host: item.host ?? '', port: item.port ?? 389, bind_dn: item.bind_dn ?? '', bind_password: '', base_dn: item.base_dn ?? '', user_filter: item.user_filter ?? '(objectClass=person)' };
    }
    setEditForm(form);
    setEditModal({ open: true, type, item });
  }

  function closeModal() {
    setEditModal({ open: false, type: '', item: null });
    setEditForm({});
  }

  function applyPreset(presetName) {
    const preset = IDP_PRESETS[presetName];
    if (!preset) return;
    setEditForm((prev) => ({ ...prev, name: preset.name, entity_id: preset.entity_id, sso_url: preset.sso_url }));
    toast.success(`${presetName} preset loaded. Paste the IdP certificate, then save.`);
  }

  function setEF(key, value) {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Save handlers ──────────────────────────────────────────────────────────
  async function saveSSO() {
    const { type, item } = editModal;
    try {
      let payload;
      if (type === 'oidc') {
        payload = {
          provider_type: 'oidc',
          name: editForm.name,
          is_enabled: true,
          config: {
            issuer: editForm.issuer_url,
            client_id: editForm.client_id,
            client_secret: editForm.client_secret,
            discovery_url: editForm.discovery_url,
            scope: editForm.scope,
            algorithms: ['RS256'],
          },
        };
      } else if (type === 'saml') {
        payload = {
          provider_type: 'saml',
          name: editForm.name,
          is_enabled: true,
          config: {
            entity_id: editForm.entity_id,
            sso_url: editForm.sso_url,
            x509_cert: editForm.certificate,
            name_attr: editForm.name_attr,
            email_attr: editForm.email_attr,
            sign_requests: editForm.sign_requests,
            require_signed_assertions: editForm.want_signed_assertions,
            require_encrypted_assertions: editForm.want_encrypted_assertions,
          },
        };
      }

      if (item) {
        await apiClient.patch(EP.SSO_CONNECTION(item.id), payload);
        toast.success('Connection updated');
      } else {
        await apiClient.post(EP.SSO_CONNECTIONS, payload);
        toast.success('Connection created');
      }
      closeModal();
      refetchSSO();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function testSSO(id) {
    try {
      const { data } = await apiClient.post(`/sso-connections/${id}/test/`, {});
      toast.success(data.message || 'Connection test passed');
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function createSCIM() {
    try {
      const { data } = await apiClient.post(EP.SCIM_CONNECTIONS, { name: editForm.name, base_url: editForm.base_url });
      closeModal();
      setScimToken(data.bearer_token || data.token || null);
      refetchSCIM();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function saveLDAP() {
    const { item } = editModal;
    try {
      const payload = {
        name: editForm.name,
        host: editForm.host,
        port: Number(editForm.port),
        bind_dn: editForm.bind_dn,
        bind_password: editForm.bind_password,
        base_dn: editForm.base_dn,
        user_filter: editForm.user_filter,
        is_enabled: true,
      };
      if (item) {
        await apiClient.patch(`/ldap-connections/${item.id}/`, payload);
        toast.success('LDAP connection updated');
      } else {
        await apiClient.post(EP.LDAP_CONNECTIONS, payload);
        toast.success('LDAP connection created');
      }
      closeModal();
      refetchLDAP();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function saveJIT() {
    try {
      const payload = {
        is_enabled: jitForm.is_enabled,
        auto_create_user: jitForm.auto_provision,
        default_role: jitForm.default_role,
        name_attr: jitForm.name_attr,
        email_attr: jitForm.email_attr,
      };
      if (jitId) {
        await apiClient.patch(`/jit-settings/${jitId}/`, payload);
      } else {
        const { data } = await apiClient.post(EP.JIT_SETTINGS, payload);
        setJitId(data.id);
      }
      toast.success('JIT settings saved');
      refetchJIT();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function saveSocialProvider() {
    if (!socialModal) return;
    try {
      const existing = socialList.find((p) => p.provider_type === socialModal.type);
      const payload = { provider_type: socialModal.type, client_id: socialForm.client_id, client_secret: socialForm.client_secret };
      if (existing) {
        await apiClient.patch(`/social-providers/${existing.id}/`, payload);
      } else {
        await apiClient.post(EP.SOCIAL_PROVIDERS, payload);
      }
      toast.success('Social provider saved');
      setSocialModal(null);
      refetchSocial();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function toggleSocial(item) {
    try {
      await apiClient.patch(`/social-providers/${item.id}/`, { is_enabled: !item.is_enabled });
      refetchSocial();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  async function doDelete() {
    try {
      await apiClient.delete(confirmDelete.endpoint);
      toast.success(`${confirmDelete.label} deleted`);
      confirmDelete.refetch?.();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setConfirmDelete({ open: false, endpoint: '', label: '', refetch: null });
    }
  }

  // ── Modal title + save fn ──────────────────────────────────────────────────
  const MODAL_CONFIG = {
    oidc: { title: editModal.item ? 'Edit OIDC Connection' : 'Create OIDC Connection', onSave: saveSSO },
    saml: { title: editModal.item ? 'Edit SAML Connection' : 'Create SAML Connection', onSave: saveSSO },
    scim: { title: 'Create SCIM Connection', onSave: createSCIM },
    ldap: { title: editModal.item ? 'Edit LDAP Connection' : 'Create LDAP Connection', onSave: saveLDAP },
  };
  const mc = MODAL_CONFIG[editModal.type] || {};

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SSO &amp; Identity</h1>
          <p className="page-subtitle">SAML, OIDC, LDAP, OAuth providers, SCIM provisioning, and JIT</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          if (activeTab === 'jit') saveJIT();
          else toast.info('Use the Create or Edit buttons in each tab to save.');
        }}>Save</button>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0, marginBottom: '1.5rem' }}>
        <div className="tabs" style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex' }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
              {label}
            </button>
          ))}
        </div>

        {/* ── OIDC Tab ────────────────────────────────────────────────────── */}
        {activeTab === 'oidc' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>OpenID Connect / OAuth 2.0</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Connect your OIDC / OAuth 2.0 identity provider</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('oidc')}>+ Create OIDC</button>
            </div>
            {ssoLoading ? <Spinner center /> : oidcList.length === 0 ? (
              <EmptyState title="No OIDC connections" message="Create a connection to enable OIDC single sign-on" />
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Issuer URL</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {oidcList.map((conn) => (
                    <tr key={conn.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.625rem 0', fontWeight: 500 }}>{conn.name}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{conn.config?.issuer || '—'}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                        <Badge color={conn.is_enabled ? 'success' : 'secondary'}>{conn.is_enabled ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit('oidc', conn)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => testSSO(conn.id)}>Test</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ open: true, endpoint: EP.SSO_CONNECTION(conn.id), label: conn.name, refetch: refetchSSO })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── SAML Tab ────────────────────────────────────────────────────── */}
        {activeTab === 'saml' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>SAML 2.0 Single Sign-On</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Configure your Identity Provider for SAML-based SSO</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('saml')}>+ Create SAML</button>
            </div>

            {/* Provider presets */}
            <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginRight: 4 }}>Quick setup:</span>
              {Object.keys(IDP_PRESETS).map((name) => (
                <button key={name} className="btn btn-ghost btn-sm" onClick={() => {
                  openCreate('saml');
                  // applyPreset after state update on next render needs a small trick:
                  // we'll apply it in the modal itself via a separate button
                }}>{name}</button>
              ))}
            </div>

            {ssoLoading ? <Spinner center /> : samlList.length === 0 ? (
              <EmptyState title="No SAML connections" message="Create a connection to enable SAML 2.0 single sign-on" />
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Entity ID</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>SSO URL</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {samlList.map((conn) => (
                    <tr key={conn.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.625rem 0', fontWeight: 500 }}>{conn.name}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.config?.entity_id || '—'}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conn.config?.sso_url || '—'}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                        <Badge color={conn.is_enabled ? 'success' : 'secondary'}>{conn.is_enabled ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit('saml', conn)}>Edit</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => testSSO(conn.id)}>Test</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ open: true, endpoint: EP.SSO_CONNECTION(conn.id), label: conn.name, refetch: refetchSSO })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* SP details info box */}
            <div style={{ marginTop: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', fontSize: '0.8125rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Service Provider (SP) details — provide these to your IdP:</div>
              {SP_DETAILS.map(([k, v]) => (
                <div key={k} style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ color: 'var(--text-muted)', minWidth: 120, fontSize: '0.75rem' }}>{k}</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', flex: 1 }}>{v}</code>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '2px 8px' }} onClick={() => { navigator.clipboard?.writeText(v); toast.success('Copied!'); }}>Copy</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── SCIM Tab ────────────────────────────────────────────────────── */}
        {activeTab === 'scim' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>SCIM 2.0 Provisioning</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Automatically sync users and groups from your IdP to HanMak.</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('scim')}>+ Create SCIM</button>
            </div>

            {scimToken && (
              <div className="alert alert-warning" style={{ padding: '1rem', background: '#fef3c7', border: '1px solid #d97706', borderRadius: 8, marginBottom: '1.25rem', fontSize: '0.875rem' }}>
                <strong>Save your bearer token now — it will not be shown again.</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', flex: 1, background: 'white', padding: '0.375rem 0.625rem', borderRadius: 6, border: '1px solid #d97706', wordBreak: 'break-all' }}>{scimToken}</code>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(scimToken); toast.success('Token copied!'); }}>Copy</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setScimToken(null)}>Dismiss</button>
                </div>
              </div>
            )}

            {scimLoading ? <Spinner center /> : scimList.length === 0 ? (
              <EmptyState title="No SCIM connections" message="Create a SCIM connection to auto-provision users from your IdP" />
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Base URL</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Bearer Token</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scimList.map((conn) => (
                    <tr key={conn.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.625rem 0', fontWeight: 500 }}>{conn.name || `SCIM #${conn.id}`}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{conn.scim_endpoint || conn.base_url || '—'}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                        <Badge color={conn.is_enabled ? 'success' : 'secondary'}>{conn.is_enabled ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>••••••••••••</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                        <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ open: true, endpoint: `/scim-connections/${conn.id}/`, label: conn.name || `SCIM #${conn.id}`, refetch: refetchSCIM })}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── LDAP Tab ────────────────────────────────────────────────────── */}
        {activeTab === 'ldap' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>LDAP / Active Directory</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Connect to your directory server for authentication.</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => openCreate('ldap')}>+ Create LDAP</button>
            </div>

            {ldapLoading ? <Spinner center /> : ldapList.length === 0 ? (
              <EmptyState title="No LDAP connections" message="Create an LDAP connection to authenticate users against your directory" />
            ) : (
              <table className="table" style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600 }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Host</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Port</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Base DN</th>
                    <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ldapList.map((conn) => (
                    <tr key={conn.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.625rem 0', fontWeight: 500 }}>{conn.name || `LDAP #${conn.id}`}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>{conn.host}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>{conn.port}</td>
                      <td style={{ padding: '0.625rem 0.5rem', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{conn.base_dn}</td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'center' }}>
                        <Badge color={conn.is_enabled ? 'success' : 'secondary'}>{conn.is_enabled ? 'Active' : 'Inactive'}</Badge>
                      </td>
                      <td style={{ padding: '0.625rem 0.5rem', textAlign: 'right' }}>
                        <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit('ldap', conn)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ open: true, endpoint: `/ldap-connections/${conn.id}/`, label: conn.name || `LDAP #${conn.id}`, refetch: refetchLDAP })}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── JIT Tab ─────────────────────────────────────────────────────── */}
        {activeTab === 'jit' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Just-In-Time Provisioning</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
              Automatically create and update user accounts when they sign in via SSO.
            </p>
            {jitLoading ? <Spinner center /> : (
              <>
                <div className="flex flex-col gap-3" style={{ fontSize: '0.875rem' }}>
                  {[
                    ['is_enabled', 'JIT Provisioning Enabled'],
                    ['auto_provision', 'Auto Provision (create user on first SSO login)'],
                  ].map(([key, label]) => (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{label}</span>
                      <input type="checkbox" checked={!!jitForm[key]} onChange={(e) => setJitForm((j) => ({ ...j, [key]: e.target.checked }))} />
                    </div>
                  ))}
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Default Role</label>
                  <select className="form-input" value={jitForm.default_role} onChange={(e) => setJitForm((j) => ({ ...j, default_role: e.target.value }))}>
                    <option value="signer">Signer</option>
                    <option value="viewer">Viewer</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label className="form-label">Name Attribute</label>
                    <input className="form-input" placeholder="name" value={jitForm.name_attr} onChange={(e) => setJitForm((j) => ({ ...j, name_attr: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email Attribute</label>
                    <input className="form-input" placeholder="email" value={jitForm.email_attr} onChange={(e) => setJitForm((j) => ({ ...j, email_attr: e.target.value }))} />
                  </div>
                </div>

                <button className="btn btn-primary btn-sm" onClick={saveJIT}>Save JIT Settings</button>
              </>
            )}
          </div>
        )}

        {/* ── Social Tab ──────────────────────────────────────────────────── */}
        {activeTab === 'social' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Social Login Providers</div>
            {socialLoading ? <Spinner center /> : (
              <div className="flex flex-col gap-3">
                {SOCIAL_PROVIDER_DEFS.map(({ type, name, emoji, color }) => {
                  const saved = socialList.find((p) => p.provider_type === type);
                  return (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                      <div style={{ width: 36, height: 36, background: color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>{emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600 }}>{name}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{saved?.client_id ? `Client ID: ${saved.client_id}` : 'Not configured'}</div>
                      </div>
                      <Badge color={saved?.is_enabled ? 'success' : 'secondary'}>{saved?.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                      {saved && (
                        <button className="btn btn-ghost btn-sm" onClick={() => { if (saved) toggleSocial(saved); }}>
                          {saved.is_enabled ? 'Disable' : 'Enable'}
                        </button>
                      )}
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        setSocialModal({ type, name, id: saved?.id ?? null });
                        setSocialForm({ client_id: saved?.client_id ?? '', client_secret: '' });
                      }}>Edit</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Edit/Create Modal ────────────────────────────────────────────── */}
      <Modal
        open={editModal.open}
        onClose={closeModal}
        title={mc.title || ''}
        footer={<>
          <button className="btn btn-ghost" onClick={closeModal}>Cancel</button>
          <button className="btn btn-primary" onClick={mc.onSave}>
            {editModal.item ? 'Save Changes' : 'Create'}
          </button>
        </>}
      >
        {editModal.type === 'oidc' && (
          <div className="flex flex-col gap-2">
            <div className="form-group"><label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label><input className="form-input" value={editForm.name || ''} onChange={(e) => setEF('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Issuer URL</label><input className="form-input" placeholder="https://accounts.google.com" value={editForm.issuer_url || ''} onChange={(e) => setEF('issuer_url', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Client ID</label><input className="form-input" value={editForm.client_id || ''} onChange={(e) => setEF('client_id', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Client Secret</label><input className="form-input" type="password" placeholder={editModal.item ? 'Leave blank to keep existing' : ''} value={editForm.client_secret || ''} onChange={(e) => setEF('client_secret', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Discovery URL</label><input className="form-input" placeholder="https://…/.well-known/openid-configuration" value={editForm.discovery_url || ''} onChange={(e) => setEF('discovery_url', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Scopes</label><input className="form-input" value={editForm.scope || ''} onChange={(e) => setEF('scope', e.target.value)} /></div>
          </div>
        )}

        {editModal.type === 'saml' && (
          <div className="flex flex-col gap-2">
            {/* Preset buttons */}
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Quick setup — choose a provider:</div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {Object.entries(IDP_PRESETS).map(([name, preset]) => (
                  <button key={name} type="button" className="btn btn-ghost btn-sm" onClick={() => {
                    setEF('name', preset.name);
                    setEF('entity_id', preset.entity_id);
                    setEF('sso_url', preset.sso_url);
                    toast.success(`${name} preset loaded.`);
                  }}>{name}</button>
                ))}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label><input className="form-input" value={editForm.name || ''} onChange={(e) => setEF('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Entity ID</label><input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} placeholder="https://idp.example.com/saml/metadata" value={editForm.entity_id || ''} onChange={(e) => setEF('entity_id', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">SSO URL</label><input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} placeholder="https://idp.example.com/saml/sso" value={editForm.sso_url || ''} onChange={(e) => setEF('sso_url', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Certificate (X.509)</label><textarea className="form-input" rows={4} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', resize: 'vertical' }} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" value={editForm.certificate || ''} onChange={(e) => setEF('certificate', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">Name Attribute</label><input className="form-input" value={editForm.name_attr || ''} onChange={(e) => setEF('name_attr', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Email Attribute</label><input className="form-input" value={editForm.email_attr || ''} onChange={(e) => setEF('email_attr', e.target.value)} /></div>
            </div>
            <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem' }}>
              {[
                ['sign_requests', 'Sign Requests'],
                ['want_signed_assertions', 'Want Signed Assertions'],
                ['want_encrypted_assertions', 'Want Encrypted Assertions'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.25rem 0' }}>
                  <input type="checkbox" checked={!!editForm[key]} onChange={(e) => setEF(key, e.target.checked)} />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        {editModal.type === 'scim' && (
          <div className="flex flex-col gap-2">
            <div className="alert alert-warning" style={{ padding: '0.75rem', background: '#fef3c7', border: '1px solid #d97706', borderRadius: 6, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
              A bearer token will be generated on creation. Copy it immediately — it will not be shown again.
            </div>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={editForm.name || ''} onChange={(e) => setEF('name', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Base URL</label><input className="form-input" placeholder="https://app.hanmak.io/scim/v2/" value={editForm.base_url || ''} onChange={(e) => setEF('base_url', e.target.value)} /></div>
          </div>
        )}

        {editModal.type === 'ldap' && (
          <div className="flex flex-col gap-2">
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={editForm.name || ''} onChange={(e) => setEF('name', e.target.value)} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '0.75rem' }}>
              <div className="form-group"><label className="form-label">Host</label><input className="form-input" placeholder="ldap.acmecorp.com" value={editForm.host || ''} onChange={(e) => setEF('host', e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Port</label><input className="form-input" type="number" value={editForm.port || 389} onChange={(e) => setEF('port', Number(e.target.value))} /></div>
            </div>
            <div className="form-group"><label className="form-label">Bind DN</label><input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} placeholder="cn=hanmak,ou=service,dc=acmecorp,dc=com" value={editForm.bind_dn || ''} onChange={(e) => setEF('bind_dn', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Bind Password</label><input className="form-input" type="password" placeholder={editModal.item ? 'Leave blank to keep existing' : ''} value={editForm.bind_password || ''} onChange={(e) => setEF('bind_password', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Base DN</label><input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} placeholder="dc=acmecorp,dc=com" value={editForm.base_dn || ''} onChange={(e) => setEF('base_dn', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">User Filter</label><input className="form-input" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} value={editForm.user_filter || ''} onChange={(e) => setEF('user_filter', e.target.value)} /></div>
          </div>
        )}
      </Modal>

      {/* Social provider modal */}
      <Modal
        open={!!socialModal}
        onClose={() => setSocialModal(null)}
        title={socialModal ? `Configure ${socialModal.name}` : ''}
        size="sm"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setSocialModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={saveSocialProvider}>Save</button>
        </>}
      >
        <div className="form-group"><label className="form-label">Client ID</label><input className="form-input" value={socialForm.client_id} onChange={(e) => setSocialForm((f) => ({ ...f, client_id: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Client Secret</label><input className="form-input" type="password" placeholder="Leave blank to keep existing" value={socialForm.client_secret} onChange={(e) => setSocialForm((f) => ({ ...f, client_secret: e.target.value }))} /></div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={confirmDelete.open}
        onClose={() => setConfirmDelete({ open: false, endpoint: '', label: '', refetch: null })}
        onConfirm={doDelete}
        title="Delete Connection"
        message={`Delete "${confirmDelete.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
