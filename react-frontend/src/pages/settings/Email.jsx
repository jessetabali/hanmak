import { useState, useEffect } from 'react';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { apiClient } from '../../api/client';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';
import Modal from '../../components/ui/Modal';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const PROVIDERS = [
  { value: 'sendgrid', label: 'SendGrid' },
  { value: 'mailhog', label: 'MailHog' },
  { value: 'smtp', label: 'Custom SMTP' },
  { value: 'ses', label: 'AWS SES' },
  { value: 'postmark', label: 'Postmark' },
];

const DEFAULT_SMTP = {
  provider: 'sendgrid',
  host: '',
  port: 587,
  username: '',
  password: '',
  from_email: '',
  from_name: '',
  use_tls: true,
};

const TABS = [
  { id: 'smtp', label: 'SMTP Configuration' },
  { id: 'templates', label: 'Email Templates' },
  { id: 'test', label: 'Test Email' },
];

export default function Email() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('smtp');
  const [smtpForm, setSmtpForm] = useState({ ...DEFAULT_SMTP });
  const [testEmail, setTestEmail] = useState('');
  const [testResult, setTestResult] = useState(null); // { type: 'success'|'error', message }
  const [templateModal, setTemplateModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState(null);
  const [editForm, setEditForm] = useState({ subject: '', body_html: '' });

  const { data: smtpData } = useApiQuery(
    ['smtp-settings'],
    EP.APP_SETTINGS,
    { namespace: 'email', key: 'smtp' }
  );

  const { data: templatesData, refetch: refetchTemplates } = useApiQuery(
    ['email-templates'],
    EP.EMAIL_TEMPLATES
  );

  const templates = templatesData?.results ?? templatesData ?? [];

  useEffect(() => {
    const val = smtpData?.value || smtpData;
    if (val && typeof val === 'object') {
      setSmtpForm((prev) => ({ ...prev, ...val }));
    }
  }, [smtpData]);

  const setSmtp = (key, value) => setSmtpForm((prev) => ({ ...prev, [key]: value }));

  const saveSmtpMutation = useApiMutation(
    (payload) => apiClient.post(EP.APP_SETTINGS, payload),
    {
      invalidateKeys: ['smtp-settings'],
      onSuccess: () => toast.success('SMTP settings saved'),
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const saveTemplateMutation = useApiMutation(
    ({ id, ...payload }) =>
      id
        ? apiClient.patch(`${EP.EMAIL_TEMPLATES}${id}/`, payload)
        : apiClient.post(EP.EMAIL_TEMPLATES, payload),
    {
      invalidateKeys: ['email-templates'],
      onSuccess: () => {
        toast.success('Email template saved');
        setTemplateModal(false);
        refetchTemplates();
      },
      onError: (e) => toast.error(e.response?.data?.detail || e.message),
    }
  );

  const testMutation = useApiMutation(
    (payload) => apiClient.post(EP.EMAIL_TEMPLATES_TEST, payload),
    {
      onSuccess: () => {
        setTestResult({ type: 'success', message: `Test email sent to ${testEmail}` });
        toast.success(`Test email sent to ${testEmail}`);
      },
      onError: (e) => {
        const msg = e.response?.data?.detail || e.message;
        setTestResult({ type: 'error', message: msg });
        toast.error(msg);
      },
    }
  );

  function openEditModal(template) {
    setEditTemplate(template);
    setEditForm({
      subject: template.subject_template || template.subject || '',
      body_html: template.html_template || template.body_html || '',
    });
    setTemplateModal(true);
  }

  function handleSaveTemplate() {
    saveTemplateMutation.mutate({
      id: editTemplate?.id,
      subject: editForm.subject,
      body_html: editForm.body_html,
      subject_template: editForm.subject,
      html_template: editForm.body_html,
    });
  }

  function handleSendTest() {
    if (!testEmail.trim()) {
      toast.error('Enter a recipient email address');
      return;
    }
    setTestResult(null);
    testMutation.mutate({ to: testEmail.trim() });
  }

  const templateList = Array.isArray(templates) ? templates : [];

  return (
    <div>
      {/* Tabs */}
      <div
        className="tabs"
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid var(--border)',
          marginBottom: '1.25rem',
        }}
      >
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            className={`tab${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* SMTP Configuration tab */}
      {activeTab === 'smtp' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>SMTP Configuration</h3>
            <button
              className="btn btn-primary"
              disabled={saveSmtpMutation.isPending}
              onClick={() =>
                saveSmtpMutation.mutate({
                  namespace: 'email',
                  key: 'smtp',
                  value: smtpForm,
                })
              }
            >
              {saveSmtpMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>

          <div className="form-group">
            <label className="form-label">Provider</label>
            <select
              className="form-input"
              value={smtpForm.provider}
              onChange={(e) => setSmtp('provider', e.target.value)}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Host</label>
              <input
                className="form-input"
                type="text"
                value={smtpForm.host}
                placeholder="smtp.sendgrid.net"
                onChange={(e) => setSmtp('host', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input
                className="form-input"
                type="number"
                value={smtpForm.port}
                onChange={(e) => setSmtp('port', Number(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                value={smtpForm.username}
                placeholder="apikey"
                onChange={(e) => setSmtp('username', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={smtpForm.password}
                placeholder="••••••••••••"
                onChange={(e) => setSmtp('password', e.target.value)}
                style={{ fontFamily: 'var(--font-mono)' }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">From Email</label>
              <input
                className="form-input"
                type="email"
                value={smtpForm.from_email}
                placeholder="no-reply@yourorg.com"
                onChange={(e) => setSmtp('from_email', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">From Name</label>
              <input
                className="form-input"
                type="text"
                value={smtpForm.from_name}
                placeholder="Acme Corp Documents"
                onChange={(e) => setSmtp('from_name', e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            <input
              id="smtp-use-tls"
              type="checkbox"
              checked={!!smtpForm.use_tls}
              onChange={(e) => setSmtp('use_tls', e.target.checked)}
            />
            <label htmlFor="smtp-use-tls">Enable TLS / SSL</label>
          </div>
        </div>
      )}

      {/* Email Templates tab */}
      {activeTab === 'templates' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', marginTop: 0 }}>Email Templates</h3>

          {templateList.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '1rem 0' }}>
              No email templates found. Create one below or configure your SMTP provider first.
            </div>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Template Name</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Subject</th>
                  <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>Last Modified</th>
                  <th style={{ width: 80, padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {templateList.map((t) => (
                  <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem', color: 'var(--text-muted)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.subject_template || t.subject || '—'}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {t.updated_at
                        ? new Date(t.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditModal(t)}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Test Email tab */}
      {activeTab === 'test' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', marginTop: 0 }}>Test Email</h3>

          <div className="form-group">
            <label className="form-label">Recipient Email</label>
            <input
              className="form-input"
              type="email"
              value={testEmail}
              placeholder="admin@yourorg.com"
              onChange={(e) => { setTestEmail(e.target.value); setTestResult(null); }}
            />
          </div>

          <button
            className="btn btn-primary"
            disabled={testMutation.isPending}
            onClick={handleSendTest}
          >
            {testMutation.isPending ? 'Sending…' : 'Send Test Email'}
          </button>

          {testResult && (
            <div
              className={`alert${testResult.type === 'error' ? '' : ' alert-info'}`}
              style={{
                marginTop: '1rem',
                padding: '0.75rem 1rem',
                borderRadius: 6,
                fontSize: '0.875rem',
                background: testResult.type === 'error' ? 'var(--danger-light, #fee2e2)' : 'var(--info-light, #dbeafe)',
                color: testResult.type === 'error' ? 'var(--danger)' : 'var(--info)',
                border: `1px solid ${testResult.type === 'error' ? 'var(--danger)' : 'var(--info)'}`,
              }}
            >
              {testResult.message}
            </div>
          )}
        </div>
      )}

      {/* Template Edit Modal */}
      <Modal
        open={templateModal}
        onClose={() => setTemplateModal(false)}
        title={editTemplate ? `Edit: ${editTemplate.name}` : 'Edit Email Template'}
        size="lg"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setTemplateModal(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={saveTemplateMutation.isPending}
              onClick={handleSaveTemplate}
            >
              {saveTemplateMutation.isPending ? 'Saving…' : 'Save Template'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Subject</label>
          <input
            className="form-input"
            value={editForm.subject}
            onChange={(e) => setEditForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Subject line"
          />
        </div>
        <div className="form-group">
          <label className="form-label">HTML Body</label>
          <textarea
            className="form-input"
            value={editForm.body_html}
            onChange={(e) => setEditForm((f) => ({ ...f, body_html: e.target.value }))}
            style={{ height: 300, fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', resize: 'vertical' }}
            placeholder="<p>Hello {{ recipient_name }},</p>"
          />
        </div>
      </Modal>
    </div>
  );
}
