import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

const PROVIDERS = [
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'postmark', label: 'Postmark' },
  { value: 'ses', label: 'AWS SES' },
  { value: 'smtp', label: 'Custom SMTP' },
];

const SMTP_FIELDS = [
  { id: 'host', label: 'Host', placeholder: 'smtp.sendgrid.net', type: 'text' },
  { id: 'port', label: 'Port', placeholder: '587', type: 'number' },
  { id: 'username', label: 'Username', placeholder: 'apikey', type: 'text' },
];

const DEFAULT_TEMPLATES = [
  'Invitation to Sign',
  'Reminder — Pending Signature',
  'Signature Completed',
  'Approval Requested',
  'Approval Granted/Declined',
  'Envelope Voided',
  'Envelope Expired',
  'Welcome / Onboarding',
];

const TEMPLATE_KINDS = ['invitation', 'envelope_invite', 'reminder', 'completed'];

export default function Email() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('smtp');
  const [provider, setProvider] = useState('sendgrid');
  const [smtpForm, setSmtpForm] = useState({ host: '', port: 587, username: '', password: '', from_email: '', from_name: '', use_tls: true });
  const [testEmailModal, setTestEmailModal] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState('');
  const [testKind, setTestKind] = useState('envelope_invite');
  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({ id: '', organization: '', kind: 'envelope_invite', name: '', subject_template: '', body_template: '', html_template: '', is_active: true });

  const { data: orgsData } = useApiQuery(['organizations'], EP.ORGANIZATIONS);
  const orgId = orgsData?.results?.[0]?.id;

  const { data: emailSettingsData, isLoading: loadingSettings } = useApiQuery(
    ['email-settings', orgId],
    EP.APP_SETTINGS,
    { params: orgId ? { organization: orgId } : {} },
    { enabled: !!orgId }
  );

  const { data: templatesData, isLoading: loadingTemplates, refetch: refetchTemplates } = useApiQuery(
    ['email-templates', orgId],
    EP.EMAIL_TEMPLATES,
    { params: orgId ? { organization: orgId } : {} },
    { enabled: !!orgId }
  );

  const templates = templatesData?.results ?? [];

  useEffect(() => {
    const s = emailSettingsData?.results?.[0] || emailSettingsData;
    if (s) {
      if (s.bounce_provider) setProvider(s.bounce_provider);
      setSmtpForm(f => ({
        ...f,
        from_email: s.from_email || '',
        from_name: s.from_name || '',
      }));
    }
  }, [emailSettingsData]);

  const saveSettingsMutation = useApiMutation(
    (payload) => apiClient.post(EP.APP_SETTINGS, payload),
    { invalidateKeys: ['email-settings'], onSuccess: () => toast.success('Email settings saved'), onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const testMutation = useApiMutation(
    (payload) => apiClient.post(EP.EMAIL_TEMPLATES_TEST, payload),
    { onSuccess: (d) => { toast.success(`Test email sent to ${d.data?.to_email || testEmailTo}`); setTestEmailModal(false); }, onError: (e) => toast.error(e.response?.data?.detail || e.message) }
  );

  const saveTemplateMutation = useApiMutation(
    (payload) => {
      if (payload.id) {
        return apiClient.patch(`${EP.EMAIL_TEMPLATES}${payload.id}/`, payload);
      }
      return apiClient.post(EP.EMAIL_TEMPLATES, payload);
    },
    {
      invalidateKeys: ['email-templates'],
      onSuccess: () => { toast.success('Email template saved'); setTemplateModal(false); refetchTemplates(); },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  function openTemplateEditor(tpl) {
    if (tpl?.id) {
      setTemplateForm({ id: tpl.id, organization: tpl.organization || orgId, kind: tpl.kind || 'envelope_invite', name: tpl.name || '', subject_template: tpl.subject_template || '', body_template: tpl.body_template || '', html_template: tpl.html_template || '', is_active: tpl.is_active !== false });
    } else {
      setTemplateForm({ id: '', organization: orgId, kind: 'envelope_invite', name: tpl?.name || '', subject_template: '', body_template: '', html_template: '', is_active: true });
    }
    setTemplateModal(true);
  }

  function openDefaultTemplateEditor(name) {
    const found = templates.find(t => t.name === name);
    openTemplateEditor(found || { name });
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Email Settings</h1>
          <p className="page-subtitle">Configure SMTP provider and email templates</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => setTestEmailModal(true)}>Send Test Email</button>
          <button className="btn btn-primary" disabled={saveSettingsMutation.isPending} onClick={() => saveSettingsMutation.mutate({ organization: orgId, from_email: smtpForm.from_email, from_name: smtpForm.from_name, bounce_provider: provider })}>
            {saveSettingsMutation.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: 0 }}>
        {[['smtp', 'SMTP Configuration'], ['templates', 'Email Templates'], ['test', 'Test Email']].map(([id, label]) => (
          <button key={id} className={`tab${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>{label}</button>
        ))}
      </div>

      {activeTab === 'smtp' && (
        <div className="flex flex-col gap-4">
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Email Provider</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {PROVIDERS.map(p => (
                <div key={p.value} onClick={() => setProvider(p.value)} style={{ padding: '0.875rem', border: `2px solid ${provider === p.value ? 'var(--primary)' : 'var(--border)'}`, borderRadius: 8, textAlign: 'center', cursor: 'pointer', background: provider === p.value ? 'var(--primary-light, #dbeafe)' : '' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{p.label}</div>
                  {provider === p.value && <Badge color="primary" style={{ fontSize: '0.7rem', marginTop: 4 }}>Active</Badge>}
                </div>
              ))}
            </div>

            {SMTP_FIELDS.map(field => (
              <div key={field.id} className="form-group">
                <label className="form-label">{field.label}</label>
                <input className="form-input" type={field.type} placeholder={field.placeholder} value={smtpForm[field.id] || ''} onChange={e => setSmtpForm(f => ({ ...f, [field.id]: field.type === 'number' ? Number(e.target.value) : e.target.value }))} />
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">Password / API Key</label>
              <input className="form-input" type="password" placeholder="••••••••••••" value={smtpForm.password || ''} onChange={e => setSmtpForm(f => ({ ...f, password: e.target.value }))} style={{ fontFamily: 'var(--font-mono)' }} />
            </div>
            <div className="form-group"><label className="form-label">From Name</label><input className="form-input" value={smtpForm.from_name} onChange={e => setSmtpForm(f => ({ ...f, from_name: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">From Email</label><input className="form-input" type="email" value={smtpForm.from_email} onChange={e => setSmtpForm(f => ({ ...f, from_email: e.target.value }))} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <input type="checkbox" id="use-tls" checked={!!smtpForm.use_tls} onChange={e => setSmtpForm(f => ({ ...f, use_tls: e.target.checked }))} />
              <label htmlFor="use-tls">Enable TLS</label>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'templates' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Email Templates</h3>
          {loadingTemplates ? <Spinner center /> : (
            <div className="flex flex-col gap-2">
              {templates.length > 0 ? templates.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 7 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t.kind} · {t.subject_template}</div>
                  </div>
                  <Badge color={t.is_active ? 'success' : 'secondary'}>{t.is_active ? 'Active' : 'Inactive'}</Badge>
                  <button className="btn btn-ghost btn-sm" onClick={() => openTemplateEditor(t)}>Edit</button>
                </div>
              )) : DEFAULT_TEMPLATES.map(name => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 7 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{name}</div>
                  </div>
                  <Badge color="success">Default</Badge>
                  <button className="btn btn-ghost btn-sm" onClick={() => openDefaultTemplateEditor(name)}>Edit</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'test' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem' }}>Test Email</h3>
          <div className="form-group"><label className="form-label">Send to</label><input className="form-input" type="email" placeholder="admin@yourorg.com" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} /></div>
          <div className="form-group">
            <label className="form-label">Template</label>
            <select className="form-input" value={testKind} onChange={e => setTestKind(e.target.value)}>
              <option value="envelope_invite">Invitation to Sign</option>
              <option value="reminder">Reminder</option>
              <option value="completed">Completion</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={testMutation.isPending} onClick={() => {
            if (!testEmailTo) return toast.error('Enter a recipient email');
            testMutation.mutate({ organization: orgId, to_email: testEmailTo, kind: testKind });
          }}>{testMutation.isPending ? 'Sending…' : 'Send Test'}</button>
        </div>
      )}

      {/* Test Email Modal */}
      <Modal open={testEmailModal} onClose={() => setTestEmailModal(false)} title="Send Test Email" size="sm"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setTestEmailModal(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={testMutation.isPending} onClick={() => {
            if (!testEmailTo) return toast.error('Enter a recipient email');
            testMutation.mutate({ organization: orgId, to_email: testEmailTo, kind: testKind });
          }}>Send Test</button>
        </>}>
        <div className="form-group"><label className="form-label">Send to</label><input className="form-input" type="email" value={testEmailTo} onChange={e => setTestEmailTo(e.target.value)} /></div>
        <div className="form-group">
          <label className="form-label">Template</label>
          <select className="form-input" value={testKind} onChange={e => setTestKind(e.target.value)}>
            <option value="envelope_invite">Invitation to Sign</option>
            <option value="reminder">Reminder</option>
            <option value="completed">Completion</option>
          </select>
        </div>
      </Modal>

      {/* Template Edit Modal */}
      <Modal open={templateModal} onClose={() => setTemplateModal(false)} title="Edit Email Template" size="lg"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setTemplateModal(false)}>Cancel</button>
          <button className="btn btn-primary" disabled={saveTemplateMutation.isPending} onClick={() => saveTemplateMutation.mutate(templateForm)}>Save Template</button>
        </>}>
        <div className="form-group">
          <label className="form-label">Kind</label>
          <select className="form-input" value={templateForm.kind} onChange={e => setTemplateForm(f => ({ ...f, kind: e.target.value }))}>
            {TEMPLATE_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={templateForm.name} onChange={e => setTemplateForm(f => ({ ...f, name: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Subject</label><input className="form-input" value={templateForm.subject_template} onChange={e => setTemplateForm(f => ({ ...f, subject_template: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">Text Body</label><textarea className="form-input" rows={6} value={templateForm.body_template} onChange={e => setTemplateForm(f => ({ ...f, body_template: e.target.value }))} /></div>
        <div className="form-group"><label className="form-label">HTML Body</label><textarea className="form-input" rows={5} value={templateForm.html_template} onChange={e => setTemplateForm(f => ({ ...f, html_template: e.target.value }))} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={templateForm.is_active} onChange={e => setTemplateForm(f => ({ ...f, is_active: e.target.checked }))} /> Active
        </label>
      </Modal>
    </div>
  );
}
