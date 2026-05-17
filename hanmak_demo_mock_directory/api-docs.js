registerPage('api-docs', () => `
<div class="page-header">
  <div>
    <h1 class="page-title">API Reference</h1>
    <p class="page-subtitle">REST API v1 — Base URL: <code style="font-family:var(--font-mono);background:var(--bg-secondary);padding:2px 8px;border-radius:4px">https://api.hanmak.io/v1</code></p>
  </div>
  <div class="flex gap-2">
    <button class="btn btn-ghost" onclick="downloadPostmanCollectionLive()">${icon('download')} Postman Collection</button>
    <button class="btn btn-ghost" onclick="downloadOpenApiSpecLive()">${icon('download')} OpenAPI 3.0</button>
    <button class="btn btn-primary" onclick="navigate('api-keys')">${icon('key')} Manage Keys</button>
  </div>
</div>

<div style="display:grid;grid-template-columns:240px 1fr;gap:1.5rem">
  <!-- Sidebar nav -->
  <div class="card" style="padding:1rem;height:fit-content;position:sticky;top:1rem">
    <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.5rem">Getting Started</div>
    ${apiNavItem('Authentication','auth-section')}
    ${apiNavItem('Rate Limiting','rate-section')}
    ${apiNavItem('Errors & Status Codes','errors-section')}
    ${apiNavItem('Pagination','pagination-section')}
    <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.06em;margin:0.75rem 0 0.5rem">Endpoints</div>
    ${apiNavItem('Envelopes','env-section')}
    ${apiNavItem('Templates','tpl-section')}
    ${apiNavItem('Signatures','sig-section')}
    ${apiNavItem('Webhooks','wh-section')}
    ${apiNavItem('Users','usr-section')}
    ${apiNavItem('Audit Trail','audit-api-section')}
    ${apiNavItem('Files','files-section')}
  </div>

  <!-- Content -->
  <div class="flex flex-col gap-4">
    <!-- Auth -->
    <div class="card" id="auth-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:0.25rem">Authentication</h2>
      <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">All API requests must include your API key in the <code class="code-inline">Authorization</code> header.</p>
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:0.8125rem;margin-bottom:1rem">
        <div style="color:var(--text-muted);margin-bottom:4px"># Example request</div>
        <div>curl -X GET <span style="color:var(--primary)">https://api.hanmak.io/v1/envelopes</span> \\</div>
        <div style="padding-left:1.5rem">-H <span style="color:var(--success)">"Authorization: Bearer sk_live_abc123..."</span> \\</div>
        <div style="padding-left:1.5rem">-H <span style="color:var(--success)">"Content-Type: application/json"</span></div>
      </div>
      <div class="flex gap-2" style="flex-wrap:wrap">
        ${['Bearer Token (sk_live_...)','API Key (sk_test_...)','OAuth 2.0','SAML Assertion'].map(m=>`<span class="badge badge-primary" style="font-size:0.75rem">${m}</span>`).join('')}
      </div>
    </div>

    <div class="card" id="rate-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:0.75rem">Rate Limiting</h2>
      <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">API keys are rate limited per organization and per key. Responses include limit headers so clients can slow down before being blocked.</p>
      <table class="table">
        <tbody>
          <tr><td><code class="code-inline">X-RateLimit-Limit</code></td><td>Total requests allowed in the current window.</td></tr>
          <tr><td><code class="code-inline">X-RateLimit-Remaining</code></td><td>Requests left before throttling begins.</td></tr>
          <tr><td><code class="code-inline">Retry-After</code></td><td>Seconds to wait after a <code class="code-inline">429</code> response.</td></tr>
        </tbody>
      </table>
    </div>

    <div class="card" id="errors-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:0.75rem">Errors & Status Codes</h2>
      <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">Errors are JSON objects with a human-readable <code class="code-inline">detail</code> and optional field-level validation messages.</p>
      <div style="overflow-x:auto">
        <table class="table">
          <tbody>
            ${[[400,'Invalid request or validation error'],[401,'Missing or invalid authentication'],[403,'Authenticated but not allowed for this organization/object'],[404,'Resource not found'],[409,'State conflict such as already completed or voided'],[429,'Rate limit exceeded'],[500,'Unexpected server error']].map(([code,desc])=>`
              <tr><td><code class="code-inline">${code}</code></td><td>${desc}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" id="pagination-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:0.75rem">Pagination</h2>
      <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">List endpoints use DRF-style pagination. Use <code class="code-inline">page</code>, <code class="code-inline">page_size</code>, and returned <code class="code-inline">next</code>/<code class="code-inline">previous</code> URLs for navigation.</p>
      <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:8px;padding:1rem;font-family:var(--font-mono);font-size:0.8125rem;white-space:pre;overflow-x:auto">{
  "count": 143,
  "next": "https://api.hanmak.io/v1/envelopes/?page=2",
  "previous": null,
  "results": []
}</div>
    </div>

    <!-- Envelopes -->
    <div class="card" id="env-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Envelopes</h2>
      ${apiEndpoint('GET','/envelopes','List all envelopes',[
        {name:'status',type:'string',desc:'Filter by status: draft,sent,completed,voided'},
        {name:'limit',type:'integer',desc:'Results per page (default: 20, max: 100)'},
        {name:'after',type:'string',desc:'Cursor for pagination'},
        {name:'from_date',type:'string',desc:'ISO 8601 date filter'},
      ],
      `{
  "data": [
    {
      "id": "ENV-2024-0891",
      "name": "Q4 Vendor Contract",
      "status": "partially_signed",
      "created_at": "2026-05-01T13:54:58Z",
      "expires_at": "2026-05-15T23:59:59Z",
      "recipients": [
        { "id": "rcp_01", "name": "Sarah Chen", "email": "sarah@acme.com", "role": "signer", "status": "signed" },
        { "id": "rcp_02", "name": "James Lee", "email": "james@acme.com", "role": "signer", "status": "pending" }
      ],
      "completion_pct": 66,
      "documents": [{ "id": "doc_01", "name": "contract.pdf", "pages": 12 }]
    }
  ],
  "meta": { "total": 1284, "limit": 20, "next_cursor": "cur_abc123" }
}`)}

      ${apiEndpoint('POST','/envelopes','Create a new envelope',[
        {name:'name',type:'string',desc:'Envelope display name (required)'},
        {name:'template_id',type:'string',desc:'Template to use (optional)'},
        {name:'recipients',type:'array',desc:'Array of recipient objects'},
        {name:'message',type:'string',desc:'Message to show signers'},
        {name:'expires_at',type:'string',desc:'ISO 8601 expiration timestamp'},
      ],
      `{
  "id": "ENV-2024-0892",
  "name": "Partnership NDA",
  "status": "draft",
  "created_at": "2026-05-03T14:30:00Z",
  "signing_url": "https://sign.hanmak.io/s/abc123",
  "recipients": [...]
}`)}

      ${apiEndpoint('GET','/envelopes/{id}','Get envelope details',[],[`{ "id": "ENV-2024-0891", "status": "partially_signed", ... }`])}
      ${apiEndpoint('PATCH','/envelopes/{id}','Update envelope',[{name:'name',type:'string',desc:'New name'},{name:'expires_at',type:'string',desc:'New expiry'}],[])}
      ${apiEndpoint('DELETE','/envelopes/{id}/void','Void an envelope',[{name:'reason',type:'string',desc:'Reason for voiding (required)'}],[])}
    </div>

    <div class="card" id="tpl-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Templates</h2>
      ${apiEndpoint('GET','/templates','List templates',[{name:'organization',type:'integer',desc:'Organization ID'},{name:'search',type:'string',desc:'Template name or description'}],`{ "count": 2, "results": [{ "id": 12, "name": "Vendor Agreement", "status": "active" }] }`)}
      ${apiEndpoint('POST','/templates','Create template',[{name:'organization',type:'integer',desc:'Organization ID'},{name:'name',type:'string',desc:'Template name'},{name:'description',type:'string',desc:'Optional description'}],`{ "id": 12, "name": "Vendor Agreement", "status": "draft" }`)}
      ${apiEndpoint('POST','/templates/{id}/duplicate','Duplicate template',[],`{ "id": 13, "name": "Vendor Agreement Copy" }`)}
      ${apiEndpoint('POST','/templates/{id}/archive','Archive template',[],`{ "status": "archived" }`)}
    </div>

    <div class="card" id="sig-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Signatures</h2>
      ${apiEndpoint('GET','/public/signing-sessions/{token}/','Open signer session',[],`{ "envelope": 5, "recipient": {"name": "Ada"}, "fields": [] }`)}
      ${apiEndpoint('POST','/public/signing-sessions/{token}/submit/','Submit signer values',[{name:'values',type:'array',desc:'Field values keyed by field_key'},{name:'consent_accepted',type:'boolean',desc:'Electronic signature consent'}],`{ "status": "signed", "completed": true }`)}
      ${apiEndpoint('POST','/public/signing-sessions/{token}/decline/','Decline signing',[{name:'reason',type:'string',desc:'Decline reason'}],`{ "status": "declined" }`)}
      ${apiEndpoint('POST','/recipients/{id}/delegate/','Delegate signer task',[{name:'name',type:'string',desc:'Delegate full name'},{name:'email',type:'string',desc:'Delegate email'},{name:'reason',type:'string',desc:'Optional reason'}],`{ "id": 32, "status": "sent", "delegated_from": 31 }`)}
    </div>

    <!-- Webhooks -->
    <div class="card" id="wh-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Webhook Events</h2>
      <p style="color:var(--text-secondary);font-size:0.875rem;margin-bottom:1rem">HanMak sends HTTP POST requests to your configured endpoints on these events:</p>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Event</th><th>Description</th><th>Payload</th></tr></thead>
          <tbody>
            ${[['envelope.sent','Envelope dispatched to recipients','envelope object'],
               ['envelope.viewed','Recipient opened signing session','envelope + recipient'],
               ['envelope.completed','All parties signed','envelope + documents'],
               ['envelope.voided','Envelope voided','envelope + reason'],
               ['envelope.expired','Envelope passed expiration','envelope'],
               ['signature.applied','A signature was placed','envelope + signature'],
               ['approval.granted','Approval was granted','envelope + approver'],
               ['approval.declined','Approval was declined','envelope + reason'],
               ['user.created','New user added to org','user object'],
               ['template.updated','Template version bumped','template object']].map(([ev,desc,payload])=>`
              <tr>
                <td><code class="code-inline" style="font-size:0.75rem">${ev}</code></td>
                <td style="font-size:0.8125rem">${desc}</td>
                <td style="font-size:0.75rem;color:var(--text-muted)">${payload}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <div class="card" id="usr-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Users</h2>
      ${apiEndpoint('GET','/users','List visible users',[{name:'organization',type:'integer',desc:'Optional organization filter'}],`{ "count": 1, "results": [{ "id": 7, "email": "user@example.com" }] }`)}
      ${apiEndpoint('POST','/users/create_managed/','Create managed user',[{name:'organization',type:'integer',desc:'Target organization'},{name:'email',type:'string',desc:'User email'},{name:'setup_mode',type:'string',desc:'setup_email or temporary_password'}],`{ "id": 7, "queued_email": 19 }`)}
      ${apiEndpoint('POST','/users/{id}/reset_password/','Force password reset',[],`{ "ok": true, "queued_email": 20 }`)}
      ${apiEndpoint('POST','/users/{id}/suspend/','Suspend user',[],`{ "is_active": false }`)}
    </div>

    <div class="card" id="audit-api-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Audit Trail</h2>
      ${apiEndpoint('GET','/audit-events','List audit events',[{name:'organization',type:'integer',desc:'Organization ID'},{name:'event_type',type:'string',desc:'Filter by event prefix'},{name:'created_after',type:'string',desc:'ISO timestamp'}],`{ "count": 25, "results": [{ "event_type": "envelope.sent", "created_at": "2026-05-16T00:00:00Z" }] }`)}
      ${apiEndpoint('POST','/evidence-bundles','Create evidence bundle',[{name:'envelope',type:'integer',desc:'Completed envelope ID'}],`{ "id": 10, "status": "ready", "manifest_sha256": "..." }`)}
    </div>

    <div class="card" id="files-section" style="padding:1.5rem">
      <h2 style="font-size:1.125rem;font-weight:700;margin-bottom:1rem">Files</h2>
      ${apiEndpoint('GET','/documents','List file-library documents',[{name:'organization',type:'integer',desc:'Organization ID'},{name:'search',type:'string',desc:'Filename/title search'}],`{ "count": 3, "results": [{ "id": 4, "title": "Agreement.pdf", "page_count": 2 }] }`)}
      ${apiEndpoint('POST','/documents','Upload document',[{name:'file',type:'file',desc:'PDF/image upload'},{name:'organization',type:'integer',desc:'Organization ID'}],`{ "id": 4, "status": "processed" }`)}
      ${apiEndpoint('POST','/documents/{id}/render_pages/','Render page previews',[],`{ "pages": [{ "page_number": 1, "image_url": "/media/..." }] }`)}
      ${apiEndpoint('DELETE','/documents/{id}','Delete document',[],`{}`)}
    </div>
  </div>
</div>
`);

function apiNavItem(label, targetId) {
  return `<div style="padding:0.375rem 0.5rem;border-radius:5px;font-size:0.8125rem;cursor:pointer;color:var(--text-secondary)" 
    onclick="document.getElementById('${targetId}')?.scrollIntoView({behavior:'smooth'})"
    onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background=''">${label}</div>`;
}

function apiEndpoint(method, path, title, params, responseBody) {
  const mc = {GET:'primary',POST:'success',PATCH:'warning',DELETE:'danger',PUT:'warning'};
  const res = Array.isArray(responseBody) ? responseBody.join('') : responseBody;
  return `<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:1rem">
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.875rem 1rem;background:var(--bg-secondary);cursor:pointer" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
      <span class="badge badge-${mc[method]||'primary'}" style="font-size:0.75rem;min-width:52px;text-align:center">${method}</span>
      <code style="font-family:var(--font-mono);font-size:0.875rem;color:var(--text-primary);flex:1">${path}</code>
      <span style="font-size:0.8125rem;color:var(--text-muted)">${title}</span>
      <span style="color:var(--text-muted)">▾</span>
    </div>
    <div style="padding:1rem">
      ${params.length > 0 ? `<div style="margin-bottom:1rem">
        <div style="font-weight:600;font-size:0.8125rem;margin-bottom:0.5rem">Parameters</div>
        <table style="width:100%;font-size:0.8rem;border-collapse:collapse">
          <tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:4px 8px;color:var(--text-muted)">Name</th><th style="text-align:left;padding:4px 8px;color:var(--text-muted)">Type</th><th style="text-align:left;padding:4px 8px;color:var(--text-muted)">Description</th></tr>
          ${params.map(p=>`<tr style="border-bottom:1px solid var(--border)"><td style="padding:6px 8px;font-family:var(--font-mono);color:var(--primary)">${p.name}</td><td style="padding:6px 8px;color:var(--text-muted)">${p.type}</td><td style="padding:6px 8px">${p.desc}</td></tr>`).join('')}
        </table>
      </div>` : ''}
      ${res ? `<div>
        <div style="font-weight:600;font-size:0.8125rem;margin-bottom:0.5rem">Response</div>
        <div style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;padding:0.875rem;font-family:var(--font-mono);font-size:0.75rem;white-space:pre;overflow-x:auto;color:var(--text-secondary)">${res}</div>
        <button class="btn btn-ghost btn-sm" style="margin-top:0.5rem" onclick="copyToClipboard('${res.replace(/'/g,'"')}');showToast('Copied!','success')">${icon('copy')} Copy</button>
      </div>` : ''}
    </div>
  </div>`;
}

async function downloadOpenApiSpecLive() {
  try {
    if (!await ensureHanmakApi()) return;
    const response = await fetch(`${HANMAK_API_BASE_URL}/schema/`, {
      headers: {Authorization: `Bearer ${localStorage.getItem('HANMAK_ACCESS_TOKEN')}`},
    });
    if (!response.ok) throw new Error(`Schema returned HTTP ${response.status}`);
    const text = await response.text();
    downloadTextFile('hanmak-openapi.yaml', text, 'application/yaml');
    showToast('OpenAPI spec downloaded', 'success');
  } catch (error) {
    showToast(`OpenAPI download failed: ${error.message}`, 'error', 7000);
  }
}

async function downloadPostmanCollectionLive() {
  try {
    if (!await ensureHanmakApi()) return;
    const response = await fetch(`${HANMAK_API_BASE_URL}/schema/`, {
      headers: {Authorization: `Bearer ${localStorage.getItem('HANMAK_ACCESS_TOKEN')}`},
    });
    if (!response.ok) throw new Error(`Schema returned HTTP ${response.status}`);
    const schemaText = await response.text();
    const collection = {
      info: {
        name: 'HanMak API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
      },
      variable: [
        {key: 'baseUrl', value: HANMAK_API_BASE_URL.replace(/\/$/, '')},
        {key: 'token', value: ''},
      ],
      auth: {type: 'bearer', bearer: [{key: 'token', value: '{{token}}', type: 'string'}]},
      item: buildPostmanItemsFromOpenApi(schemaText),
    };
    downloadTextFile('hanmak-postman-collection.json', JSON.stringify(collection, null, 2), 'application/json');
    showToast('Postman collection downloaded', 'success');
  } catch (error) {
    showToast(`Postman export failed: ${error.message}`, 'error', 7000);
  }
}

function buildPostmanItemsFromOpenApi(schemaText) {
  let schema;
  try {
    schema = JSON.parse(schemaText);
  } catch (_) {
    return [
      postmanRequestItem('Auth Login', 'POST', '/auth/login/'),
      postmanRequestItem('List Envelopes', 'GET', '/envelopes/'),
      postmanRequestItem('List Templates', 'GET', '/templates/'),
      postmanRequestItem('List Webhooks', 'GET', '/webhook-endpoints/'),
    ];
  }
  const paths = schema.paths || {};
  return Object.entries(paths).slice(0, 80).flatMap(([path, methods]) =>
    Object.entries(methods)
      .filter(([method]) => ['get', 'post', 'patch', 'put', 'delete'].includes(method))
      .map(([method, operation]) => postmanRequestItem(operation.summary || `${method.toUpperCase()} ${path}`, method.toUpperCase(), path))
  );
}

function postmanRequestItem(name, method, path) {
  return {
    name,
    request: {
      method,
      header: [{key: 'Content-Type', value: 'application/json'}],
      url: {
        raw: `{{baseUrl}}${path}`,
        host: ['{{baseUrl}}'],
        path: path.replace(/^\//, '').split('/').filter(Boolean),
      },
    },
  };
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], {type: mimeType});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
