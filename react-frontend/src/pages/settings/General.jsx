import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

function Toggle({ id, checked, onChange }) {
  return (
    <label htmlFor={id} style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        style={{ opacity: 0, width: 0, height: 0 }}
      />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: checked ? 'var(--primary)' : 'var(--border)',
          borderRadius: 11,
          transition: '0.2s',
        }}
      />
    </label>
  );
}

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Vancouver',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Europe/Istanbul',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Perth',
  'Pacific/Auckland',
];

const DEFAULT_FORM = {
  application_name: '',
  time_format: '24h',
  default_language: 'en',
  date_format: 'YYYY-MM-DD',
  timezone: 'UTC',
  support_email: '',
  envelope_expiry_days: 30,
  allow_public_registration: false,
  require_email_verification: true,
  default_envelope_due_days: 7,
  enable_completion_certificates: true,
  enable_bulk_send: true,
  enable_mobile_signing: true,
};

export default function General() {
  const toast = useToast();
  const [form, setForm] = useState(DEFAULT_FORM);

  const { data, isLoading } = useApiQuery(['general-settings'], EP.GENERAL_SETTINGS);

  useEffect(() => {
    if (data) {
      const s = data?.results?.[0] || data;
      setForm((prev) => ({ ...prev, ...s }));
    }
  }, [data]);

  const saveMutation = useApiMutation(
    (payload) => apiClient.patch(EP.GENERAL_SETTINGS, payload),
    {
      invalidateKeys: ['general-settings'],
      onSuccess: () => toast.success('General settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  if (isLoading) return <Spinner center />;

  const sectionHeading = (label, topMargin = '1.5rem') => (
    <h3 style={{
      fontSize: '0.875rem',
      fontWeight: 700,
      color: 'var(--text-muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      marginBottom: '1rem',
      marginTop: topMargin,
    }}>
      {label}
    </h3>
  );

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 className="section-title" style={{ margin: 0 }}>General Settings</h2>
        <button
          className="btn btn-primary"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate(form)}
        >
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {sectionHeading('Application', '0')}

      <div className="form-group">
        <label className="form-label">Application Name</label>
        <input
          className="form-input"
          value={form.application_name}
          onChange={(e) => setF('application_name', e.target.value)}
          placeholder="HanMak"
        />
      </div>

      <div className="form-group">
        <label className="form-label">Support Email</label>
        <input
          className="form-input"
          type="email"
          value={form.support_email}
          onChange={(e) => setF('support_email', e.target.value)}
          placeholder="support@yourcompany.com"
        />
        <p className="form-hint">Shown to users on error pages and notification footers</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="form-group">
          <label className="form-label">Time Format</label>
          <select
            className="form-input"
            value={form.time_format}
            onChange={(e) => setF('time_format', e.target.value)}
          >
            <option value="12h">12-hour (AM/PM)</option>
            <option value="24h">24-hour</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Date Format</label>
          <select
            className="form-input"
            value={form.date_format}
            onChange={(e) => setF('date_format', e.target.value)}
          >
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Default Language</label>
          <select
            className="form-input"
            value={form.default_language}
            onChange={(e) => setF('default_language', e.target.value)}
          >
            <option value="en">English</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="es">Spanish</option>
            <option value="pt">Portuguese</option>
            <option value="it">Italian</option>
            <option value="nl">Dutch</option>
            <option value="ja">Japanese</option>
            <option value="zh">Chinese (Simplified)</option>
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">Timezone</label>
          <select
            className="form-input"
            value={form.timezone}
            onChange={(e) => setF('timezone', e.target.value)}
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
      </div>

      {sectionHeading('Envelope Defaults')}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Envelope Expiry Days</label>
          <input
            className="form-input"
            type="number"
            min={1}
            value={form.envelope_expiry_days}
            onChange={(e) => setF('envelope_expiry_days', Number(e.target.value))}
            style={{ width: 120 }}
          />
          <p className="form-hint">Days before an envelope expires</p>
        </div>
        <div className="form-group">
          <label className="form-label">Default Due Days</label>
          <input
            className="form-input"
            type="number"
            min={1}
            value={form.default_envelope_due_days}
            onChange={(e) => setF('default_envelope_due_days', Number(e.target.value))}
            style={{ width: 120 }}
          />
          <p className="form-hint">Default days until signing is due</p>
        </div>
      </div>

      {sectionHeading('Registration')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[
          {
            key: 'allow_public_registration',
            label: 'Allow Public Registration',
            hint: 'Allow anyone to create an account without an invitation',
          },
          {
            key: 'require_email_verification',
            label: 'Require Email Verification',
            hint: 'New users must verify their email before signing in',
          },
        ].map(({ key, label, hint }) => (
          <div
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{hint}</div>
            </div>
            <Toggle
              id={key}
              checked={!!form[key]}
              onChange={(e) => setF(key, e.target.checked)}
            />
          </div>
        ))}
      </div>

      {sectionHeading('Features')}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[
          {
            key: 'enable_completion_certificates',
            label: 'Completion Certificates',
            hint: 'Generate a completion certificate PDF when all parties have signed an envelope',
          },
          {
            key: 'enable_bulk_send',
            label: 'Bulk Send',
            hint: 'Allow sending an envelope to multiple recipients simultaneously via CSV upload',
          },
          {
            key: 'enable_mobile_signing',
            label: 'Mobile Signing',
            hint: 'Optimize the signing experience for mobile browsers with touch-friendly field controls',
          },
        ].map(({ key, label, hint }) => (
          <div
            key={key}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}
          >
            <div>
              <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{hint}</div>
            </div>
            <Toggle
              id={key}
              checked={!!form[key]}
              onChange={(e) => setF(key, e.target.checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
