import { useState, useRef, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

const DEFAULT_COLORS = {
  primary: '#4f8ef7',
  accent: '#0d1117',
  background: '#ffffff',
  link: '#4f8ef7',
  border: '#e5e7eb',
  sidebar_bg: '#1a1d23',
  sidebar_text: '#e2e8f0',
};

export default function Branding() {
  const toast = useToast();
  const logoInputRef = useRef(null);

  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id
    || parseInt(localStorage.getItem('HANMAK_ORGANIZATION_ID') || '0') || undefined;
  const orgName = orgsData?.results?.[0]?.name || 'HanMak';

  const { data: brandingData, isLoading, refetch } = useApiQuery(
    ['branding', orgId],
    orgId ? EP.ORGANIZATION_BRANDING(orgId) : null,
    {},
    { enabled: !!orgId }
  );

  const [colors, setColors] = useState({ ...DEFAULT_COLORS });
  const [domain, setDomain] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  const [emailFooter, setEmailFooter] = useState('');
  const [logoUrl, setLogoUrl] = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (brandingData && !initialized) {
      const v = brandingData.value && typeof brandingData.value === 'object'
        ? brandingData.value
        : {};
      setColors({
        primary: v.primary || DEFAULT_COLORS.primary,
        accent: v.accent || DEFAULT_COLORS.accent,
        background: v.background || DEFAULT_COLORS.background,
        link: v.link || DEFAULT_COLORS.link,
        border: v.border || DEFAULT_COLORS.border,
        sidebar_bg: v.sidebar_bg || DEFAULT_COLORS.sidebar_bg,
        sidebar_text: v.sidebar_text || DEFAULT_COLORS.sidebar_text,
      });
      setDomain(v.signing_portal_domain || '');
      setEmailDomain(v.email_from_domain || '');
      setEmailFooter(v.email_footer || '');
      if (brandingData.logo_url) setLogoUrl(brandingData.logo_url);
      setInitialized(true);
    }
  }, [brandingData, initialized]);

  const colorsMutation = useApiMutation(
    (payload) => apiClient.patch(EP.ORGANIZATION_BRANDING(orgId), payload),
    {
      invalidateKeys: ['branding'],
      onSuccess: () => { toast.success('Colors saved'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const domainMutation = useApiMutation(
    (payload) => apiClient.patch(EP.ORGANIZATION_BRANDING(orgId), payload),
    {
      invalidateKeys: ['branding'],
      onSuccess: () => { toast.success('Domain settings saved'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const logoMutation = useApiMutation(
    (formData) =>
      apiClient.post(EP.ORGANIZATION_LOGO(orgId), formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    {
      invalidateKeys: ['branding'],
      onSuccess: (d) => {
        toast.success('Logo uploaded');
        if (d.data?.logo_url) setLogoUrl(d.data.logo_url);
        refetch();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    logoMutation.mutate(fd);
  }

  function handleApplyColors() {
    colorsMutation.mutate({ value: { colors } });
  }

  function handleSaveDomain() {
    domainMutation.mutate({
      value: {
        signing_portal_domain: domain.trim(),
        email_from_domain: emailDomain.trim(),
        email_footer: emailFooter,
      },
    });
  }

  if (isLoading && !initialized) return <Spinner center />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
      {/* Left column */}
      <div className="flex flex-col gap-4">
        {/* Colors card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', marginTop: 0 }}>Colors</h3>

          {[
            { key: 'primary', label: 'Primary Color' },
            { key: 'accent', label: 'Accent Color' },
            { key: 'background', label: 'Background Color' },
            { key: 'link', label: 'Link Color' },
            { key: 'border', label: 'Border Color' },
            { key: 'sidebar_bg', label: 'Sidebar Background' },
            { key: 'sidebar_text', label: 'Sidebar Text' },
          ].map(({ key, label }) => (
            <div key={key} className="form-group">
              <label className="form-label">{label}</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="color"
                  value={colors[key] || '#000000'}
                  onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2, flexShrink: 0 }}
                />
                <input
                  className="form-input"
                  value={colors[key] || ''}
                  onChange={(e) => setColors((prev) => ({ ...prev, [key]: e.target.value }))}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                />
              </div>
            </div>
          ))}

          <button
            className="btn btn-primary"
            style={{ marginTop: '0.5rem' }}
            disabled={colorsMutation.isPending}
            onClick={handleApplyColors}
          >
            {colorsMutation.isPending ? 'Saving…' : 'Apply Colors'}
          </button>
        </div>

        {/* Domain card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', marginTop: 0 }}>Domain &amp; Footer</h3>

          <div className="form-group">
            <label className="form-label">Signing Portal Domain</label>
            <input
              className="form-input"
              value={domain}
              placeholder="sign.yourorg.com"
              onChange={(e) => setDomain(e.target.value)}
            />
            <p className="form-hint">Add a CNAME record pointing your domain to portal.hanmak.io</p>
          </div>

          <div className="form-group">
            <label className="form-label">Email From Domain</label>
            <input
              className="form-input"
              value={emailDomain}
              placeholder="sign@yourorg.com"
              onChange={(e) => setEmailDomain(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Email Footer Text</label>
            <textarea
              className="form-input"
              rows={4}
              value={emailFooter}
              placeholder="This email was sent by your organization. If you have questions, contact your support team."
              onChange={(e) => setEmailFooter(e.target.value)}
            />
            <p className="form-hint">HTML is supported. Leave blank to use the default HanMak footer.</p>
          </div>

          <button
            className="btn btn-primary"
            disabled={domainMutation.isPending}
            onClick={handleSaveDomain}
          >
            {domainMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        {/* Logo card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', marginTop: 0 }}>Organization Logo</h3>

          {logoUrl && (
            <div style={{ marginBottom: '1rem' }}>
              <img
                src={logoUrl}
                alt="Organization logo"
                style={{ maxWidth: '100%', maxHeight: 80, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)' }}
              />
            </div>
          )}

          <div
            className="upload-zone"
            style={{ border: '2px dashed var(--border)', borderRadius: 8, padding: '2rem', textAlign: 'center', cursor: 'pointer', background: 'var(--bg-secondary)' }}
            onClick={() => logoInputRef.current?.click()}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {logoUrl
                ? <img src={logoUrl} alt="" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }} />
                : <span style={{ color: 'var(--text-muted)' }}>+</span>
              }
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
              {logoMutation.isPending ? 'Uploading…' : 'Click to upload logo'}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>PNG or JPEG · Max 2 MB · Recommended: 200×60 px</div>
          </div>

          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleLogoChange}
          />

          <button
            className="btn btn-ghost"
            style={{ marginTop: '0.75rem', width: '100%' }}
            disabled={logoMutation.isPending}
            onClick={() => logoInputRef.current?.click()}
          >
            {logoMutation.isPending ? 'Uploading…' : 'Upload Logo'}
          </button>
        </div>

        {/* Preview card */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', marginTop: 0 }}>Preview</h3>

          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {/* Sidebar strip */}
            <div style={{ display: 'flex' }}>
              <div
                style={{
                  background: colors.sidebar_bg || DEFAULT_COLORS.sidebar_bg,
                  width: 64,
                  padding: '0.75rem 0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ width: 28, height: 28, background: colors.primary || DEFAULT_COLORS.primary, borderRadius: 6, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '0.75rem' }}>
                  {logoUrl
                    ? <img src={logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : (orgName?.[0] || 'H')}
                </div>
                {['■', '■', '■'].map((icon, i) => (
                  <div key={i} style={{ width: 28, height: 6, background: colors.sidebar_text || DEFAULT_COLORS.sidebar_text, borderRadius: 3, opacity: i === 0 ? 1 : 0.35 }} />
                ))}
              </div>

              {/* Main area */}
              <div style={{ flex: 1 }}>
                {/* Header bar */}
                <div
                  style={{
                    background: colors.accent || DEFAULT_COLORS.accent,
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ color: 'white', fontWeight: 700, fontSize: '0.8125rem' }}>{orgName}</span>
                </div>

                {/* Body */}
                <div style={{ background: colors.background || DEFAULT_COLORS.background, padding: '0.875rem', borderTop: `2px solid ${colors.border || DEFAULT_COLORS.border}` }}>
                  <p style={{ margin: '0 0 0.75rem', color: '#374151', fontSize: '0.8125rem' }}>
                    Please review and sign the document.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <button
                      style={{
                        background: colors.primary || DEFAULT_COLORS.primary,
                        color: 'white',
                        border: 'none',
                        borderRadius: 5,
                        padding: '0.3rem 0.7rem',
                        cursor: 'pointer',
                        fontWeight: 600,
                        fontSize: '0.75rem',
                      }}
                    >
                      Sign Document
                    </button>
                    <a style={{ color: colors.link || DEFAULT_COLORS.link, fontSize: '0.75rem', textDecoration: 'underline' }}>Learn more</a>
                  </div>
                </div>
              </div>
            </div>

            {emailFooter && (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  padding: '0.625rem 1rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border)',
                }}
              >
                {emailFooter}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
