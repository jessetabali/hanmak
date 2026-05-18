import { useState } from 'react';
import { useApiQuery } from '../../hooks/useApi';
import { EP } from '../../api/endpoints';
import { useToast } from '../../hooks/useToast';

const SECTIONS = [
  { id: 'auth-section', label: 'Authentication', group: 'start' },
  { id: 'rate-section', label: 'Rate Limiting', group: 'start' },
  { id: 'errors-section', label: 'Errors & Status Codes', group: 'start' },
  { id: 'pagination-section', label: 'Pagination', group: 'start' },
  { id: 'env-section', label: 'Envelopes', group: 'endpoints' },
  { id: 'tpl-section', label: 'Templates', group: 'endpoints' },
  { id: 'sig-section', label: 'Signatures', group: 'endpoints' },
  { id: 'wh-section', label: 'Webhooks', group: 'endpoints' },
  { id: 'usr-section', label: 'Users', group: 'endpoints' },
  { id: 'audit-section', label: 'Audit Trail', group: 'endpoints' },
  { id: 'files-section', label: 'Files', group: 'endpoints' },
];

const METHOD_COLORS = {
  GET: '#2563eb',
  POST: '#16a34a',
  PATCH: '#d97706',
  DELETE: '#dc2626',
  PUT: '#7c3aed',
};

function MethodBadge({ method }) {
  return (
    <span
      style={{
        background: METHOD_COLORS[method] || '#2563eb',
        color: '#fff',
        padding: '2px 10px',
        borderRadius: 4,
        fontSize: '0.7rem',
        fontWeight: 700,
        fontFamily: 'monospace',
        minWidth: 56,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {method}
    </span>
  );
}

function EndpointBlock({ method, path, title, params = [], responseBody }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.875rem 1rem', background: 'var(--bg-secondary)', cursor: 'pointer' }}
        onClick={() => setOpen((p) => !p)}
      >
        <MethodBadge method={method} />
        <code className="mono" style={{ flex: 1, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{path}</code>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{title}</span>
        <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div style={{ padding: '1rem' }}>
          {params.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Parameters</div>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)' }}>Name</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {params.map((p) => (
                    <tr key={p.name} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '6px 8px', color: 'var(--primary)', fontFamily: 'var(--font-mono)' }}>{p.name}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{p.type}</td>
                      <td style={{ padding: '6px 8px' }}>{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {responseBody && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Response</div>
              <pre
                className="mono"
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  padding: '0.875rem',
                  fontSize: '0.75rem',
                  whiteSpace: 'pre',
                  overflowX: 'auto',
                  color: 'var(--text-secondary)',
                  margin: 0,
                }}
              >
                {responseBody}
              </pre>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginTop: '0.5rem' }}
                onClick={() => { navigator.clipboard.writeText(responseBody); toast.success('Copied!'); }}
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiDocs() {
  const [activeSection, setActiveSection] = useState('auth-section');
  const { data: keysData } = useApiQuery(['api-keys-docs'], EP.API_KEYS, { page_size: 1 }, { retry: false });
  const firstKey = keysData?.results?.[0] ?? keysData?.[0];
  const exampleToken = firstKey
    ? `${firstKey.key_prefix || firstKey.prefix || 'hm_live'}••••••••`
    : 'hm_••••••••';

  const scrollTo = (id) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const BASE_URL = 'http://127.0.0.1:8003/api/v1/';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Reference</h1>
          <p className="page-subtitle">
            REST API v1 — Base URL:{' '}
            <code className="mono" style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
              {BASE_URL}
            </code>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={() => window.open('/api/v1/schema/', '_blank')}>
            OpenAPI 3.0
          </button>
          <button className="btn btn-primary" onClick={() => window.open('/api/v1/docs/', '_blank')}>
            OpenAPI UI ↗
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Sidebar */}
        <div className="card" style={{ padding: '1rem', position: 'sticky', top: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Getting Started
          </div>
          {SECTIONS.filter((s) => s.group === 'start').map((s) => (
            <div
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                padding: '0.375rem 0.5rem',
                borderRadius: '5px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                color: activeSection === s.id ? 'var(--primary)' : 'var(--text-secondary)',
                background: activeSection === s.id ? 'var(--bg-secondary)' : '',
                fontWeight: activeSection === s.id ? 600 : 400,
              }}
              onMouseEnter={(e) => { if (activeSection !== s.id) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { if (activeSection !== s.id) e.currentTarget.style.background = ''; }}
            >
              {s.label}
            </div>
          ))}
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0.75rem 0 0.5rem' }}>
            Endpoints
          </div>
          {SECTIONS.filter((s) => s.group === 'endpoints').map((s) => (
            <div
              key={s.id}
              onClick={() => scrollTo(s.id)}
              style={{
                padding: '0.375rem 0.5rem',
                borderRadius: '5px',
                fontSize: '0.8125rem',
                cursor: 'pointer',
                color: activeSection === s.id ? 'var(--primary)' : 'var(--text-secondary)',
                background: activeSection === s.id ? 'var(--bg-secondary)' : '',
                fontWeight: activeSection === s.id ? 600 : 400,
              }}
              onMouseEnter={(e) => { if (activeSection !== s.id) e.currentTarget.style.background = 'var(--bg-secondary)'; }}
              onMouseLeave={(e) => { if (activeSection !== s.id) e.currentTarget.style.background = ''; }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex flex-col gap-4">
          {/* Authentication */}
          <div className="card" id="auth-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.25rem' }}>Authentication</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Include <code className="mono">Authorization: Bearer &lt;token&gt;</code> in all API requests.
              Your API key is used as the bearer token. Base URL:{' '}
              <code className="mono" style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 4 }}>{BASE_URL}</code>
            </p>
            <pre
              className="mono"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', fontSize: '0.8125rem', marginBottom: '1rem', margin: '0 0 1rem 0' }}
            >
              <span style={{ color: 'var(--text-muted)' }}># Example request{'\n'}</span>
              {`curl -X GET ${BASE_URL}envelopes/ \\\n`}
              <span style={{ color: 'var(--success)' }}>{`     -H "Authorization: Bearer ${exampleToken}" \\\n`}</span>
              <span style={{ color: 'var(--success)' }}>{`     -H "Content-Type: application/json"`}</span>
            </pre>
            {firstKey && (
              <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.75rem', fontSize: '0.8125rem', marginBottom: '1rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Your key (masked): </span>
                <code className="mono">Authorization: Bearer {exampleToken}</code>
              </div>
            )}
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {['Bearer Token (hm_live_...)', 'API Key (hm_test_...)', 'OAuth 2.0'].map((m) => (
                <span key={m} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{m}</span>
              ))}
            </div>
          </div>

          {/* Rate Limiting */}
          <div className="card" id="rate-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Rate Limiting</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              API keys are rate-limited per organization. Responses include headers so clients can self-throttle.
            </p>
            <table className="table" style={{ marginBottom: '1rem' }}>
              <thead>
                <tr><th>Header</th><th>Description</th></tr>
              </thead>
              <tbody>
                {[
                  ['X-RateLimit-Limit', 'Total requests allowed in the current window.'],
                  ['X-RateLimit-Remaining', 'Requests left before throttling begins.'],
                  ['X-RateLimit-Reset', 'Unix timestamp when the window resets.'],
                  ['Retry-After', 'Seconds to wait after a 429 response.'],
                ].map(([h, d]) => (
                  <tr key={h}>
                    <td><code className="mono">{h}</code></td>
                    <td style={{ fontSize: '0.875rem' }}>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Limits by plan</div>
            <table className="table">
              <thead><tr><th>Plan</th><th>Requests / minute</th></tr></thead>
              <tbody>
                {[['Community', '60'], ['Pro', '300'], ['Enterprise', '1,000+']].map(([tier, rps]) => (
                  <tr key={tier}><td>{tier}</td><td className="mono">{rps}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Errors */}
          <div className="card" id="errors-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Errors & Status Codes</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Errors return JSON with a human-readable <code className="mono">detail</code> field and optional field-level validation messages.
            </p>
            <pre
              className="mono"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.875rem', fontSize: '0.75rem', overflowX: 'auto', marginBottom: '1rem', margin: '0 0 1rem 0' }}
            >
              {`{\n  "detail": "Authentication credentials were not provided.",\n  "code": "not_authenticated"\n}`}
            </pre>
            <table className="table">
              <thead><tr><th>Status</th><th>Meaning</th><th>Example scenario</th></tr></thead>
              <tbody>
                {[
                  [400, 'Bad Request', 'Validation error or missing required field'],
                  [401, 'Unauthorized', 'Missing or invalid Bearer token'],
                  [403, 'Forbidden', 'Authenticated but lacks permission for this resource'],
                  [404, 'Not Found', 'Resource does not exist or is not visible'],
                  [409, 'Conflict', 'State conflict — envelope already completed or voided'],
                  [429, 'Rate Limited', 'Too many requests in the current window'],
                  [500, 'Server Error', 'Unexpected internal error — contact support'],
                ].map(([code, meaning, scenario]) => (
                  <tr key={code}>
                    <td><code className="mono">{code}</code></td>
                    <td style={{ fontWeight: 500 }}>{meaning}</td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{scenario}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="card" id="pagination-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Pagination</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              List endpoints use page-based pagination. Use <code className="mono">page</code> and <code className="mono">page_size</code> query parameters.
              The response includes <code className="mono">count</code>, <code className="mono">next</code>, <code className="mono">previous</code>, and <code className="mono">results</code>.
            </p>
            <pre
              className="mono"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem', fontSize: '0.8125rem', whiteSpace: 'pre', overflowX: 'auto', margin: 0 }}
            >
              {`{
  "count": 143,
  "next": "${BASE_URL}envelopes/?page=2",
  "previous": null,
  "results": [
    { "id": 1, "name": "Q4 Contract", "status": "completed" }
  ]
}`}
            </pre>
          </div>

          {/* Envelopes */}
          <div className="card" id="env-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Envelopes</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Envelopes are the primary signing unit — a collection of documents sent to one or more recipients for signature.
            </p>
            <EndpointBlock
              method="GET"
              path="/envelopes/"
              title="List all envelopes"
              params={[
                { name: 'status', type: 'string', desc: 'Filter: draft, sent, completed, voided' },
                { name: 'page_size', type: 'integer', desc: 'Results per page (default 20, max 100)' },
                { name: 'from_date', type: 'string', desc: 'ISO 8601 created_at filter' },
              ]}
              responseBody={`{
  "count": 1284,
  "next": "${BASE_URL}envelopes/?page=2",
  "results": [
    {
      "id": "ENV-2024-0891",
      "name": "Q4 Vendor Contract",
      "status": "partially_signed",
      "created_at": "2026-05-01T13:54:58Z",
      "recipients": [{ "id": 1, "name": "Sarah Chen", "role": "signer", "status": "signed" }]
    }
  ]
}`}
            />
            <EndpointBlock
              method="POST"
              path="/envelopes/"
              title="Create a new envelope"
              params={[
                { name: 'name', type: 'string', desc: 'Envelope display name (required)' },
                { name: 'template_id', type: 'integer', desc: 'Template to use (optional)' },
                { name: 'recipients', type: 'array', desc: 'Array of recipient objects' },
                { name: 'message', type: 'string', desc: 'Message shown to signers' },
                { name: 'expires_at', type: 'string', desc: 'ISO 8601 expiration timestamp' },
              ]}
              responseBody={`{ "id": "ENV-2024-0892", "name": "Partnership NDA", "status": "draft", "signing_url": "https://sign.hanmak.io/s/abc123" }`}
            />
            <EndpointBlock method="GET" path="/envelopes/{id}/" title="Get envelope details" responseBody={`{ "id": "ENV-2024-0891", "status": "completed", "recipients": [...], "documents": [...] }`} />
            <EndpointBlock
              method="PATCH"
              path="/envelopes/{id}/"
              title="Update envelope"
              params={[
                { name: 'name', type: 'string', desc: 'New envelope name' },
                { name: 'expires_at', type: 'string', desc: 'New expiration timestamp' },
              ]}
            />
            <EndpointBlock
              method="POST"
              path="/envelopes/{id}/void/"
              title="Void an envelope"
              params={[{ name: 'reason', type: 'string', desc: 'Void reason (required)' }]}
              responseBody={`{ "status": "voided", "voided_at": "2026-05-10T09:00:00Z" }`}
            />
            <EndpointBlock method="GET" path="/envelopes/{id}/download/" title="Download signed PDF" responseBody="Binary PDF stream" />
          </div>

          {/* Templates */}
          <div className="card" id="tpl-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Templates</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Templates define reusable document layouts with pre-positioned form fields and signing roles.
            </p>
            <EndpointBlock
              method="GET"
              path="/templates/"
              title="List templates"
              params={[
                { name: 'search', type: 'string', desc: 'Filter by name or description' },
                { name: 'organization', type: 'integer', desc: 'Organization ID filter' },
              ]}
              responseBody={`{ "count": 2, "results": [{ "id": 12, "name": "Vendor Agreement", "status": "active" }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/templates/"
              title="Create template"
              params={[
                { name: 'name', type: 'string', desc: 'Template name (required)' },
                { name: 'description', type: 'string', desc: 'Optional description' },
                { name: 'organization', type: 'integer', desc: 'Organization ID (required)' },
              ]}
              responseBody={`{ "id": 12, "name": "Vendor Agreement", "status": "draft" }`}
            />
            <EndpointBlock method="POST" path="/templates/{id}/duplicate/" title="Duplicate template" responseBody={`{ "id": 13, "name": "Vendor Agreement Copy" }`} />
            <EndpointBlock method="POST" path="/templates/{id}/archive/" title="Archive template" responseBody={`{ "status": "archived" }`} />
          </div>

          {/* Signatures */}
          <div className="card" id="sig-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Signatures</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Public endpoints for the signing session flow. These are called from the signer's browser using the token embedded in the signing link.
            </p>
            <EndpointBlock
              method="GET"
              path="/sign/{token}/"
              title="Open signer session"
              responseBody={`{ "envelope": 5, "recipient": { "name": "Ada Lovelace" }, "fields": [] }`}
            />
            <EndpointBlock
              method="POST"
              path="/sign/{token}/submit/"
              title="Submit signed field values"
              params={[
                { name: 'field_values', type: 'array', desc: 'Field values keyed by field_key' },
                { name: 'consent_accepted', type: 'boolean', desc: 'Electronic signature consent flag' },
              ]}
              responseBody={`{ "status": "signed", "completed": true }`}
            />
            <EndpointBlock
              method="POST"
              path="/sign/{token}/decline/"
              title="Decline signing"
              params={[{ name: 'reason', type: 'string', desc: 'Decline reason (optional)' }]}
              responseBody={`{ "status": "declined" }`}
            />
            <EndpointBlock
              method="POST"
              path="/recipients/{id}/delegate/"
              title="Delegate to another signer"
              params={[
                { name: 'name', type: 'string', desc: 'Delegate full name (required)' },
                { name: 'email', type: 'string', desc: 'Delegate email (required)' },
                { name: 'reason', type: 'string', desc: 'Optional reason' },
              ]}
              responseBody={`{ "id": 32, "status": "sent", "delegated_from": 31 }`}
            />
          </div>

          {/* Webhooks */}
          <div className="card" id="wh-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Webhooks</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              HanMak sends HTTP POST requests to your configured endpoints when events occur. Each delivery includes a
              {' '}<code className="mono">X-HanMak-Signature</code> HMAC header for verification.
            </p>
            <EndpointBlock
              method="GET"
              path="/webhook-endpoints/"
              title="List webhook endpoints"
              responseBody={`{ "count": 2, "results": [{ "id": 1, "target_url": "https://example.com/hook", "is_active": true }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/webhook-endpoints/"
              title="Create endpoint"
              params={[
                { name: 'target_url', type: 'string', desc: 'HTTPS endpoint URL (required)' },
                { name: 'events', type: 'array', desc: 'Event types to subscribe to' },
                { name: 'is_active', type: 'boolean', desc: 'Enable immediately (default true)' },
              ]}
              responseBody={`{ "id": 3, "target_url": "https://example.com/hook", "signing_secret": "whsec_abc123" }`}
            />
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Webhook Event Types</div>
              <table className="table">
                <thead><tr><th>Event</th><th>Description</th><th>Payload includes</th></tr></thead>
                <tbody>
                  {[
                    ['envelope.sent', 'Envelope dispatched to recipients', 'envelope object'],
                    ['envelope.viewed', 'Recipient opened signing session', 'envelope + recipient'],
                    ['envelope.completed', 'All parties signed', 'envelope + documents'],
                    ['envelope.voided', 'Envelope voided', 'envelope + reason'],
                    ['envelope.expired', 'Envelope passed expiration', 'envelope'],
                    ['signature.applied', 'A signature was placed', 'envelope + signature'],
                    ['approval.granted', 'Approval was granted', 'envelope + approver'],
                    ['approval.declined', 'Approval was declined', 'envelope + reason'],
                    ['user.created', 'New user added to org', 'user object'],
                    ['template.updated', 'Template version bumped', 'template object'],
                  ].map(([ev, desc, payload]) => (
                    <tr key={ev}>
                      <td><code className="mono" style={{ fontSize: '0.75rem' }}>{ev}</code></td>
                      <td style={{ fontSize: '0.8125rem' }}>{desc}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{payload}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Users */}
          <div className="card" id="usr-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Users</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Manage user accounts and memberships within your organization.
            </p>
            <EndpointBlock
              method="GET"
              path="/users/"
              title="List visible users"
              params={[{ name: 'organization', type: 'integer', desc: 'Optional organization filter' }]}
              responseBody={`{ "count": 1, "results": [{ "id": 7, "email": "user@example.com", "is_active": true }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/users/create_managed/"
              title="Create managed user"
              params={[
                { name: 'organization', type: 'integer', desc: 'Target organization ID (required)' },
                { name: 'email', type: 'string', desc: 'User email (required)' },
                { name: 'setup_mode', type: 'string', desc: 'setup_email or temporary_password' },
              ]}
              responseBody={`{ "id": 7, "queued_email": 19 }`}
            />
            <EndpointBlock method="POST" path="/users/{id}/reset_password/" title="Force password reset" responseBody={`{ "ok": true, "queued_email": 20 }`} />
            <EndpointBlock method="POST" path="/users/{id}/suspend/" title="Suspend user" responseBody={`{ "is_active": false }`} />
          </div>

          {/* Audit Trail */}
          <div className="card" id="audit-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Audit Trail</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Immutable log of all organization events. Events are append-only and cannot be modified or deleted.
            </p>
            <EndpointBlock
              method="GET"
              path="/audit-events/"
              title="List audit events"
              params={[
                { name: 'event_type', type: 'string', desc: 'Filter by event prefix (e.g. envelope.)' },
                { name: 'created_after', type: 'string', desc: 'ISO 8601 timestamp lower bound' },
                { name: 'organization', type: 'integer', desc: 'Organization ID filter' },
              ]}
              responseBody={`{ "count": 25, "results": [{ "event_type": "envelope.sent", "actor_username": "admin@co.com", "created_at": "2026-05-16T00:00:00Z" }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/evidence-bundles/"
              title="Create evidence bundle"
              params={[{ name: 'envelope', type: 'integer', desc: 'Completed envelope ID (required)' }]}
              responseBody={`{ "id": 10, "status": "ready", "manifest_sha256": "abc123..." }`}
            />
            <EndpointBlock method="POST" path="/evidence-bundles/{id}/generate-signed-pdf/" title="Generate signed PDF evidence" responseBody={`{ "pdf_url": "/media/evidence/bundle_10.pdf" }`} />
          </div>

          {/* Files */}
          <div className="card" id="files-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>Files</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Manage the document file library — upload PDFs and images to be used as envelope documents or template sources.
            </p>
            <EndpointBlock
              method="GET"
              path="/documents/"
              title="List documents"
              params={[
                { name: 'search', type: 'string', desc: 'Filename/title search' },
                { name: 'organization', type: 'integer', desc: 'Organization ID filter' },
              ]}
              responseBody={`{ "count": 3, "results": [{ "id": 4, "title": "Agreement.pdf", "page_count": 2 }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/documents/"
              title="Upload document"
              params={[
                { name: 'file', type: 'file', desc: 'PDF or image file (multipart/form-data)' },
                { name: 'organization', type: 'integer', desc: 'Organization ID (required)' },
              ]}
              responseBody={`{ "id": 4, "status": "processed", "page_count": 5 }`}
            />
            <EndpointBlock method="POST" path="/documents/{id}/render_pages/" title="Render page previews" responseBody={`{ "pages": [{ "page_number": 1, "image_url": "/media/..." }] }`} />
            <EndpointBlock method="DELETE" path="/documents/{id}/" title="Delete document" responseBody="{}" />
          </div>
        </div>
      </div>
    </div>
  );
}
