import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

const LOCALES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'ja', label: 'Japanese' },
];
const DATE_FORMATS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD (ISO 8601)' },
];
const TIME_FORMATS = [
  { value: '12h', label: '12-hour (AM/PM)' },
  { value: '24h', label: '24-hour' },
];
const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'UTC-8 Pacific' },
  { value: 'America/New_York', label: 'UTC-5 Eastern' },
  { value: 'UTC', label: 'UTC+0 London' },
  { value: 'Asia/Singapore', label: 'UTC+8 Singapore' },
];
const REMINDER_SCHEDULES = [
  { value: 'every_2_days', label: 'Every 2 days' },
  { value: 'daily', label: 'Daily' },
  { value: 'every_3_days', label: 'Every 3 days' },
  { value: 'none', label: 'None' },
];
const SIGNING_ORDERS = [
  { value: 'sequential', label: 'Sequential (one at a time)' },
  { value: 'parallel', label: 'Parallel (all at once)' },
];

function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: 'relative', display: 'inline-block', width: 40, height: 22, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={onChange} style={{ opacity: 0, width: 0, height: 0 }} />
      <span style={{ position: 'absolute', inset: 0, background: checked ? 'var(--primary)' : 'var(--border)', borderRadius: 11, transition: '0.2s' }} />
    </label>
  );
}

export default function General() {
  const toast = useToast();
  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id;

  const { data, isLoading, refetch } = useApiQuery(
    ['general-settings', orgId],
    EP.GENERAL_SETTINGS,
    { params: orgId ? { organization: orgId } : {} },
    { enabled: !!orgId }
  );

  const [form, setForm] = useState(null);

  const s = data?.results?.[0] || data;

  useEffect(() => {
    if (s && !form) {
      setForm({
        application_name: s.application_name || 'HanMak',
        support_email: s.support_email || '',
        default_locale: s.default_locale || 'en-US',
        date_format: s.date_format || 'YYYY-MM-DD',
        time_format: s.time_format || '12h',
        default_timezone: s.default_timezone || 'UTC',
        default_envelope_expiration_days: s.default_envelope_expiration_days ?? 30,
        default_reminder_schedule: s.default_reminder_schedule || 'every_2_days',
        default_signing_order: s.default_signing_order || 'sequential',
        require_email_verification: s.require_email_verification ?? true,
        allow_mobile_signing: s.allow_mobile_signing ?? true,
        enable_completion_certificates: s.enable_completion_certificates ?? true,
        send_audit_trail_on_completion: s.send_audit_trail_on_completion ?? true,
        allow_bulk_send: s.allow_bulk_send ?? true,
      });
    }
  }, [s]);

  const saveMutation = useApiMutation(
    (payload) => apiClient.post(EP.GENERAL_SETTINGS, payload),
    {
      invalidateKeys: ['general-settings'],
      onSuccess: () => toast.success('General settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  function save() {
    if (!form) return;
    saveMutation.mutate({ ...form, organization: orgId });
  }

  const f = form || {};
  const setF = (key, value) => setForm(prev => ({ ...prev, [key]: value }));

  if (isLoading && !form) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">General Settings</h1>
          <p className="page-subtitle">Core application configuration and preferences</p>
        </div>
        <button className="btn btn-primary" disabled={saveMutation.isPending} onClick={save}>
          {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Application Settings</h3>
          <div className="form-group"><label className="form-label">Application Name</label><input className="form-input" value={f.application_name || ''} onChange={e => setF('application_name', e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Support Email</label><input className="form-input" type="email" value={f.support_email || ''} onChange={e => setF('support_email', e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">Default Language</label>
            <select className="form-input" value={f.default_locale || 'en-US'} onChange={e => setF('default_locale', e.target.value)}>
              {LOCALES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Date Format</label>
            <select className="form-input" value={f.date_format || 'YYYY-MM-DD'} onChange={e => setF('date_format', e.target.value)}>
              {DATE_FORMATS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Time Format</label>
            <select className="form-input" value={f.time_format || '12h'} onChange={e => setF('time_format', e.target.value)}>
              {TIME_FORMATS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Default Timezone</label>
            <select className="form-input" value={f.default_timezone || 'UTC'} onChange={e => setF('default_timezone', e.target.value)}>
              {TIMEZONES.map(tz => <option key={tz.value} value={tz.value}>{tz.label}</option>)}
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem' }}>Envelope Defaults</h3>
          <div className="form-group">
            <label className="form-label">Default Expiration (days)</label>
            <input className="form-input" type="number" style={{ width: 120 }} min={1} value={f.default_envelope_expiration_days ?? 30} onChange={e => setF('default_envelope_expiration_days', Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Default Reminder Schedule</label>
            <select className="form-input" value={f.default_reminder_schedule || 'every_2_days'} onChange={e => setF('default_reminder_schedule', e.target.value)}>
              {REMINDER_SCHEDULES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Signing Order</label>
            <select className="form-input" value={f.default_signing_order || 'sequential'} onChange={e => setF('default_signing_order', e.target.value)}>
              {SIGNING_ORDERS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem' }}>
            {[
              ['Require email verification before signing', 'require_email_verification'],
              ['Allow signing on mobile devices', 'allow_mobile_signing'],
              ['Enable completion certificates', 'enable_completion_certificates'],
              ['Send audit trail on completion', 'send_audit_trail_on_completion'],
              ['Allow bulk send', 'allow_bulk_send'],
            ].map(([label, key]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span>{label}</span>
                <Toggle checked={!!f[key]} onChange={e => setF(key, e.target.checked)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
