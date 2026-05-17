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

function MethodBadge({ method }) {
  const colors = { GET: 'var(--primary)', POST: 'var(--success)', PATCH: 'var(--warning)', PUT: 'var(--warning)', DELETE: 'var(--danger)' };
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 10px',
        borderRadius: '4px',
        fontSize: '0.75rem',
        fontWeight: 700,
        minWidth: '56px',
        color: '#fff',
        background: colors[method] || 'var(--primary)',
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
        <code className="mono" style={{ flex: 1, fontSize: '0.875rem' }}>{path}</code>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{title}</span>
        <span style={{ color: 'var(--text-muted)' }}>{open ? '▴' : '▾'}</span>
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
              <div className="mono" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0.875rem', fontSize: '0.75rem', whiteSpace: 'pre', overflowX: 'auto', color: 'var(--text-secondary)' }}>
                {responseBody}
              </div>
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
  const toast = useToast();
  const { data: keysData } = useApiQuery(['api-keys-docs'], EP.API_KEYS, { page_size: 1 });
  const firstKey = keysData?.results?.[0] || keysData?.[0];
  const exampleToken = firstKey
    ? (firstKey.key_prefix || firstKey.prefix || 'sk_live') + '••••••••••••••••••••'
    : 'sk_live_••••••••';

  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">API Reference</h1>
          <p className="page-subtitle">
            REST API v1 — Base URL:{' '}
            <code className="mono" style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px' }}>
              https://api.hanmak.io/v1
            </code>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => window.open('/api/v1/docs/', '_blank')}>
            OpenAPI UI ↗
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Sidebar */}
        <div className="card" style={{ padding: '1rem', position: 'sticky', top: '1rem' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Getting Started
          </div>
          {SECTIONS.filter((s) => s.group === 'start').map((s) => (
            <div
              key={s.id}
              style={{ padding: '0.375rem 0.5rem', borderRadius: '5px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              onClick={() => scrollTo(s.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
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
              style={{ padding: '0.375rem 0.5rem', borderRadius: '5px', fontSize: '0.8125rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
              onClick={() => scrollTo(s.id)}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
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
              All API requests must include your API key in the <code className="mono">Authorization</code> header as a Bearer token.
            </p>
            <div className="mono" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '1rem', fontSize: '0.8125rem', marginBottom: '1rem' }}>
              <div style={{ color: 'var(--text-muted)', marginBottom: '4px' }}># Example request</div>
              <div>curl -X GET https://api.hanmak.io/v1/envelopes \</div>
              <div style={{ paddingLeft: '1.5rem', color: 'var(--success)' }}>-H "Authorization: Bearer {exampleToken}" \</div>
              <div style={{ paddingLeft: '1.5rem', color: 'var(--success)' }}>-H "Content-Type: application/json"</div>
            </div>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {['Bearer Token (sk_live_...)', 'API Key (sk_test_...)', 'OAuth 2.0'].map((m) => (
                <span key={m} className="badge badge-primary" style={{ fontSize: '0.75rem' }}>{m}</span>
              ))}
            </div>
          </div>

          {/* Rate Limiting */}
          <div className="card" id="rate-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Rate Limiting</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              API keys are rate limited per organization. Responses include limit headers.
            </p>
            <table className="table">
              <tbody>
                {[
                  ['X-RateLimit-Limit', 'Total requests allowed in the current window.'],
                  ['X-RateLimit-Remaining', 'Requests left before throttling begins.'],
                  ['Retry-After', 'Seconds to wait after a 429 response.'],
                ].map(([h, d]) => (
                  <tr key={h}>
                    <td><code className="mono">{h}</code></td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: '1rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.5rem' }}>Limits by plan</div>
              <table className="table">
                <thead><tr><th>Plan</th><th>Requests / minute</th></tr></thead>
                <tbody>
                  {[['Free', '60'], ['Starter', '300'], ['Professional', '1,000'], ['Enterprise', '10,000+']].map(([tier, rps]) => (
                    <tr key={tier}><td>{tier}</td><td className="mono">{rps}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Errors */}
          <div className="card" id="errors-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Errors & Status Codes</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              Errors are JSON objects with a human-readable <code className="mono">detail</code> field and optional field-level validation messages.
            </p>
            <table className="table">
              <tbody>
                {[
                  [400, 'Invalid request or validation error'],
                  [401, 'Missing or invalid authentication'],
                  [403, 'Authenticated but not allowed for this organization/object'],
                  [404, 'Resource not found'],
                  [409, 'State conflict — e.g. already completed or voided'],
                  [429, 'Rate limit exceeded'],
                  [500, 'Unexpected server error'],
                ].map(([code, desc]) => (
                  <tr key={code}>
                    <td><code className="mono">{code}</code></td>
                    <td>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="card" id="pagination-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.75rem' }}>Pagination</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              List endpoints use page-based pagination. Use <code className="mono">page</code> and <code className="mono">page_size</code> query params.
            </p>
            <div className="mono" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.875rem', fontSize: '0.8125rem', whiteSpace: 'pre', overflowX: 'auto' }}>
{`{
  "count": 143,
  "next": "https://api.hanmak.io/v1/envelopes/?page=2",
  "previous": null,
  "results": [...]
}`}
            </div>
          </div>

          {/* Envelopes */}
          <div className="card" id="env-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Envelopes</h2>
            <EndpointBlock
              method="GET"
              path="/envelopes"
              title="List all envelopes"
              params={[
                { name: 'status', type: 'string', desc: 'Filter by status: draft, sent, completed, voided' },
                { name: 'page_size', type: 'integer', desc: 'Results per page (default: 20, max: 100)' },
                { name: 'from_date', type: 'string', desc: 'ISO 8601 date filter' },
              ]}
              responseBody={`{
  "count": 1284,
  "next": "https://api.hanmak.io/v1/envelopes/?page=2",
  "results": [
    {
      "id": "ENV-2024-0891",
      "name": "Q4 Vendor Contract",
      "status": "partially_signed",
      "created_at": "2026-05-01T13:54:58Z",
      "recipients": [{ "id": "rcp_01", "name": "Sarah Chen", "role": "signer", "status": "signed" }]
    }
  ]
}`}
            />
            <EndpointBlock
              method="POST"
              path="/envelopes"
              title="Create a new envelope"
              params={[
                { name: 'name', type: 'string', desc: 'Envelope display name (required)' },
                { name: 'template_id', type: 'string', desc: 'Template to use (optional)' },
                { name: 'recipients', type: 'array', desc: 'Array of recipient objects' },
                { name: 'expires_at', type: 'string', desc: 'ISO 8601 expiration timestamp' },
              ]}
              responseBody={`{ "id": "ENV-2024-0892", "name": "Partnership NDA", "status": "draft", "signing_url": "https://sign.hanmak.io/s/abc123" }`}
            />
            <EndpointBlock method="GET" path="/envelopes/{id}" title="Get envelope details" responseBody={`{ "id": "ENV-2024-0891", "status": "completed", "recipients": [...] }`} />
            <EndpointBlock method="PATCH" path="/envelopes/{id}" title="Update envelope" params={[{ name: 'name', type: 'string', desc: 'New name' }, { name: 'expires_at', type: 'string', desc: 'New expiry' }]} />
            <EndpointBlock method="DELETE" path="/envelopes/{id}/void" title="Void an envelope" params={[{ name: 'reason', type: 'string', desc: 'Reason for voiding (required)' }]} />
          </div>

          {/* Templates */}
          <div className="card" id="tpl-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Templates</h2>
            <EndpointBlock method="GET" path="/templates" title="List templates" params={[{ name: 'search', type: 'string', desc: 'Template name or description' }]} responseBody={`{ "count": 2, "results": [{ "id": 12, "name": "Vendor Agreement", "status": "active" }] }`} />
            <EndpointBlock method="POST" path="/templates" title="Create template" params={[{ name: 'name', type: 'string', desc: 'Template name (required)' }, { name: 'description', type: 'string', desc: 'Optional description' }]} responseBody={`{ "id": 12, "name": "Vendor Agreement", "status": "draft" }`} />
            <EndpointBlock method="POST" path="/templates/{id}/duplicate" title="Duplicate template" responseBody={`{ "id": 13, "name": "Vendor Agreement Copy" }`} />
            <EndpointBlock method="POST" path="/templates/{id}/archive" title="Archive template" responseBody={`{ "status": "archived" }`} />
          </div>

          {/* Signatures */}
          <div className="card" id="sig-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Signatures</h2>
            <EndpointBlock method="GET" path="/sign/{token}" title="Open signer session" responseBody={`{ "envelope": 5, "recipient": { "name": "Ada" }, "fields": [] }`} />
            <EndpointBlock
              method="POST"
              path="/sign/{token}/submit"
              title="Submit signer values"
              params={[
                { name: 'field_values', type: 'array', desc: 'Field values keyed by field_key' },
                { name: 'consent_accepted', type: 'boolean', desc: 'Electronic signature consent' },
              ]}
              responseBody={`{ "status": "signed", "completed": true }`}
            />
            <EndpointBlock method="POST" path="/sign/{token}/decline" title="Decline signing" params={[{ name: 'reason', type: 'string', desc: 'Decline reason' }]} responseBody={`{ "status": "declined" }`} />
          </div>

          {/* Webhooks */}
          <div className="card" id="wh-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Webhook Events</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
              HanMak sends HTTP POST requests to your configured endpoints on these events:
            </p>
            <table className="table">
              <thead><tr><th>Event</th><th>Description</th><th>Payload includes</th></tr></thead>
              <tbody>
                {[
                  ['envelope.sent', 'Envelope dispatched to recipients', 'envelope object'],
                  ['envelope.viewed', 'Recipient opened signing session', 'envelope + recipient'],
                  ['envelope.completed', 'All parties signed', 'envelope + documents'],
                  ['envelope.voided', 'Envelope voided', 'envelope + reason'],
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

          {/* Users */}
          <div className="card" id="usr-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Users</h2>
            <EndpointBlock method="GET" path="/users" title="List visible users" responseBody={`{ "count": 1, "results": [{ "id": 7, "email": "user@example.com" }] }`} />
            <EndpointBlock
              method="POST"
              path="/users/create_managed"
              title="Create managed user"
              params={[
                { name: 'email', type: 'string', desc: 'User email (required)' },
                { name: 'setup_mode', type: 'string', desc: 'setup_email or temporary_password' },
              ]}
              responseBody={`{ "id": 7, "queued_email": 19 }`}
            />
            <EndpointBlock method="POST" path="/users/{id}/reset_password" title="Force password reset" responseBody={`{ "ok": true, "queued_email": 20 }`} />
            <EndpointBlock method="POST" path="/users/{id}/suspend" title="Suspend user" responseBody={`{ "is_active": false }`} />
          </div>

          {/* Audit Trail */}
          <div className="card" id="audit-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Audit Trail</h2>
            <EndpointBlock
              method="GET"
              path="/audit-events"
              title="List audit events"
              params={[
                { name: 'event_type', type: 'string', desc: 'Filter by event prefix' },
                { name: 'created_after', type: 'string', desc: 'ISO timestamp filter' },
              ]}
              responseBody={`{ "count": 25, "results": [{ "event_type": "envelope.sent", "created_at": "2026-05-16T00:00:00Z" }] }`}
            />
            <EndpointBlock
              method="POST"
              path="/evidence-bundles"
              title="Create evidence bundle"
              params={[{ name: 'envelope', type: 'integer', desc: 'Completed envelope ID' }]}
              responseBody={`{ "id": 10, "status": "ready", "manifest_sha256": "abc123..." }`}
            />
          </div>

          {/* Files */}
          <div className="card" id="files-section" style={{ padding: '1.5rem' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem' }}>Files</h2>
            <EndpointBlock method="GET" path="/documents" title="List documents" params={[{ name: 'search', type: 'string', desc: 'Filename/title search' }]} responseBody={`{ "count": 3, "results": [{ "id": 4, "title": "Agreement.pdf", "page_count": 2 }] }`} />
            <EndpointBlock
              method="POST"
              path="/documents"
              title="Upload document"
              params={[{ name: 'file', type: 'file', desc: 'PDF/image upload (multipart/form-data)' }]}
              responseBody={`{ "id": 4, "status": "processed" }`}
            />
            <EndpointBlock method="POST" path="/documents/{id}/render_pages" title="Render page previews" responseBody={`{ "pages": [{ "page_number": 1, "image_url": "/media/..." }] }`} />
            <EndpointBlock method="DELETE" path="/documents/{id}" title="Delete document" responseBody="{}" />
          </div>
        </div>
      </div>
    </div>
  );
}
