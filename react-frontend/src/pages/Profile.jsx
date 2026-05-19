import { useState, useEffect, useCallback } from 'react';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { apiClient } from '../api/client';
import { EP } from '../api/endpoints';
import { useToast } from '../hooks/useToast';
import { formatDate, formatDateTime } from '../utils/formatting';
import Modal from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import Avatar from '../components/ui/Avatar';
import ConfirmDialog from '../components/ui/ConfirmDialog';

const TABS = [
  { key: 'personal', label: 'Personal Info' },
  { key: 'security', label: 'Security' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'activity', label: 'Activity' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'password', label: 'Change Password' },
];

const NOTIFICATION_EVENTS = [
  { key: 'envelope.signing_requested', label: 'Document sent to me for signing' },
  { key: 'envelope.completed', label: 'Document I sent was completed' },
  { key: 'approval.needed', label: 'Approval needed from me' },
  { key: 'approval.decided', label: 'Approval decision made on my request' },
  { key: 'envelope.expiring', label: 'Document overdue / expiring soon' },
  { key: 'task.completed', label: 'Team member completed a task' },
  { key: 'envelope.commented', label: 'New comment on envelope' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
];

const LANGUAGES = [
  ['en', 'English'],
  ['es', 'Spanish'],
  ['fr', 'French'],
  ['de', 'German'],
  ['ja', 'Japanese'],
];

// WebAuthn helpers
function b64ToBuffer(val) {
  const base64 = String(val)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(val).length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToB64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function credToJSON(credential) {
  const r = credential.response;
  const json = {
    id: credential.id,
    rawId: bufferToB64(credential.rawId),
    type: credential.type,
    response: {},
  };
  ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].forEach(
    (k) => { if (r[k]) json.response[k] = bufferToB64(r[k]); }
  );
  return json;
}

export default function Profile() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('personal');

  // Personal form
  const [personalForm, setPersonalForm] = useState(null);

  // Password form
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm: '' });

  // TOTP modal
  const [totpModal, setTotpModal] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState(null);
  const [totpCode, setTotpCode] = useState('');

  // Passkey
  const [passkeyPending, setPasskeyPending] = useState(false);

  // Confirm revoke all
  const [revokeAllConfirm, setRevokeAllConfirm] = useState(false);

  // Notification local overrides
  const [notifState, setNotifState] = useState({});

  // --- Data queries ---
  const { data: profile, isLoading: profileLoading, refetch: refetchProfile } = useApiQuery(
    ['profile-me'],
    EP.PROFILE_ME
  );

  const { data: sessionsData, isLoading: sessionsLoading, refetch: refetchSessions } = useApiQuery(
    ['my-sessions'],
    EP.SESSIONS,
    {},
    { enabled: activeTab === 'sessions' }
  );

  const { data: activityData, isLoading: activityLoading } = useApiQuery(
    ['profile-activity'],
    EP.PROFILE_ACTIVITY,
    {},
    { enabled: activeTab === 'activity' }
  );

  const { data: mfaData, isLoading: mfaLoading, refetch: refetchMFA } = useApiQuery(
    ['mfa-devices'],
    EP.MFA_DEVICES,
    {},
    { enabled: activeTab === 'security' }
  );

  const { data: notifData, isLoading: notifLoading, refetch: refetchNotif } = useApiQuery(
    ['notif-prefs'],
    EP.NOTIFICATION_PREFS,
    {},
    { enabled: activeTab === 'notifications' }
  );

  // Derived
  const sessions = sessionsData?.results ?? sessionsData ?? [];
  const activityEvents = activityData?.audit_events ?? activityData?.results ?? [];
  const mfaDevices = mfaData?.results ?? mfaData ?? [];
  const notifPrefs = notifData?.results ?? notifData ?? [];
  const totpDevice = mfaDevices.find((d) => d.method === 'totp' && d.is_confirmed);
  const passkeys = mfaDevices.filter((d) => d.method === 'webauthn');
  const prefMap = {};
  notifPrefs.forEach((p) => { prefMap[p.event_type] = p; });

  // Initialize personal form from profile data
  useEffect(() => {
    if (profile && !personalForm) {
      setPersonalForm({
        first_name: profile.first_name || '',
        last_name: profile.last_name || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        timezone: profile.timezone || 'UTC',
        locale: profile.locale || 'en',
      });
    }
  }, [profile, personalForm]);

  // Reset notif local state when prefs reload
  useEffect(() => {
    setNotifState({});
  }, [notifData]);

  // --- Mutations ---
  const saveMutation = useApiMutation(
    (payload) => apiClient.patch(EP.PROFILE_ME, payload),
    {
      invalidateKeys: ['profile-me'],
      onSuccess: () => toast.success('Profile updated'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const pwMutation = useApiMutation(
    (payload) => apiClient.post(EP.CHANGE_PASSWORD, payload),
    {
      onSuccess: () => {
        toast.success('Password changed. All other sessions will be invalidated.');
        setPwForm({ current_password: '', new_password: '', confirm: '' });
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const revokeMutation = useApiMutation(
    (id) => apiClient.post(EP.SESSION_REVOKE(id), {}),
    {
      invalidateKeys: ['my-sessions'],
      onSuccess: () => { toast.success('Session revoked'); refetchSessions(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const revokeAllMutation = useApiMutation(
    () => apiClient.post(EP.SESSION_REVOKE_OTHERS, {}),
    {
      invalidateKeys: ['my-sessions'],
      onSuccess: () => {
        toast.success('All other sessions revoked');
        setRevokeAllConfirm(false);
        refetchSessions();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const disableTotpMutation = useApiMutation(
    (id) => apiClient.delete(`${EP.MFA_DEVICES}${id}/`),
    {
      invalidateKeys: ['mfa-devices'],
      onSuccess: () => { toast.success('TOTP disabled'); refetchMFA(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const deletePasskeyMutation = useApiMutation(
    (id) => apiClient.delete(`${EP.MFA_DEVICES}${id}/`),
    {
      invalidateKeys: ['mfa-devices'],
      onSuccess: () => { toast.success('Passkey removed'); refetchMFA(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  // --- Handlers ---
  const handleSavePersonal = useCallback(() => {
    if (!personalForm) return;
    saveMutation.mutate(personalForm);
  }, [personalForm, saveMutation]);

  const handleChangePassword = useCallback(() => {
    const { current_password, new_password, confirm } = pwForm;
    if (!current_password || !new_password || !confirm) {
      toast.error('All fields are required');
      return;
    }
    if (new_password !== confirm) {
      toast.error('Passwords do not match');
      return;
    }
    if (new_password.length < 12) {
      toast.error('New password must be at least 12 characters');
      return;
    }
    pwMutation.mutate({ old_password: current_password, new_password, confirm_password: confirm });
  }, [pwForm, pwMutation, toast]);

  const handleSetupTotp = useCallback(async () => {
    try {
      const res = await apiClient.post(`${EP.MFA_DEVICES}totp_setup_begin/`, {});
      setTotpSetupData(res.data);
      setTotpCode('');
      setTotpModal(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }, [toast]);

  const handleConfirmTotp = useCallback(async () => {
    if (totpCode.length !== 6 || !/^\d+$/.test(totpCode)) {
      toast.error('Enter the 6-digit code from your authenticator app');
      return;
    }
    try {
      await apiClient.post(`${EP.MFA_DEVICES}totp_setup_confirm/`, {
        device_id: totpSetupData.device_id,
        code: totpCode,
      });
      toast.success('Authenticator app set up successfully');
      setTotpModal(false);
      setTotpSetupData(null);
      refetchMFA();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }, [totpCode, totpSetupData, refetchMFA, toast]);

  const handleRegisterPasskey = useCallback(async () => {
    if (!window.PublicKeyCredential || !navigator.credentials) {
      toast.error('This browser does not support passkeys');
      return;
    }
    setPasskeyPending(true);
    try {
      const begin = await apiClient.post(`${EP.MFA_DEVICES}passkey_begin_registration/`, {});
      const options = begin.data;
      const pkOptions = { ...options.options.publicKey };
      pkOptions.challenge = b64ToBuffer(pkOptions.challenge);
      pkOptions.user = { ...pkOptions.user, id: b64ToBuffer(pkOptions.user.id) };
      pkOptions.excludeCredentials = (pkOptions.excludeCredentials || []).map((c) => ({
        ...c,
        id: b64ToBuffer(c.id),
      }));
      const credential = await navigator.credentials.create({ publicKey: pkOptions });
      const name = `${navigator.platform || 'Browser'} Passkey`;
      await apiClient.post(`${EP.MFA_DEVICES}passkey_finish_registration/`, {
        challenge: options.challenge,
        credential: credToJSON(credential),
        name,
      });
      toast.success('Passkey registered');
      refetchMFA();
    } catch (e) {
      toast.error(e.message || 'Passkey registration failed');
    } finally {
      setPasskeyPending(false);
    }
  }, [refetchMFA, toast]);

  const getPrefValue = (key, field) => {
    if (notifState[key]?.[field] !== undefined) return notifState[key][field];
    const pref = prefMap[key];
    if (pref) return field === 'email' ? pref.email_enabled : pref.in_app_enabled;
    return true;
  };

  const togglePref = (key, field) => {
    setNotifState((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: !getPrefValue(key, field) },
    }));
  };

  const handleSaveNotifications = useCallback(async () => {
    try {
      await Promise.all(
        NOTIFICATION_EVENTS.map(({ key }) => {
          const pref = prefMap[key];
          const state = notifState[key] || {};
          const email_enabled = state.email !== undefined ? state.email : (pref?.email_enabled ?? true);
          const in_app_enabled = state.inApp !== undefined ? state.inApp : (pref?.in_app_enabled ?? true);
          if (pref?.id) {
            return apiClient.patch(`${EP.NOTIFICATION_PREFS}${pref.id}/`, {
              email_enabled,
              in_app_enabled,
            });
          }
          return apiClient.post(EP.NOTIFICATION_PREFS, {
            event_type: key,
            email_enabled,
            in_app_enabled,
          });
        })
      );
      toast.success('Notification preferences saved');
      refetchNotif();
    } catch (e) {
      toast.error(e.response?.data?.detail || e.message);
    }
  }, [prefMap, notifState, refetchNotif, toast]);

  const displayName = profile?.display_name || profile?.username || '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Personal account settings and preferences</p>
        </div>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem', alignItems: 'start' }}
      >
        {/* Left: Avatar + summary */}
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1.5rem', textAlign: 'center' }}>
            {profileLoading ? (
              <Spinner center />
            ) : (
              <>
                <div style={{ marginBottom: '1rem' }}>
                  <Avatar name={displayName} size={72} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '0.25rem' }}>
                  {displayName}
                </div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  {profile?.email || '—'}
                </div>
                {profile?.is_staff && <Badge color="danger">Admin</Badge>}
                {profile?.role && !profile?.is_staff && (
                  <Badge color="primary">{profile.role}</Badge>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Tabs */}
        <div className="card">
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
            <div className="tabs" style={{ flexWrap: 'wrap', gap: '0.25rem' }}>
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ padding: '1.5rem' }}>
            {/* ── Personal Info ── */}
            {activeTab === 'personal' && (
              <div>
                {profileLoading ? (
                  <Spinner center />
                ) : (
                  <>
                    <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                      <Avatar name={displayName} size={72} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">First Name</label>
                        <input
                          className="form-input"
                          value={personalForm?.first_name ?? ''}
                          onChange={(e) =>
                            setPersonalForm((f) => ({ ...f, first_name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Last Name</label>
                        <input
                          className="form-input"
                          value={personalForm?.last_name ?? ''}
                          onChange={(e) =>
                            setPersonalForm((f) => ({ ...f, last_name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Display Name</label>
                        <input
                          className="form-input"
                          value={personalForm?.display_name ?? ''}
                          onChange={(e) =>
                            setPersonalForm((f) => ({ ...f, display_name: e.target.value }))
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                          className="form-input"
                          type="email"
                          value={profile?.email || ''}
                          disabled
                          style={{ opacity: 0.7 }}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Timezone</label>
                        <select
                          className="form-input"
                          value={personalForm?.timezone ?? 'UTC'}
                          onChange={(e) =>
                            setPersonalForm((f) => ({ ...f, timezone: e.target.value }))
                          }
                        >
                          {TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Language</label>
                        <select
                          className="form-input"
                          value={personalForm?.locale ?? 'en'}
                          onChange={(e) =>
                            setPersonalForm((f) => ({ ...f, locale: e.target.value }))
                          }
                        >
                          {LANGUAGES.map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Bio</label>
                      <textarea
                        className="form-input"
                        rows={3}
                        value={personalForm?.bio ?? ''}
                        onChange={(e) =>
                          setPersonalForm((f) => ({ ...f, bio: e.target.value }))
                        }
                        placeholder="Short bio…"
                      />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        className="btn btn-primary"
                        disabled={saveMutation.isPending}
                        onClick={handleSavePersonal}
                      >
                        {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Security ── */}
            {activeTab === 'security' && (
              <div className="flex flex-col gap-4">
                {/* TOTP */}
                <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        Two-Factor Authentication (TOTP)
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {mfaLoading ? 'Loading…' : totpDevice ? (
                          <span style={{ color: 'var(--success)' }}>
                            ✓ Enabled — {totpDevice.name}
                          </span>
                        ) : (
                          'Not configured'
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {totpDevice ? (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={handleSetupTotp}
                          >
                            Reconfigure
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--danger)' }}
                            disabled={disableTotpMutation.isPending}
                            onClick={() => disableTotpMutation.mutate(totpDevice.id)}
                          >
                            Disable
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-primary btn-sm" onClick={handleSetupTotp}>
                          Set Up TOTP
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Passkeys */}
                <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: passkeys.length > 0 ? '0.75rem' : 0,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                        Passkeys / Hardware Keys
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                        {mfaLoading
                          ? 'Loading…'
                          : `${passkeys.length} passkey${passkeys.length !== 1 ? 's' : ''} registered`}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={passkeyPending}
                      onClick={handleRegisterPasskey}
                    >
                      {passkeyPending ? 'Registering…' : '+ Add Passkey'}
                    </button>
                  </div>

                  {passkeys.length > 0 && (
                    <div className="flex flex-col gap-2">
                      {passkeys.map((pk) => (
                        <div
                          key={pk.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '0.5rem 0',
                            borderTop: '1px solid var(--border)',
                            fontSize: '0.8125rem',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600 }}>{pk.name || 'Passkey'}</div>
                            <div style={{ color: 'var(--text-muted)' }}>
                              Created {formatDate(pk.created_at)}
                            </div>
                          </div>
                          <div className="flex gap-2" style={{ alignItems: 'center' }}>
                            <Badge color={pk.is_confirmed ? 'success' : 'warning'}>
                              {pk.is_confirmed ? 'Confirmed' : 'Pending'}
                            </Badge>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ color: 'var(--danger)' }}
                              disabled={deletePasskeyMutation.isPending}
                              onClick={() => deletePasskeyMutation.mutate(pk.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Account security info */}
                {profile && (
                  <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Account Security</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      Auth version {profile.auth_version || 0} ·{' '}
                      Failed logins {profile.failed_login_count || 0}
                      {profile.last_failed_login_at &&
                        ` · Last failed ${formatDate(profile.last_failed_login_at)}`}
                      {profile.locked_until && new Date(profile.locked_until) > new Date() && (
                        <span style={{ color: 'var(--danger)', marginLeft: '0.5rem' }}>
                          · Account temporarily locked
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Sessions ── */}
            {activeTab === 'sessions' && (
              <div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {sessionsLoading
                      ? 'Loading…'
                      : `${sessions.length} session${sessions.length !== 1 ? 's' : ''}`}
                  </div>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ color: 'var(--danger)' }}
                    onClick={() => setRevokeAllConfirm(true)}
                  >
                    Revoke All Others
                  </button>
                </div>

                {sessionsLoading ? (
                  <Spinner center />
                ) : sessions.length === 0 ? (
                  <EmptyState title="No active sessions found" />
                ) : (
                  <div className="flex flex-col gap-3">
                    {sessions.map((s) => {
                      const device =
                        [s.user_agent_device, s.user_agent_browser, s.user_agent_os]
                          .filter(Boolean)
                          .join(' / ') ||
                        s.user_agent ||
                        'Unknown device';
                      const isCurrent = s.is_current;
                      return (
                        <div
                          key={s.id}
                          style={{
                            padding: '1rem',
                            border: `1px solid ${isCurrent ? 'var(--primary)' : 'var(--border)'}`,
                            borderRadius: 8,
                            background: isCurrent ? 'var(--primary-light, #dbeafe)' : '',
                            opacity: s.revoked_at ? 0.55 : 1,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{device}</div>
                              {s.ip_address && (
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                  {s.ip_address}
                                </div>
                              )}
                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
                                {isCurrent
                                  ? 'Current session'
                                  : `Last seen ${s.last_seen_at ? formatDateTime(s.last_seen_at) : '—'}`}
                              </div>
                              {s.revoked_at && (
                                <Badge color="danger" style={{ marginTop: 4 }}>Revoked</Badge>
                              )}
                            </div>
                            {isCurrent ? (
                              <Badge color="primary">This device</Badge>
                            ) : !s.revoked_at ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--danger)' }}
                                disabled={revokeMutation.isPending}
                                onClick={() => revokeMutation.mutate(s.id)}
                              >
                                Revoke
                              </button>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Activity ── */}
            {activeTab === 'activity' && (
              <div>
                <div style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Your recent actions in HanMak
                </div>
                {activityLoading ? (
                  <Spinner center />
                ) : activityEvents.length === 0 ? (
                  <EmptyState title="No recent activity" />
                ) : (
                  <div style={{ fontFamily: 'var(--font-mono)' }}>
                    {activityEvents.map((e, i) => (
                      <div
                        key={e.id || i}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '160px 200px auto 1fr',
                          gap: '0.5rem',
                          padding: '0.5rem 0',
                          borderBottom: '1px solid var(--border)',
                          fontSize: '0.75rem',
                          alignItems: 'start',
                        }}
                      >
                        <span style={{ color: 'var(--text-muted)' }}>
                          {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                        </span>
                        <span>
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.4rem',
                              background: 'var(--bg-secondary)',
                              borderRadius: 4,
                              color: 'var(--primary)',
                            }}
                          >
                            {e.event_type || '—'}
                          </span>
                        </span>
                        <span style={{ color: 'var(--text-muted)' }}>
                          {e.ip_address || '—'}
                        </span>
                        <span>{e.message || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Notifications ── */}
            {activeTab === 'notifications' && (
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
                  Choose how and when you receive notifications.
                </p>
                {notifLoading ? (
                  <Spinner center />
                ) : (
                  <>
                    <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', padding: '0.5rem 0', color: 'var(--text-muted)' }}>
                            Event
                          </th>
                          <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)' }}>
                            Email
                          </th>
                          <th style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--text-muted)' }}>
                            In-App
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {NOTIFICATION_EVENTS.map(({ key, label }) => (
                          <tr key={key} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '0.625rem 0' }}>{label}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={getPrefValue(key, 'email')}
                                onChange={() => togglePref(key, 'email')}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input
                                type="checkbox"
                                checked={getPrefValue(key, 'inApp')}
                                onChange={() => togglePref(key, 'inApp')}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                      <button className="btn btn-primary" onClick={handleSaveNotifications}>
                        Save Preferences
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Change Password ── */}
            {activeTab === 'password' && (
              <div style={{ maxWidth: 420 }}>
                <div className="form-group">
                  <label className="form-label">
                    Current Password <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    className="form-input"
                    type="password"
                    value={pwForm.current_password}
                    onChange={(e) => setPwForm((f) => ({ ...f, current_password: e.target.value }))}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    New Password <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    className="form-input"
                    type="password"
                    value={pwForm.new_password}
                    onChange={(e) => setPwForm((f) => ({ ...f, new_password: e.target.value }))}
                    placeholder="Min 8 characters"
                    autoComplete="new-password"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Confirm New Password <span style={{ color: 'var(--danger)' }}>*</span>
                  </label>
                  <input
                    className="form-input"
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                    placeholder="Repeat new password"
                    autoComplete="new-password"
                    onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
                  />
                </div>
                {pwForm.new_password && pwForm.confirm && pwForm.new_password !== pwForm.confirm && (
                  <div style={{ color: 'var(--danger)', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                    Passwords do not match.
                  </div>
                )}
                <button
                  className="btn btn-primary"
                  disabled={pwMutation.isPending}
                  onClick={handleChangePassword}
                >
                  {pwMutation.isPending ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* TOTP Setup Modal */}
      <Modal
        open={totpModal}
        onClose={() => setTotpModal(false)}
        title="Set Up Authenticator App"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTotpModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleConfirmTotp}>
              Verify &amp; Enable
            </button>
          </>
        }
      >
        {totpSetupData && (
          <div>
            <p style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
              Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password),
              then enter the 6-digit code to verify.
            </p>
            {totpSetupData.qr_data_url && (
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <img
                  src={totpSetupData.qr_data_url}
                  alt="TOTP QR Code"
                  style={{ width: 180, height: 180, borderRadius: 8, imageRendering: 'pixelated' }}
                />
              </div>
            )}
            {totpSetupData.secret && (
              <div
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  padding: '0.75rem',
                  marginBottom: '1rem',
                }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                  Manual entry key
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.875rem',
                    letterSpacing: '0.1em',
                    wordBreak: 'break-all',
                  }}
                >
                  {totpSetupData.secret}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Verification Code</label>
              <input
                className="form-input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirmTotp()}
                style={{
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.3em',
                  fontSize: '1.25rem',
                  textAlign: 'center',
                }}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke All Sessions Confirm */}
      <ConfirmDialog
        open={revokeAllConfirm}
        onClose={() => setRevokeAllConfirm(false)}
        onConfirm={() => revokeAllMutation.mutate()}
        title="Revoke All Other Sessions"
        message="All sessions except this device will be signed out immediately."
        confirmLabel="Revoke All Others"
        danger
        loading={revokeAllMutation.isPending}
      />
    </div>
  );
}
