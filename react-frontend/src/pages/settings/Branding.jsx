import { useState, useEffect, useRef } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

const COLOR_FIELDS = [
  { id: 'primary_color', label: 'Primary Color', default: '#4f8ef7' },
  { id: 'accent_color', label: 'Accent Color', default: '#0d1117' },
  { id: 'button_color', label: 'Button Color', default: '#4f8ef7' },
  { id: 'link_color', label: 'Link Color', default: '#4f8ef7' },
  { id: 'background_color', label: 'Background', default: '#ffffff' },
  { id: 'email_header_bg', label: 'Email Header BG', default: '#0d1117' },
];

export default function Branding() {
  const toast = useToast();
  const logoInputRef = useRef(null);
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id;

  const { data: brandingData, isLoading, refetch } = useApiQuery(
    ['branding', orgId],
    orgId ? EP.ORGANIZATION_BRANDING(orgId) : null,
    {},
    { enabled: !!orgId }
  );

  const [colors, setColors] = useState({});
  const [domain, setDomain] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  const [emailFooter, setEmailFooter] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (brandingData && !initialized) {
      const v = (brandingData.value && typeof brandingData.value === 'object') ? brandingData.value : {};
      const colorMap = {};
      COLOR_FIELDS.forEach(f => { colorMap[f.id] = v[f.id] || f.default; });
      setColors(colorMap);
      setDomain(v.signing_portal_domain || '');
      setEmailDomain(v.email_from_domain || '');
      setEmailFooter(v.email_footer || '');
      if (brandingData.logo_url) setLogoPreview(brandingData.logo_url);
      setInitialized(true);
    }
  }, [brandingData, initialized]);

  const saveMutation = useApiMutation(
    (payload) => apiClient.patch(EP.ORGANIZATION_BRANDING(orgId), payload),
    {
      invalidateKeys: ['branding'],
      onSuccess: () => { toast.success('Branding saved'); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const uploadLogoMutation = useApiMutation(
    (formData) => apiClient.post(EP.ORGANIZATION_LOGO(orgId), formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
    {
      invalidateKeys: ['branding'],
      onSuccess: (d) => { toast.success('Logo uploaded'); if (d.data?.logo_url) setLogoPreview(d.data.logo_url); refetch(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  function handleSave() {
    saveMutation.mutate({
      value: {
        ...colors,
        signing_portal_domain: domain.trim(),
        email_from_domain: emailDomain.trim(),
        email_footer: emailFooter,
      },
    });
  }

  function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('logo', file);
    uploadLogoMutation.mutate(fd);
  }

  if (isLoading && !initialized) return <Spinner center />;

  const orgName = orgsData?.results?.[0]?.name || 'HanMak';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Branding</h1>
          <p className="page-subtitle">Customize the look and feel for signers and emails</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => { setInitialized(false); }}>Refresh</button>
          <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={handleSave}>
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Logo */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Logo &amp; Identity</h3>
          <div className="form-group">
            <label className="form-label">Organization Logo</label>
            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
              <div style={{ width: 80, height: 80, background: 'var(--primary)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: '1.5rem', flexShrink: 0, overflow: 'hidden' }}>
                {logoPreview
                  ? <img src={logoPreview} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  : orgName[0] || 'H'}
              </div>
              <div>
                <button className="btn btn-ghost btn-sm" onClick={() => logoInputRef.current?.click()} disabled={uploadLogoMutation.isPending}>
                  {uploadLogoMutation.isPending ? 'Uploading…' : 'Upload Logo'}
                </button>
                <input ref={logoInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" style={{ display: 'none' }} onChange={handleLogoChange} />
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>PNG or JPEG · Max 2MB · Recommended: 200×60px</div>
              </div>
            </div>
          </div>
        </div>

        {/* Color Palette */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Color Palette</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            {COLOR_FIELDS.map(f => (
              <div key={f.id} className="form-group">
                <label className="form-label">{f.label}</label>
                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                  <input
                    type="color"
                    value={colors[f.id] || f.default}
                    onChange={e => setColors(prev => ({ ...prev, [f.id]: e.target.value }))}
                    style={{ width: 40, height: 36, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                  />
                  <input
                    className="form-input"
                    value={colors[f.id] || f.default}
                    onChange={e => setColors(prev => ({ ...prev, [f.id]: e.target.value }))}
                    style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Domain */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Custom Domain</h3>
          <div className="form-group">
            <label className="form-label">Signing Portal Domain</label>
            <div className="flex gap-2">
              <input className="form-input" style={{ flex: 1 }} value={domain} placeholder="sign.yourorg.com" onChange={e => setDomain(e.target.value)} />
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>Add a CNAME record pointing your domain → portal.hanmak.io</div>
          </div>
          <div className="form-group">
            <label className="form-label">Email From Domain</label>
            <input className="form-input" value={emailDomain} placeholder="sign@yourorg.com" onChange={e => setEmailDomain(e.target.value)} />
          </div>
        </div>

        {/* Email Footer */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Custom Email Footer</h3>
          <textarea className="form-input" rows={4} placeholder="This email was sent by your organization. If you have questions, contact your support team." value={emailFooter} onChange={e => setEmailFooter(e.target.value)} />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>HTML is supported. Leave blank to use default HanMak footer.</div>
        </div>

        {/* Preview */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Preview</h3>
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: colors.email_header_bg || '#0d1117', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 40, height: 40, background: colors.primary_color || '#4f8ef7', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700 }}>
                {logoPreview ? <img src={logoPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} /> : orgName[0] || 'H'}
              </div>
              <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem' }}>{orgName}</span>
            </div>
            <div style={{ background: colors.background_color || '#ffffff', padding: '1.5rem' }}>
              <p style={{ color: '#374151', marginBottom: '1rem' }}>Please review and sign the document below.</p>
              <button style={{ background: colors.button_color || '#4f8ef7', color: 'white', border: 'none', borderRadius: 6, padding: '0.5rem 1rem', cursor: 'pointer', fontWeight: 600 }}>Sign Document</button>
            </div>
            {emailFooter && <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1.5rem', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>{emailFooter}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
