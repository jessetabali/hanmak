import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Spinner from '../../components/ui/Spinner';

// ─── Notification event definitions ──────────────────────────────────────────
const NOTIF_GROUPS = [
  {
    label: 'Envelope Events',
    events: [
      { key: 'envelope.sent',      label: 'Envelope Sent',            desc: 'When an envelope is sent to a recipient for signing.' },
      { key: 'envelope.completed', label: 'Envelope Completed',       desc: 'When all signatures on an envelope have been collected.' },
      { key: 'envelope.voided',    label: 'Envelope Voided',          desc: 'When an envelope is cancelled and voided.' },
      { key: 'envelope.expiring',  label: 'Envelope Expiring Soon',   desc: 'When an envelope is approaching its expiration deadline.' },
      { key: 'envelope.declined',  label: 'Envelope Declined',        desc: 'When a recipient declines to sign an envelope.' },
    ],
  },
  {
    label: 'Approval Events',
    events: [
      { key: 'approval.requested', label: 'Approval Requested',  desc: 'When an approval request is assigned to you.' },
      { key: 'approval.approved',  label: 'Approval Approved',   desc: 'When an approval request you submitted is approved.' },
      { key: 'approval.rejected',  label: 'Approval Rejected',   desc: 'When an approval request you submitted is rejected.' },
    ],
  },
  {
    label: 'System Events',
    events: [
      { key: 'task.failed',     label: 'Background Task Failed', desc: 'When a background processing task encounters an error.' },
      { key: 'security.alert',  label: 'Security Alert',         desc: 'Suspicious login attempts, IP blocks, MFA changes.' },
      { key: 'user.invited',    label: 'New User Invited',       desc: 'When a new member is invited to the organization.' },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────
export default function Notifications() {
  const toast = useToast();

  const { data: prefsData, isLoading: prefsLoading, refetch } = useApiQuery(['notification-prefs'], EP.NOTIFICATION_PREFS);
  const { data: profileData, isLoading: profileLoading } = useApiQuery(['profile-me'], EP.PROFILE_ME);

  const [digestForm, setDigestForm] = useState({
    digest_frequency: 'daily',
    include_pending: true,
    include_overdue: true,
    include_completed: false,
    include_team_activity: false,
  });
  const [digestSaving, setDigestSaving] = useState(false);
  const [toggling, setToggling] = useState({}); // key = `${event_type}.email` or `.in_app`

  // Hydrate digest form from profile preferences
  useEffect(() => {
    if (profileData) {
      const prefs = profileData.preferences || {};
      setDigestForm({
        digest_frequency: prefs.digest_frequency ?? 'daily',
        include_pending: prefs.include_pending ?? true,
        include_overdue: prefs.include_overdue ?? true,
        include_completed: prefs.include_completed ?? false,
        include_team_activity: prefs.include_team_activity ?? false,
      });
    }
  }, [profileData]);

  const prefs = prefsData?.results ?? (Array.isArray(prefsData) ? prefsData : []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getPref(eventType) {
    return prefs.find((p) => p.event_type === eventType) || null;
  }

  async function upsertPref(eventType, field, value) {
    const toggleKey = `${eventType}.${field}`;
    setToggling((t) => ({ ...t, [toggleKey]: true }));
    try {
      const existing = getPref(eventType);
      if (existing) {
        await apiClient.patch(`/notification-preferences/${existing.id}/`, { [field]: value });
      } else {
        await apiClient.post(EP.NOTIFICATION_PREFS, { event_type: eventType, [field]: value });
      }
      refetch();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setToggling((t) => ({ ...t, [toggleKey]: false }));
    }
  }

  async function saveDigest() {
    setDigestSaving(true);
    try {
      await apiClient.patch(EP.PROFILE_ME, {
        preferences: {
          ...(profileData?.preferences || {}),
          digest_frequency: digestForm.digest_frequency,
          include_pending: digestForm.include_pending,
          include_overdue: digestForm.include_overdue,
          include_completed: digestForm.include_completed,
          include_team_activity: digestForm.include_team_activity,
        },
      });
      toast.success('Digest preferences saved');
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    } finally {
      setDigestSaving(false);
    }
  }

  function setDF(key, value) {
    setDigestForm((prev) => ({ ...prev, [key]: value }));
  }

  if (prefsLoading || profileLoading) return <Spinner center />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Configure email and in-app notification preferences</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* ── Notification preferences table ────────────────────────────── */}
        {NOTIF_GROUPS.map((group) => (
          <div key={group.label} className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>{group.label}</h3>
            <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)', fontWeight: 600, width: '50%' }}>Event</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, width: '25%' }}>Email</th>
                  <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)', fontWeight: 600, width: '25%' }}>In-App</th>
                </tr>
              </thead>
              <tbody>
                {group.events.map(({ key, label, desc }) => {
                  const pref = getPref(key);
                  const emailOn = pref ? !!pref.email_enabled : false;
                  const inAppOn = pref ? !!pref.in_app_enabled : false;
                  const emailBusy = !!toggling[`${key}.email_enabled`];
                  const inAppBusy = !!toggling[`${key}.in_app_enabled`];
                  return (
                    <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.75rem 0' }}>
                        <div style={{ fontWeight: 500 }}>{label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>{desc}</div>
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={emailOn}
                          disabled={emailBusy}
                          onChange={(e) => upsertPref(key, 'email_enabled', e.target.checked)}
                          style={{ cursor: emailBusy ? 'wait' : 'pointer', width: 16, height: 16 }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', padding: '0.75rem 0.5rem' }}>
                        <input
                          type="checkbox"
                          checked={inAppOn}
                          disabled={inAppBusy}
                          onChange={(e) => upsertPref(key, 'in_app_enabled', e.target.checked)}
                          style={{ cursor: inAppBusy ? 'wait' : 'pointer', width: 16, height: 16 }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        {/* ── Digest Email card ──────────────────────────────────────────── */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Digest Email</h3>

          <div className="form-group">
            <label className="form-label">Frequency</label>
            <select className="form-input" style={{ maxWidth: 220 }} value={digestForm.digest_frequency} onChange={(e) => setDF('digest_frequency', e.target.value)}>
              <option value="never">Never</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>

          <div style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.5rem', marginTop: '0.25rem' }}>Digest Content</div>
          <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            {[
              ['include_pending',       'Include Pending Signatures'],
              ['include_overdue',       'Include Overdue Items'],
              ['include_completed',     'Include Completed Documents'],
              ['include_team_activity', 'Include Team Activity Summary'],
            ].map(([field, label]) => (
              <label key={field} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '0.25rem 0' }}>
                <input
                  type="checkbox"
                  checked={!!digestForm[field]}
                  onChange={(e) => setDF(field, e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                {label}
              </label>
            ))}
          </div>

          <button className="btn btn-primary" disabled={digestSaving} onClick={saveDigest}>
            {digestSaving ? 'Saving…' : 'Save Digest Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
}
