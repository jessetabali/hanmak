import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

const IDP_PRESETS = {
  Okta: { name: 'Okta SAML', entity_id: 'https://example.okta.com/app/hanmak/sso/saml/metadata', sso_url: 'https://example.okta.com/app/hanmak/sso/saml' },
  'Azure AD': { name: 'Azure AD SAML', entity_id: 'https://sts.windows.net/{tenant-id}/', sso_url: 'https://login.microsoftonline.com/{tenant-id}/saml2' },
  'Google Workspace': { name: 'Google Workspace SAML', entity_id: 'https://accounts.google.com/o/saml2?idpid={idp-id}', sso_url: 'https://accounts.google.com/o/saml2/idp?idpid={idp-id}' },
  OneLogin: { name: 'OneLogin SAML', entity_id: 'https://app.onelogin.com/saml/metadata/{app-id}', sso_url: 'https://your-subdomain.onelogin.com/trust/saml2/http-post/sso/{app-id}' },
  JumpCloud: { name: 'JumpCloud SAML', entity_id: 'https://sso.jumpcloud.com/saml2/hanmak', sso_url: 'https://sso.jumpcloud.com/saml2/hanmak' },
  'Ping Identity': { name: 'Ping Identity SAML', entity_id: 'https://auth.pingone.com/{environment-id}', sso_url: 'https://auth.pingone.com/{environment-id}/saml20/idp/sso' },
};

const SOCIAL_PROVIDERS = [
  { type: 'google', name: 'Google', color: '#4285f4' },
  { type: 'microsoft', name: 'Microsoft', color: '#0072c6' },
  { type: 'github', name: 'GitHub', color: '#333' },
  { type: 'linkedin', name: 'LinkedIn', color: '#0a66c2' },
  { type: 'apple', name: 'Apple', color: '#000' },
];

export default function SSO() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('saml');
  const [socialModal, setSocialModal] = useState(null);
  const [socialForm, setSocialForm] = useState({ client_id: '', client_secret: '', allowed_domains: '', is_enabled: false });

  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id;

  // SAML state
  const [saml, setSaml] = useState({ id: null, name: 'Primary SAML', entity_id: '', sso_url: '', x509_cert: '', sign_requests: true, require_signed_assertions: true, require_encrypted_assertions: false, allow_idp_initiated: false });
  // OIDC state
  const [oidc, setOidc] = useState({ id: null, name: 'Primary OIDC', discovery_url: '', client_id: '', client_secret: '', issuer: '', jwks_uri: '', authorization_endpoint: '', token_endpoint: '', scope: 'openid email profile groups', redirect_uri: '' });
  const [oidcTestResult, setOidcTestResult] = useState('');
  // LDAP state
  const [ldap, setLdap] = useState({ id: null, server_url: '', base_dn: '', bind_dn: '', bind_password: '', user_filter: '(objectClass=person)', email_attribute: 'mail' });
  const [ldapTestResult, setLdapTestResult] = useState('');
  // SCIM state
  const [scimTestExtId, setScimTestExtId] = useState('test-scim-user-1');
  const [scimTestEmail, setScimTestEmail] = useState('scim.test@example.com');
  const [scimTestResult, setScimTestResult] = useState('');
  // JIT state
  const [jit, setJit] = useState({ id: null, is_enabled: false, auto_create_user: true, update_on_login: true, require_domain_match: true, default_role: 'signer', allowed_domains: '' });
  // Social state
  const [socialData, setSocialData] = useState([]);

  const { data: connectionsData, refetch: refetchConnections } = useApiQuery(['sso-connections', orgId], EP.SSO_CONNECTIONS, { params: orgId ? { organization: orgId } : {} }, { enabled: !!orgId });
  const { data: scimData } = useApiQuery(['scim-connections', orgId], EP.SCIM_CONNECTIONS, { params: orgId ? { organization: orgId } : {} }, { enabled: !!orgId });
  const { data: ldapData, refetch: refetchLdap } = useApiQuery(['ldap-connections', orgId], EP.LDAP_CONNECTIONS, { params: orgId ? { organization: orgId } : {} }, { enabled: !!orgId });
  const { data: jitData, refetch: refetchJit } = useApiQuery(['jit-settings', orgId], EP.JIT_SETTINGS, { params: orgId ? { organization: orgId } : {} }, { enabled: !!orgId });
  const { data: socialProvidersData, refetch: refetchSocial } = useApiQuery(['social-providers', orgId], EP.SOCIAL_PROVIDERS, { params: orgId ? { organization: orgId } : {} }, { enabled: !!orgId });

  useEffect(() => {
    if (connectionsData) {
      const connections = connectionsData.results ?? connectionsData;
      const samlConn = connections.find(c => c.provider_type === 'saml');
      const oidcConn = connections.find(c => c.provider_type === 'oidc');
      if (samlConn) {
        const cfg = samlConn.config || {};
        setSaml(prev => ({ ...prev, id: samlConn.id, name: samlConn.name, entity_id: cfg.entity_id || '', sso_url: cfg.sso_url || '', x509_cert: cfg.x509_cert || '', sign_requests: cfg.sign_requests ?? true, require_signed_assertions: cfg.require_signed_assertions ?? true, require_encrypted_assertions: cfg.require_encrypted_assertions ?? false, allow_idp_initiated: cfg.allow_idp_initiated ?? false }));
      }
      if (oidcConn) {
        const cfg = oidcConn.config || {};
        setOidc(prev => ({ ...prev, id: oidcConn.id, name: oidcConn.name, discovery_url: cfg.discovery_url || '', client_id: cfg.client_id || '', client_secret: cfg.client_secret || '', issuer: cfg.issuer || '', jwks_uri: cfg.jwks_uri || '', authorization_endpoint: cfg.authorization_endpoint || '', token_endpoint: cfg.token_endpoint || '', scope: cfg.scope || 'openid email profile groups', redirect_uri: cfg.redirect_uri || '' }));
      }
    }
  }, [connectionsData]);

  useEffect(() => {
    if (ldapData) {
      const item = ldapData.results?.[0] || ldapData[0];
      if (item) setLdap({ id: item.id, server_url: `${item.use_ssl ? 'ldaps' : 'ldap'}://${item.host}:${item.port}`, base_dn: item.base_dn || '', bind_dn: item.bind_dn || '', bind_password: '', user_filter: item.user_filter || '(objectClass=person)', email_attribute: item.email_attribute || 'mail' });
    }
  }, [ldapData]);

  useEffect(() => {
    if (jitData) {
      const item = jitData.results?.[0] || jitData[0];
      if (item) setJit({ id: item.id, is_enabled: item.is_enabled ?? false, auto_create_user: item.auto_create_user ?? true, update_on_login: item.update_on_login ?? true, require_domain_match: item.require_domain_match ?? true, default_role: item.default_role || 'signer', allowed_domains: (item.allowed_domains || []).join(', ') });
    }
  }, [jitData]);

  useEffect(() => {
    if (socialProvidersData) setSocialData(socialProvidersData.results ?? socialProvidersData);
  }, [socialProvidersData]);

  async function upsertSSOConn(type, payload) {
    const connections = connectionsData?.results ?? connectionsData ?? [];
    const existing = connections.find(c => c.provider_type === type);
    if (existing) {
      const { data } = await apiClient.patch(EP.SSO_CONNECTION(existing.id), { ...payload, organization: orgId });
      return data;
    }
    const { data } = await apiClient.post(EP.SSO_CONNECTIONS, { ...payload, organization: orgId, provider_type: type, is_enabled: true });
    return data;
  }

  async function saveSAML() {
    try {
      if (!saml.entity_id) return toast.error('SAML IdP entity ID is required');
      if (!saml.x509_cert) return toast.error('SAML X.509 certificate is required');
      await upsertSSOConn('saml', { name: saml.name || 'Primary SAML', config: { entity_id: saml.entity_id, sso_url: saml.sso_url, x509_cert: saml.x509_cert, sign_requests: saml.sign_requests, require_signed_assertions: saml.require_signed_assertions, require_encrypted_assertions: saml.require_encrypted_assertions, allow_idp_initiated: saml.allow_idp_initiated } });
      toast.success('SAML connection saved');
      refetchConnections();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  }

  async function saveOIDC() {
    try {
      if (!oidc.client_id) return toast.error('OIDC client ID is required');
      if (!oidc.issuer) return toast.error('OIDC issuer is required');
      await upsertSSOConn('oidc', { name: oidc.name || 'Primary OIDC', config: { discovery_url: oidc.discovery_url, client_id: oidc.client_id, client_secret: oidc.client_secret, issuer: oidc.issuer, jwks_uri: oidc.jwks_uri, authorization_endpoint: oidc.authorization_endpoint, token_endpoint: oidc.token_endpoint, scope: oidc.scope, redirect_uri: oidc.redirect_uri, algorithms: ['RS256'] } });
      toast.success('OIDC connection saved');
      refetchConnections();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  }

  function parseLDAPUrl(raw) {
    try {
      const url = new URL(raw.includes('://') ? raw : `ldap://${raw}`);
      return { host: url.hostname, port: Number(url.port || (url.protocol === 'ldaps:' ? 636 : 389)), use_ssl: url.protocol === 'ldaps:' };
    } catch {
      return { host: raw.replace(/^ldaps?:\/\//, ''), port: 389, use_ssl: raw.startsWith('ldaps://') };
    }
  }

  async function saveLDAP() {
    try {
      const parsed = parseLDAPUrl(ldap.server_url);
      if (!parsed.host) return toast.error('LDAP server URL is required');
      const payload = { organization: orgId, host: parsed.host, port: parsed.port, use_ssl: parsed.use_ssl, use_tls: !parsed.use_ssl, bind_dn: ldap.bind_dn, bind_password: ldap.bind_password, base_dn: ldap.base_dn, user_filter: ldap.user_filter, email_attribute: ldap.email_attribute, is_enabled: true };
      if (ldap.id) {
        const { data } = await apiClient.patch(`/ldap-connections/${ldap.id}/`, payload);
        setLdap(prev => ({ ...prev, id: data.id }));
      } else {
        const { data } = await apiClient.post(EP.LDAP_CONNECTIONS, payload);
        setLdap(prev => ({ ...prev, id: data.id }));
      }
      toast.success('LDAP settings saved');
      refetchLdap();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  }

  async function testLDAP() {
    try {
      await saveLDAP();
      if (!ldap.id) return;
      const { data } = await apiClient.post(`/ldap-connections/${ldap.id}/test/`, {});
      setLdapTestResult(data.ok ? `success:${data.message}` : `error:${data.message}`);
      toast[data.ok ? 'success' : 'error'](data.message);
    } catch (e) { setLdapTestResult(`error:${e.response?.data?.detail || e.message}`); toast.error(e.response?.data?.detail || e.message); }
  }

  async function saveJIT() {
    try {
      const payload = { organization: orgId, is_enabled: jit.is_enabled, auto_create_user: jit.auto_create_user, update_on_login: jit.update_on_login, require_domain_match: jit.require_domain_match, default_role: jit.default_role, allowed_domains: jit.allowed_domains.split(',').map(d => d.trim()).filter(Boolean) };
      if (jit.id) {
        await apiClient.patch(`/jit-settings/${jit.id}/`, payload);
      } else {
        const { data } = await apiClient.post(EP.JIT_SETTINGS, payload);
        setJit(prev => ({ ...prev, id: data.id }));
      }
      toast.success('JIT settings saved');
      refetchJit();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  }

  async function testSCIM(active) {
    try {
      const { data } = await apiClient.post('/scim-identities/provision-user/', { organization: orgId, externalId: scimTestExtId, userName: scimTestEmail, active });
      setScimTestResult(`success:${data.user.email} · ${data.membership.is_active ? 'active' : 'deactivated'}`);
      toast.success(`SCIM user ${active ? 'provisioned' : 'deactivated'}`);
    } catch (e) { setScimTestResult(`error:${e.response?.data?.detail || e.message}`); toast.error(e.response?.data?.detail || e.message); }
  }

  async function saveSocialProvider(type, id) {
    try {
      const payload = { organization: orgId, provider_type: type, client_id: socialForm.client_id, client_secret: socialForm.client_secret, allowed_domains: socialForm.allowed_domains.split(',').map(d => d.trim()).filter(Boolean), is_enabled: socialForm.is_enabled };
      if (id) await apiClient.patch(`/social-providers/${id}/`, payload);
      else await apiClient.post(EP.SOCIAL_PROVIDERS, payload);
      toast.success('Social provider saved');
      setSocialModal(null);
      refetchSocial();
    } catch (e) { toast.error(e.response?.data?.detail || e.message); }
  }

  const scimConnections = scimData?.results ?? scimData ?? [];
  const savedSocial = new Map(socialData.map(s => [s.provider_type, s]));

  const TABS = [
    ['saml', 'SAML 2.0'],
    ['oidc', 'OIDC / OAuth 2.0'],
    ['ldap', 'LDAP / AD'],
    ['scim', 'SCIM Provisioning'],
    ['jit', 'JIT Provisioning'],
    ['social', 'Social Login'],
  ];

  const spDetails = [
    ['SP Entity ID', 'https://app.hanmak.io/saml/metadata'],
    ['ACS URL', 'https://app.hanmak.io/saml/acs'],
    ['SLS URL', 'https://app.hanmak.io/saml/sls'],
    ['Metadata URL', 'https://app.hanmak.io/saml/metadata.xml'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">SSO &amp; Identity</h1>
          <p className="page-subtitle">SAML, OIDC, LDAP, OAuth providers, SCIM provisioning, and JIT</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          if (activeTab === 'saml') saveSAML();
          else if (activeTab === 'oidc') saveOIDC();
          else if (activeTab === 'ldap') saveLDAP();
          else if (activeTab === 'jit') saveJIT();
          else toast.info('Use each provider row to save settings.');
        }}>Save</button>
      </div>

      {/* Tabs */}
      <div className="card" style={{ padding: 0, marginBottom: '1.5rem' }}>
        <div className="tabs" style={{ padding: '0 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex' }}>
          {TABS.map(([id, label]) => (
            <button key={id} className={`tab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>
          ))}
        </div>

        {/* SAML Tab */}
        {activeTab === 'saml' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>SAML 2.0 Single Sign-On</div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: 4 }}>Configure your Identity Provider for SAML-based SSO</div>
              </div>
              <Badge color={saml.id ? 'success' : 'secondary'}>{saml.id ? 'Configured' : 'Not configured'}</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Identity Provider (IdP) Config</h4>
                <div className="form-group"><label className="form-label">Connection Name</label><input className="form-input" value={saml.name} onChange={e => setSaml(s => ({ ...s, name: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">IdP Entity ID</label><input className="form-input mono" placeholder="https://idp.example.com/saml/metadata" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} value={saml.entity_id} onChange={e => setSaml(s => ({ ...s, entity_id: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">IdP SSO URL</label><input className="form-input" placeholder="https://idp.example.com/saml/sso" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }} value={saml.sso_url} onChange={e => setSaml(s => ({ ...s, sso_url: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">IdP Certificate (X.509)</label><textarea className="form-input" rows={4} placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }} value={saml.x509_cert} onChange={e => setSaml(s => ({ ...s, x509_cert: e.target.value }))} /></div>
                <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem' }}>
                  {[['sign_requests', 'Sign SAML requests'], ['require_signed_assertions', 'Require signed assertions'], ['require_encrypted_assertions', 'Require encrypted assertions'], ['allow_idp_initiated', 'Allow unsolicited IdP-initiated SSO']].map(([key, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                      <input type="checkbox" checked={!!saml[key]} onChange={e => setSaml(s => ({ ...s, [key]: e.target.checked }))} /> {label}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Service Provider (SP) Details</h4>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.75rem' }}>Provide these to your IdP:</div>
                  {spDetails.map(([k, v]) => (
                    <div key={k} style={{ marginBottom: '0.625rem' }}>
                      <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{k}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', flex: 1, wordBreak: 'break-all' }}>{v}</code>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px' }} onClick={() => { navigator.clipboard?.writeText(v); toast.success('Copied!'); }}>Copy</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.75rem' }}>Quick Setup — Popular Providers</div>
              <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
                {Object.entries(IDP_PRESETS).map(([name, preset]) => (
                  <button key={name} className="btn btn-ghost btn-sm" onClick={() => {
                    setSaml(s => ({ ...s, name: preset.name, entity_id: preset.entity_id, sso_url: preset.sso_url }));
                    toast.success(`${name} preset loaded. Paste the IdP certificate, then Save.`);
                  }}>{name}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* OIDC Tab */}
        {activeTab === 'oidc' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>OpenID Connect / OAuth 2.0</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group"><label className="form-label">Connection Name</label><input className="form-input" value={oidc.name} onChange={e => setOidc(o => ({ ...o, name: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Discovery URL</label><input className="form-input" placeholder="https://accounts.google.com/.well-known/openid-configuration" value={oidc.discovery_url} onChange={e => setOidc(o => ({ ...o, discovery_url: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Client ID</label><input className="form-input" placeholder="your-client-id" value={oidc.client_id} onChange={e => setOidc(o => ({ ...o, client_id: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Client Secret</label><input className="form-input" type="password" placeholder="••••••••••••" value={oidc.client_secret} onChange={e => setOidc(o => ({ ...o, client_secret: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Issuer</label><input className="form-input" placeholder="https://accounts.google.com" value={oidc.issuer} onChange={e => setOidc(o => ({ ...o, issuer: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">JWKS URL</label><input className="form-input" placeholder="https://www.googleapis.com/oauth2/v3/certs" value={oidc.jwks_uri} onChange={e => setOidc(o => ({ ...o, jwks_uri: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Authorization Endpoint</label><input className="form-input" placeholder="https://accounts.google.com/o/oauth2/v2/auth" value={oidc.authorization_endpoint} onChange={e => setOidc(o => ({ ...o, authorization_endpoint: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Token Endpoint</label><input className="form-input" placeholder="https://oauth2.googleapis.com/token" value={oidc.token_endpoint} onChange={e => setOidc(o => ({ ...o, token_endpoint: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Scopes</label><input className="form-input" value={oidc.scope} onChange={e => setOidc(o => ({ ...o, scope: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Redirect URI</label><input className="form-input" value={oidc.redirect_uri} onChange={e => setOidc(o => ({ ...o, redirect_uri: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={saveOIDC}>Save OIDC</button>
            </div>
            {oidcTestResult && (
              <div className={`alert ${oidcTestResult.startsWith('success') ? 'alert-success' : 'alert-warning'}`} style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 7, background: oidcTestResult.startsWith('success') ? '#dcfce7' : '#fef3c7', border: `1px solid ${oidcTestResult.startsWith('success') ? '#16a34a' : '#d97706'}`, fontSize: '0.875rem' }}>
                {oidcTestResult.replace(/^(success|error):/, '')}
              </div>
            )}
          </div>
        )}

        {/* LDAP Tab */}
        {activeTab === 'ldap' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>LDAP / Active Directory</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group"><label className="form-label">Server URL</label><input className="form-input" placeholder="ldaps://ldap.acmecorp.com:636" value={ldap.server_url} onChange={e => setLdap(l => ({ ...l, server_url: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Base DN</label><input className="form-input" placeholder="dc=acmecorp,dc=com" value={ldap.base_dn} onChange={e => setLdap(l => ({ ...l, base_dn: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Bind DN</label><input className="form-input" placeholder="cn=hanmak,ou=service,dc=acmecorp,dc=com" value={ldap.bind_dn} onChange={e => setLdap(l => ({ ...l, bind_dn: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Bind Password</label><input className="form-input" type="password" placeholder="••••••••" value={ldap.bind_password} onChange={e => setLdap(l => ({ ...l, bind_password: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">User Search Filter</label><input className="form-input" value={ldap.user_filter} onChange={e => setLdap(l => ({ ...l, user_filter: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">Email Attribute</label><input className="form-input" value={ldap.email_attribute} onChange={e => setLdap(l => ({ ...l, email_attribute: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={saveLDAP}>Save LDAP</button>
              <button className="btn btn-ghost btn-sm" onClick={testLDAP}>Test LDAP Connection</button>
            </div>
            {ldapTestResult && (
              <div className={`alert`} style={{ marginTop: '1rem', padding: '0.75rem', borderRadius: 7, background: ldapTestResult.startsWith('success') ? '#dcfce7' : '#fef3c7', border: `1px solid ${ldapTestResult.startsWith('success') ? '#16a34a' : '#d97706'}`, fontSize: '0.875rem' }}>
                {ldapTestResult.replace(/^(success|error):/, '')}
              </div>
            )}
          </div>
        )}

        {/* SCIM Tab */}
        {activeTab === 'scim' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>SCIM 2.0 Provisioning</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Automatically sync users and groups from your IdP to HanMak.</p>
            {scimConnections.length === 0 ? (
              <EmptyState title="No SCIM connections" message="Configure a SCIM connection to auto-provision users" />
            ) : scimConnections.map(conn => (
              <div key={conn.id} style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 8, marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{conn.name || `SCIM #${conn.id}`}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Endpoint: {conn.scim_endpoint || 'n/a'}</div>
                  </div>
                  <Badge color={conn.is_enabled ? 'success' : 'secondary'}>{conn.is_enabled ? 'Active' : 'Inactive'}</Badge>
                </div>
              </div>
            ))}
            <div style={{ marginTop: '1.25rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
              <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '0.75rem' }}>Test Provision User</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group"><label className="form-label">External ID</label><input className="form-input" value={scimTestExtId} onChange={e => setScimTestExtId(e.target.value)} /></div>
                <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={scimTestEmail} onChange={e => setScimTestEmail(e.target.value)} /></div>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" onClick={() => testSCIM(true)}>Provision</button>
                <button className="btn btn-ghost btn-sm" onClick={() => testSCIM(false)}>Deactivate</button>
              </div>
              {scimTestResult && (
                <div style={{ marginTop: '0.75rem', padding: '0.625rem', borderRadius: 7, background: scimTestResult.startsWith('success') ? '#dcfce7' : '#fee2e2', fontSize: '0.875rem' }}>
                  {scimTestResult.replace(/^(success|error):/, '')}
                </div>
              )}
            </div>
          </div>
        )}

        {/* JIT Tab */}
        {activeTab === 'jit' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>Just-In-Time Provisioning</div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>Automatically create and update user accounts when they sign in via SSO.</p>
            <div className="flex flex-col gap-3" style={{ fontSize: '0.875rem' }}>
              {[
                ['is_enabled', 'Enable JIT provisioning'],
                ['auto_create_user', 'Auto-create user on first SSO login'],
                ['update_on_login', 'Update user attributes on each login'],
                ['require_domain_match', 'Require email domain match'],
              ].map(([key, label]) => (
                <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                  <span>{label}</span>
                  <input type="checkbox" checked={!!jit[key]} onChange={e => setJit(j => ({ ...j, [key]: e.target.checked }))} />
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Default JIT Role</label>
              <select className="form-input" value={jit.default_role} onChange={e => setJit(j => ({ ...j, default_role: e.target.value }))}>
                <option value="signer">Signer</option>
                <option value="viewer">Viewer</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Allowed JIT Domains (comma-separated)</label>
              <input className="form-input" placeholder="acmecorp.com, acme.io" value={jit.allowed_domains} onChange={e => setJit(j => ({ ...j, allowed_domains: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={saveJIT}>Save JIT Settings</button>
          </div>
        )}

        {/* Social Tab */}
        {activeTab === 'social' && (
          <div style={{ padding: '1.5rem' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '1.25rem' }}>Social Login Providers</div>
            <div className="flex flex-col gap-3">
              {SOCIAL_PROVIDERS.map(({ type, name, color }) => {
                const item = savedSocial.get(type) || {};
                return (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ width: 36, height: 36, background: color, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.875rem', flexShrink: 0 }}>{name[0]}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{item.client_id ? `Client ${item.client_id}` : 'Not configured'}</div>
                    </div>
                    <Badge color={item.is_enabled ? 'success' : 'secondary'}>{item.is_enabled ? 'Enabled' : 'Disabled'}</Badge>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSocialModal({ type, name, id: item.id || null });
                      setSocialForm({ client_id: item.client_id || '', client_secret: '', allowed_domains: (item.allowed_domains || []).join(', '), is_enabled: !!item.is_enabled });
                    }}>Configure</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Social Provider Modal */}
      <Modal
        open={!!socialModal}
        onClose={() => setSocialModal(null)}
        title={socialModal ? `${socialModal.name} Login` : ''}
        size="sm"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setSocialModal(null)}>Cancel</button>
          <button className="btn btn-primary" onClick={() => socialModal && saveSocialProvider(socialModal.type, socialModal.id)}>Save</button>
        </>}
      >
        <div className="form-group"><label className="form-label">Client ID</label><input className="form-input" value={socialForm.client_id} onChange={e => setSocialForm(f => ({ ...f, client_id: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Client Secret</label><input className="form-input" type="password" placeholder="Leave blank to keep existing" value={socialForm.client_secret} onChange={e => setSocialForm(f => ({ ...f, client_secret: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Allowed Domains (comma-separated)</label><input className="form-input" placeholder="example.com, example.org" value={socialForm.allowed_domains} onChange={e => setSocialForm(f => ({ ...f, allowed_domains: e.target.value }))} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={socialForm.is_enabled} onChange={e => setSocialForm(f => ({ ...f, is_enabled: e.target.checked }))} /> Enable provider
        </label>
      </Modal>
    </div>
  );
}
