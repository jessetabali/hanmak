import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? 'var(--primary)' : 'var(--border)', borderRadius: 11, transition: '0.2s' }} />
    </label>
  );
}

function SectionHeading({ children }) {
  return (
    <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>{children}</h3>
  );
}

export default function Security() {
  const toast = useToast();
  const [confirmRevokeAll, setConfirmRevokeAll] = useState(false);

  const { data: secData, isLoading } = useApiQuery(['security-settings'], EP.SECURITY_SETTINGS);

  const [form, setForm] = useState(null);
  const [ipList, setIpList] = useState(['']);
  const [initialized, setInitialized] = useState(false);

  const s = secData?.results?.[0] ?? (Array.isArray(secData) ? secData[0] : secData);

  useEffect(() => {
    if (s && !initialized) {
      setForm({
        require_mfa: s.require_mfa ?? false,
        mfa_grace_period_days: s.mfa_grace_period_days ?? 7,
        allow_totp_mfa: s.allow_totp_mfa !== false,
        allow_passkeys: s.allow_passkeys !== false,
        password_min_length: s.password_min_length ?? 12,
        require_uppercase: s.require_uppercase !== false,
        require_lowercase: s.require_lowercase !== false,
        require_numbers: s.require_numbers !== false,
        require_symbols: s.require_special_char !== false,
        password_expiry_days: s.password_expiry_days ?? 90,
        password_history_count: s.password_history_count ?? 10,
        max_concurrent_sessions: s.max_concurrent_sessions ?? 5,
        session_timeout_minutes: s.session_timeout_minutes ?? 480,
        absolute_timeout_hours: s.absolute_timeout_hours ?? 24,
        ip_allowlist_enabled: s.ip_allowlist_enabled ?? false,
      });
      setIpList(Array.isArray(s.allowed_ip_ranges) && s.allowed_ip_ranges.length ? s.allowed_ip_ranges : ['']);
      setInitialized(true);
    }
  }, [s, initialized]);

  const saveMutation = useApiMutation(
    (payload) => apiClient.patch(EP.SECURITY_SETTINGS, payload),
    {
      invalidateKeys: ['security-settings'],
      onSuccess: () => toast.success('Security settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  async function revokeAllSessions() {
    try {
      const { data } = await apiClient.get(`${EP.SESSIONS}?page_size=100`);
      const sessions = (data.results ?? data).filter((sess) => !sess.revoked_at);
      await Promise.all(sessions.map((sess) => apiClient.post(EP.SESSION_REVOKE(sess.id), {})));
      toast.success(`Revoked ${sessions.length} active session(s)`);
      setConfirmRevokeAll(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }

  function save() {
    if (!form) return;
    const allowed_ip_ranges = ipList.map((ip) => ip.trim()).filter(Boolean);
    saveMutation.mutate({
      ...form,
      require_special_char: form.require_symbols,
      allowed_ip_ranges,
    });
  }

  const f = form || {};
  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  function addIpRow() {
    setIpList((prev) => [...prev, '']);
  }
  function removeIpRow(idx) {
    setIpList((prev) => prev.filter((_, i) => i !== idx));
  }
  function updateIp(idx, value) {
    setIpList((prev) => prev.map((ip, i) => (i === idx ? value : ip)));
  }

  if (isLoading && !form) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Security</h1>
          <p className="page-subtitle">Authentication, access control, and security policies</p>
        </div>
        <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={save}>
          {saveMutation.isPending ? 'Saving…' : 'Save Security Settings'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {/* MFA */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <SectionHeading>Multi-Factor Authentication</SectionHeading>
          <div className="flex flex-col gap-3">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.875rem' }}>Require MFA for all users</span>
              <Toggle checked={!!f.require_mfa} onChange={(e) => setF('require_mfa', e.target.checked)} />
            </div>

            <div className="form-group">
              <label className="form-label">MFA Grace Period (days, 0–30)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                max={30}
                style={{ width: 100 }}
                value={f.mfa_grace_period_days ?? 7}
                onChange={(e) => setF('mfa_grace_period_days', Number(e.target.value))}
              />
            </div>

            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem' }}>Allowed MFA Methods</div>
              <div className="flex flex-col gap-2">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.allow_totp_mfa} onChange={(e) => setF('allow_totp_mfa', e.target.checked)} />
                  TOTP (Google Authenticator, Authy)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!f.allow_passkeys} onChange={(e) => setF('allow_passkeys', e.target.checked)} />
                  Passkey / WebAuthn (FIDO2 hardware keys)
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Password Policy */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <SectionHeading>Password Policy</SectionHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Minimum Length (6–128)</label>
              <input className="form-input" type="number" min={6} max={128} style={{ width: 100 }} value={f.password_min_length ?? 12} onChange={(e) => setF('password_min_length', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Max Age Days (0 = never)</label>
              <input className="form-input" type="number" min={0} style={{ width: 100 }} value={f.password_expiry_days ?? 90} onChange={(e) => setF('password_expiry_days', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">History Count (0 = none)</label>
              <input className="form-input" type="number" min={0} style={{ width: 100 }} value={f.password_history_count ?? 10} onChange={(e) => setF('password_history_count', Number(e.target.value))} />
            </div>
          </div>

          <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem' }}>
            {[
              ['Require Uppercase', 'require_uppercase'],
              ['Require Lowercase', 'require_lowercase'],
              ['Require Numbers', 'require_numbers'],
              ['Require Special Characters', 'require_symbols'],
            ].map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.375rem 0', borderBottom: '1px solid var(--border)' }}>
                <span>{label}</span>
                <input type="checkbox" checked={!!f[key]} onChange={(e) => setF(key, e.target.checked)} />
              </div>
            ))}
          </div>
        </div>

        {/* Session Management */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <SectionHeading>Session Management</SectionHeading>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Max Concurrent Sessions (0 = unlimited)</label>
              <input className="form-input" type="number" min={0} style={{ width: 120 }} value={f.max_concurrent_sessions ?? 5} onChange={(e) => setF('max_concurrent_sessions', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Session Timeout (minutes, 0 = none)</label>
              <input className="form-input" type="number" min={0} style={{ width: 120 }} value={f.session_timeout_minutes ?? 480} onChange={(e) => setF('session_timeout_minutes', Number(e.target.value))} />
            </div>
            <div className="form-group">
              <label className="form-label">Absolute Timeout (hours, 0 = none)</label>
              <input className="form-input" type="number" min={0} style={{ width: 120 }} value={f.absolute_timeout_hours ?? 24} onChange={(e) => setF('absolute_timeout_hours', Number(e.target.value))} />
            </div>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmRevokeAll(true)}>
            Revoke All Active Sessions
          </button>
        </div>

        {/* IP Allowlist */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <SectionHeading>IP Allowlist</SectionHeading>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.875rem' }}>Enable IP Allowlist</span>
            <Toggle checked={!!f.ip_allowlist_enabled} onChange={(e) => setF('ip_allowlist_enabled', e.target.checked)} />
          </div>

          <div className="form-group">
            <label className="form-label">Allowed IP Ranges (CIDR, one per line)</label>
            <textarea
              className="form-input mono"
              rows={5}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', resize: 'vertical' }}
              placeholder={'192.168.1.0/24\n10.0.0.0/8'}
              value={ipList.filter(Boolean).join('\n')}
              onChange={(e) => {
                const lines = e.target.value.split('\n');
                setIpList(lines.length ? lines : ['']);
              }}
            />
            <div className="form-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Leave empty to allow all IPs. Changes take effect on next login.
            </div>
          </div>

          <div className="flex flex-col gap-2" style={{ marginTop: '0.5rem' }}>
            {ipList.map((ip, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  className="form-input"
                  style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.875rem' }}
                  placeholder="192.168.x.x/24"
                  value={ip}
                  onChange={(e) => updateIp(idx, e.target.value)}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => removeIpRow(idx)} title="Remove">×</button>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: '0.75rem' }} onClick={addIpRow}>
            + Add IP Range
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRevokeAll}
        onClose={() => setConfirmRevokeAll(false)}
        onConfirm={revokeAllSessions}
        title="Revoke All Sessions"
        message="Revoke all active sessions? You may need to sign in again on other devices."
        confirmLabel="Revoke All"
        danger
      />
    </div>
  );
}
