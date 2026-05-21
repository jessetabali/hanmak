# HanMak — How It Works

This document explains the full end-to-end mechanics of the two most important workflows in HanMak: **Template Creation** and **Document Signing**. It covers both the user-facing experience and the exact technical steps the backend and frontend perform at each stage.

For a quick reference to buttons and actions, see `docs/USER_GUIDE.md`.  
For API patterns, data models, and coding conventions, see `docs/DEVELOPER_GUIDE.md`.

---

## 1. How Template Creation Works

A **Template** is the reusable blueprint that defines which document a signer sees, where the fields are, which party fills each field, and what field types are used. Every envelope is created from a template — a template is to an envelope what a document template is to a printed contract.

### 1.1 The Data Model

| Model | Purpose |
|---|---|
| `Template` | Top-level record: name, status (`ACTIVE` / `DRAFT` / `ARCHIVED`), current version number, owner org |
| `TemplateVersion` | Immutable snapshot created on every save: stores the full `field_schema` JSON, links to the source `Document`, records `changelog` text |
| `TemplateParty` | One row per signer role on a version: `role_key` (e.g. `party-1`), human `label` (e.g. "Buyer"), `routing_order` |
| `FormField` | One row per placed field on a version (and later copied to an envelope): stores `x`, `y`, `width`, `height`, `page`, `page_width`, `page_height`, `field_type`, `required`, `options` |
| `Document` | The source PDF/file uploaded from the File Library; stores rendered page images via `DocumentPage` |

**Key invariant:** `TemplateVersion` rows are never mutated after creation. Each save in Form Builder creates a brand new version row with a higher `version_number`. Envelopes pin to the specific version they were created from, so changing a template never breaks in-flight envelopes.

### 1.2 Step-by-Step: Creating a Template

#### Step 1 — Create the Template record

From the **Templates** list, clicking **New Template** posts to:

```
POST /api/v1/templates/
{ "name": "Service Agreement", "organization": <org_id> }
```

The response is a bare `Template` with `status = DRAFT` and no version yet. The user is redirected to Form Builder at `/form-builder/<template_id>`.

#### Step 2 — Choose a Document

Form Builder needs a source document (a PDF to display as the canvas background). Three paths exist, resolved in priority order:

| Priority | Trigger | Mechanism |
|---|---|---|
| 1 — URL param | `/form-builder/<id>?doc=<doc_id>` — "Open in Form Builder" from File Library | `useApiQuery(['document', docParam], EP.DOCUMENT(docParam))` |
| 2 — Version's own document | Navigating to an existing template via the "Setup" button | `versionsData[0].document` → `useApiQuery(['document-from-version', versionDocId], EP.DOCUMENT(versionDocId))` |
| 3 — Library fallback | Brand-new template with no version yet | `useApiQuery(['documents', templateId], EP.DOCUMENTS)` — picks the first document |

The "Open in Form Builder" path first calls:

```
POST /api/v1/documents/<id>/prepare-for-builder/
```

This marks the document ready, triggers server-side PNG rendering of each page (using pdf2image/poppler when available), and returns `rendered_pages[]` so the canvas has background images to display.

If server-side rendering is unavailable (no poppler / MinIO unreachable), Form Builder falls back to client-side PDF.js rendering — it dynamically imports `pdfjs-dist`, fetches the raw PDF file, and renders each page to an off-screen `<canvas>` at 1040 px wide.

#### Step 3 — Place Fields

The Form Builder canvas renders at a fixed **1040 px** wide coordinate basis. All field positions are stored in this basis regardless of the PDF's actual page size — this is the **canonical coordinate basis**.

User interactions:

- **Drag a field type** from the palette onto a page → creates a field at the drop position
- **Click to select** → shows the inspector panel (label, field type, party assignment, required toggle, options for dropdown/radio)
- **Drag to reposition** → updates `x`, `y`; clamped to stay inside the page boundaries
- **Corner handles to resize** → updates `width`, `height`; minimum 40 px wide × 18 px tall; opposite corner stays pinned
- **Party tabs** → switches which party's fields are highlighted; double-click a tab to rename the party inline

Supported field types: `text`, `textarea`, `number`, `email`, `date`, `dropdown`, `radio_group`, `checkbox`, `signature`, `initials`, `attachment`.

#### Step 4 — Save (creates a new TemplateVersion)

Clicking **Save** in Form Builder calls:

```
POST /api/v1/templates/<id>/setup/
{
  "document": <doc_id>,
  "fields": [
    {
      "field_key": "signature",
      "field_type": "signature",
      "label": "Signature",
      "required": true,
      "party_key": "party-1",
      "page": 1,
      "x": 133, "y": 1040,
      "width": 374, "height": 104,
      "page_width": 1040, "page_height": 1471,
      "coordinate_basis": "page-pixels"
    },
    ...
  ],
  "parties": [
    { "role_key": "party-1", "label": "Seller", "routing_order": 1 },
    { "role_key": "party-2", "label": "Buyer",  "routing_order": 2 }
  ],
  "changelog": "Added signature block"
}
```

The `setup_template_version()` service function (in `envelopes/services.py`) runs inside a `@transaction.atomic` block and does the following in sequence:

1. **Normalize all field geometries** — `normalize_field_geometry()` is called on every field. If the source document's page was not 1040 px wide, coordinates are scaled to the canonical 1040 px basis. Percentage coordinates (`x_pct`, `y_pct`, etc.) are converted to pixels.
2. **Increment the version number** — queries `MAX(version_number)` on existing versions and adds 1.
3. **Set template status to `ACTIVE`** and update `template.version`.
4. **Create a `TemplateVersion`** row — stores the full normalized `field_schema` JSON (not just FK references), `document` FK, `workflow_schema`, `changelog`, `is_published=True`.
5. **Create `TemplateParty` rows** — one per unique `party_key` found in the fields. Labels come from the `parties` payload or are derived from the key (`party-1` → "Party 1"). `routing_order` is parsed from the key suffix.
6. **Create `FormField` rows** — one per field, linked to the `Template`, the `TemplateVersion`, and the appropriate `TemplateParty`. All coordinates are stored in the canonical basis.

On success the response returns the new `TemplateVersion` with its `parties[]` and `field_count`. Form Builder updates its state and shows a success toast.

#### Step 5 — What Happens When You Reopen a Saved Template

When Form Builder loads an existing template (no `?doc=` param):

1. It fetches `GET /api/v1/template-versions/?template=<id>` — the `filterset_fields = ['template']` on `TemplateVersionViewSet` is critical; without it the filter would be silently ignored and a random other template's version could be loaded.
2. It reads `versionsData.results[0].document` — the document ID stored on the latest version.
3. It fetches that specific document and renders its pages as the canvas background.
4. It reads `versionsData.results[0].field_schema.fields` and re-hydrates all the draggable field boxes at their saved positions.
5. It reads `versionsData.results[0].parties` and populates the party tab labels (e.g. "Seller", "Buyer").

### 1.3 Template List Actions

From the Templates list page, each template card/row supports:

| Action | What happens |
|---|---|
| **Setup / Edit** | Opens Form Builder at `/form-builder/<id>` |
| **Use (Create Envelope)** | Opens the envelope-creation modal pre-filled with this template's parties |
| **Preview** | Tries server page images → `prepare-for-builder` → PDF.js client render; shows pages in a modal |
| **Duplicate** | `POST /api/v1/templates/<id>/duplicate/` — clones the template and its latest version |
| **Archive / Activate** | Toggles `template.status` between `ARCHIVED` and `ACTIVE` |
| **Delete** | `DELETE /api/v1/templates/<id>/` — only possible for `DRAFT` or `ARCHIVED` templates with no live envelopes |

### 1.4 Envelope Creation From a Template

When a sender clicks **Use** on a template, the modal collects recipient assignments (one per party). On submit it calls:

```
POST /api/v1/envelopes/create_from_template/
{
  "template_version": <version_id>,
  "name": "Service Agreement — Acme Corp",
  "message": "Please review and sign.",
  "due_date": "2026-06-30",
  "recipients": [
    { "party_key": "party-1", "name": "Jesse Tabali",  "email": "jesse@example.com", "role": "signer", "routing_order": 1 },
    { "party_key": "party-2", "name": "Acme Corp Rep", "email": "rep@acme.com",       "role": "signer", "routing_order": 2 }
  ]
}
```

`create_envelope_from_template()` (in `envelopes/services.py`):

1. Validates all `party_key` values in the field schema have a matching recipient.
2. Creates the `Envelope` row (`status = DRAFT`).
3. Creates one `Recipient` row per recipient in the payload.
4. Creates an `EnvelopeDocument` linking the template's document to the envelope.
5. Copies every `FormField` from the template version to the envelope — applying `normalize_field_geometry()` again — and assigns each field to the matching `Recipient` instance via `party_key`.

After creation the sender reviews the envelope detail and clicks **Send**, which advances `envelope.status → SENT`, creates a `SigningSession` for each active recipient, and queues invitation emails.

---

## 2. How Signing Works

Signing is the process by which a recipient — who may not have a HanMak account — fills their assigned fields, captures a signature, and submits the signed document. The entire flow is gated by a **signing token**: a random UUID embedded in the recipient's invitation email link.

### 2.1 The Data Model

| Model | Purpose |
|---|---|
| `SigningSession` | One per recipient per envelope: holds the `token` UUID, `status`, `opened_at`, `submitted_at`, `ip_address`, `user_agent`, `expires_at` |
| `ConsentRecord` | Records that the signer accepted electronic signature terms: `consent_text`, `ip_address`, `user_agent` |
| `Signature` | The captured signature: `signature_type` (`typed` / `drawn` / `uploaded`), `typed_name`, `metadata` (contains `dataUrl` for drawn/uploaded) |
| `EnvelopeFieldValue` | One per field per recipient: `field_key`, `value`, optional `attachment` FileField, `metadata` |

Session statuses (in order): `CREATED` → `OPENED` → `SUBMITTED`; or `EXPIRED` / `REVOKED` / `DECLINED` as terminal states.

### 2.2 Step-by-Step: The Signing Flow

#### Step 1 — Envelope Sent: Sessions Created, Emails Queued

When a sender clicks **Send** on an envelope:

- `envelope.status → SENT`, `envelope.sent_at` recorded
- A `SigningSession` row is created for every non-CC recipient with a freshly generated UUID `token`
- `queue_envelope_invites()` builds `EmailMessage` records and `deliver_email_message_task.apply_async(queue='email')` fires them via Celery
- Each email contains a URL of the form `https://your-domain.com/sign/<token>`

If multiple recipients are present with different `routing_order` values, only **routing order 1** recipients get emails initially. Later orders receive their invitations after the current order completes (see Step 9).

#### Step 2 — Recipient Clicks the Link

The link opens `/sign/<token>` in any browser — no login, no account required. React Router renders `PublicSigning.jsx` outside the `AppShell` (no sidebar, no auth guard). On mount, TanStack Query fires:

```
GET /api/v1/sign/<token>/
```

This request is rate-limited by `PublicSigningRateThrottle` (default 30/min, configurable via `THROTTLE_PUBLIC_SIGNING`).

#### Step 3 — Backend Validates the Session

`PublicSigningSessionView.get()` performs these checks in order:

| Check | Response |
|---|---|
| Token not found | `404 Not Found` |
| `public_signing` feature flag off for the org | `403 Forbidden` |
| `expires_at` is in the past | Status forced to `EXPIRED` → `410 Gone` |
| Status is `EXPIRED`, `REVOKED`, or `DECLINED` | `410 Gone` — "This signing link is no longer active." |
| All checks pass and status is `CREATED` | Status set to `OPENED`; `opened_at`, `ip_address`, `user_agent` recorded |

On success the serializer returns:
- Envelope subject and sender info
- Signer name, role
- All `fields[]` assigned to this recipient (with `x`, `y`, `width`, `height`, `page`, `field_type`, `required`, `label`, `field_key`, `options`)
- All `documents[]` with `document_detail.pages[]` containing pre-rendered `image_url` entries

#### Step 4 — Document Pages Rendered

`PublicSigning.jsx` collects pages from `session.documents[]`, sorted by attachment order then page number, and renders each as a `1040 px`-wide white card stacked vertically in the left panel.

**PDF.js fallback:** If any page is missing an `image_url` (server-side rendering unavailable), a `useEffect` dynamically imports `pdfjs-dist`, fetches the raw PDF via `fetch(doc.file_url)`, renders each page to a `<canvas>` at 1040 px width, and converts the result to a `data:image/png` base-64 URL stored in `clientPageImages`. Missing pages are seamlessly replaced with client-rendered images — the signer always sees the full document.

#### Step 5 — Field Overlays Positioned

`SigningFieldOverlay` components are positioned absolutely on each page using:

```
left  = field.x * scale       // scale = DOC_WIDTH / page.width
top   = field.y * scale
width = field.width * scale
height = field.height * scale
```

Because all fields are stored in the canonical 1040 px basis and the page is displayed at exactly 1040 px, `scale = 1` in the common case. The formula still handles edge cases gracefully.

Overlay color convention:
- **Yellow** — unfilled, waiting for input
- **Green** — filled/completed
- **Blue** — currently active/focused

Clicking a `signature` or `initials` overlay opens the **Signature Modal** directly.

#### Step 6 — Signature Capture

The Signature Modal offers three tabs:

**Type tab**
- Signer types their name; name is previewed in real-time in five Google cursive fonts (Dancing Script, Pacifico, Sacramento, Great Vibes, Kaushan Script)
- Signer picks font and ink color (Black, Blue, Red)
- Stored as: `{ type: 'typed', name: 'Jesse Tabali', font: 'Dancing Script', color: '#0f172a' }`

**Draw tab**
- DPR-aware HTML5 `<canvas>` with mouse and touch support (touch-action: none)
- Ink color selectable; Clear button resets strokes
- On apply: `canvas.toDataURL('image/png')` captured
- Stored as: `{ type: 'drawn', dataUrl: 'data:image/png;base64,...' }`

**Upload tab**
- `FileReader.readAsDataURL()` on an image file (PNG/JPG)
- Stored as: `{ type: 'uploaded', dataUrl: 'data:image/png;base64,...' }`

`applySignature()` stores the result in `fieldValues[fieldId]`. The overlay immediately updates to show the typed name or the signature image inline.

#### Step 7 — Filling Non-Signature Fields

The right panel lists every field with a native control:

| Field type | Control |
|---|---|
| `text` | `<input type="text">` |
| `textarea` | `<textarea>` |
| `number` | `<input type="number">` |
| `email` | `<input type="email">` |
| `date` | `<input type="date">` |
| `checkbox` | `<input type="checkbox">` |
| `dropdown` / `select` | `<select>` populated from `field.options[]` |
| `attachment` | `<input type="file">` — filename shown as confirmation |
| `signature` / `initials` | "Click to Sign" button → opens Signature Modal |

A live progress bar tracks filled-required-fields / total-required-fields. The **Submit** button is disabled until every `required: true` field has a non-empty value.

#### Step 8 — Submission

When the signer clicks **Submit Signed Document**, `handleSubmit()` posts to:

```
POST /api/v1/sign/<token>/
Content-Type: application/json   (or multipart/form-data when attachments are present)

{
  "field_values": [
    { "field_key": "signature",  "value": "[TYPED:Jesse Tabali|Dancing Script|#0f172a]" },
    { "field_key": "signer-name","value": "Jesse Tabali" },
    { "field_key": "sign-date",  "value": "2026-05-21" }
  ],
  "signature": {
    "signature_type": "typed",
    "typed_name": "Jesse Tabali",
    "metadata": {}
  }
}
```

For drawn or uploaded signatures the `value` is the raw `data:image/png;base64,...` string. File attachment fields are sent as `multipart/form-data` with the file keyed as `attachment__<field_key>`. When the payload includes files, the JSON body is sent as a `payload` multipart field.

#### Step 9 — Backend Processes the Submission

`PublicSigningSessionView.post()` processes the payload in sequence:

1. **Idempotency guard** — if `session.status == SUBMITTED` or `recipient.status == SIGNED`, return the current serialized state immediately (safe to re-POST on network retry).

2. **Action routing** — if `payload.action == 'decline'`, hand off to `_decline()`. If `payload.action == 'delegate'`, hand off to `_delegate()`. Otherwise continue with the normal submit path.

3. **Consent record** — `ConsentRecord.objects.get_or_create(...)` records:
   - `consent_text` (from payload, or default "Accepted electronic signature consent.")
   - `ip_address` from `REMOTE_ADDR`
   - `user_agent` from `HTTP_USER_AGENT`

4. **Signature record** — `Signature.objects.create(...)` stores `signature_type`, `typed_name`, and any `metadata` (e.g. `{ dataUrl: '...' }` for drawn signatures).

5. **Required field validation** — for each `required=True` field assigned to this recipient, checks:
   - `checkbox`: value must be string `"true"`
   - `attachment`: a file must be present in `request.FILES`
   - all others: value must be a non-empty string after stripping whitespace
   - If any fail: returns `400 Bad Request` listing up to 5 missing field labels

6. **Field value persistence** — for each `{field_key, value}` in the payload:
   - Looks up the `FormField` record; if the field doesn't belong to this recipient → `400`
   - `EnvelopeFieldValue.objects.update_or_create(envelope, recipient, field_key, defaults={field, value, metadata})`
   - If `request.FILES` contains `attachment__{field_key}`, the file is stored in `defaults['attachment']` and `defaults['value']` is set to the filename

7. **Status transitions** — `session.status → SUBMITTED`, `session.submitted_at` recorded; `recipient.status → SIGNED`, `recipient.signed_at` recorded.

8. **Envelope completion check** — excludes CC and DELEGATED recipients, then checks:
   - **All remaining recipients are SIGNED →** `envelope.status → COMPLETED`, `envelope.completed_at` recorded; `queue_completion_emails()` fires and delivers via Celery — every participant gets a "Signing complete" email with a download link
   - **Some remain →** `envelope.status → PARTIALLY_SIGNED`; checks if all recipients at the *current* `routing_order` have now signed — if so, `queue_envelope_invites()` fires invitations to the *next* routing-order tier; if the just-signed recipient was a `SIGNER`, any `APPROVER` recipients get an `ApprovalRequest` created

9. **Response** — the session is re-fetched (fresh DB read) and returned as the full `PublicSigningSessionSerializer` payload.

#### Step 10 — After Submission: The Completed View

Once `submitted = true` (set client-side immediately after the POST succeeds), the frontend replaces the interactive signing UI with a read-only completed view:

- A sticky green banner: "Document Signed Successfully"
- The document pages displayed with all field values overlaid at their positions
- A **Download Signed PDF** button

The download button calls:

```
GET /api/v1/sign/<token>/download/    // responseType: 'blob'
```

`PublicSigningDownloadView.get()`:
- Validates `envelope.status in [COMPLETED, PARTIALLY_SIGNED]`; otherwise `403`
- Calls `build_signed_pdf(envelope)` from `evidence/pdf.py` which has two rendering paths:
  - **Primary** — `build_image_overlay_pdf()`: draws field values onto the stored `DocumentPage` PNG images and assembles a PDF; uses the same 1040 px coordinate basis as the browser overlay
  - **Fallback** — `build_stamped_source_pdf()`: creates a `reportlab` overlay at the source PDF's exact `mediabox` dimensions and merges it via `pypdf`
- Returns `Content-Type: application/pdf` as an inline `HttpResponse`

The browser receives the response as a `Blob`, creates a temporary `URL.createObjectURL()` URL, clicks an invisible `<a>` element to trigger download, then revokes the URL — this pattern sends the `Authorization` JWT correctly via Axios without relying on `window.open()`.

### 2.3 The Decline Flow

Clicking **Decline to Sign** opens a modal requiring a reason. On submit:

```
POST /api/v1/sign/<token>/decline/
{ "action": "decline", "reason": "I do not agree with clause 4." }
```

`_decline()`:
1. `session.status → DECLINED`, records `ip_address` and `user_agent`
2. `recipient.status → DECLINED`
3. `envelope.status → DECLINED`, `envelope.void_reason` set to the decline reason
4. **All other open signing sessions for this envelope are revoked** — `envelope.signing_sessions.exclude(id=session.id).exclude(status=SUBMITTED).update(status=REVOKED)`
5. A `ConsentRecord` is created with the decline text

The frontend immediately shows the "Signing Declined" full-screen message.

### 2.4 The Delegate Flow

Clicking **Delegate** transfers the signing obligation to a different person. On submit:

```
POST /api/v1/sign/<token>/
{ "action": "delegate", "name": "Maria Santos", "email": "maria@example.com", "reason": "On leave" }
```

`_delegate()`:
1. Creates a **new `Recipient`** row with the delegate's name and email, `delegated_from` FK pointing to the original recipient, same `routing_order` and `role`
2. **Moves all the original recipient's assigned `FormField`s** to the new recipient: `session.recipient.fields.update(recipient=delegate)`
3. `original_recipient.status → DELEGATED`
4. `session.status → REVOKED` — the original link is permanently dead
5. Creates a **new `SigningSession`** for the delegate recipient
6. `queue_envelope_invites()` fires immediately — the delegate receives an invitation email with a fresh token

The frontend shows "Signing Delegated" with the delegate's name and email. The original signer can no longer use their link.

### 2.5 Routing Order and Sequential Signing

When an envelope has recipients with different `routing_order` values:

- `routing_order = 1` recipients are invited immediately when the envelope is sent
- After **all** recipients at order 1 have signed, `queue_envelope_invites()` fires for order 2
- This continues until all routing orders complete
- CC recipients are excluded from completion checks and receive a copy of the completion email regardless

### 2.6 Complete Signing Lifecycle Diagram

```
Template (fields + parties)
       │
       ▼
Envelope created from template
  → FormField rows copied to envelope
  → Recipient rows created (party_key → recipient)
       │
       ▼
Envelope SENT
  → SigningSession(token=UUID) per non-CC recipient
  → Invitation emails queued via Celery
       │
Recipient opens link  ──────────────────────────────────────────────────────┐
       │                                                                    │
       ▼                                                                    │
GET /sign/<token>/                                                          │
  → Session validated                                                       │
  → status: CREATED → OPENED                                               │
  → ip_address + user_agent recorded                                        │
  → Returns: fields, document pages, signer info                           │
       │                                                                    │
       ▼                                                                    │
Browser renders PDF pages (server images or PDF.js fallback)               │
Field overlays positioned at canonical 1040px coordinates                  │
       │                                                                    │
  ┌────┴─────────────────────────────────────┐                             │
  │                                          │                             │
  ▼                                          ▼                             │
DECLINE                                  DELEGATE ───────────────────────►─┘
  → envelope: DECLINED                     → new Recipient created          (new token)
  → all other sessions: REVOKED            → fields moved to delegate
  → void_reason recorded                   → original session: REVOKED
                                            → delegate gets invitation email
  ▼
SUBMIT (all required fields filled + signature captured)
POST /sign/<token>/
  → ConsentRecord created
  → Signature created
  → Required fields validated
  → EnvelopeFieldValues upserted (+ file attachments stored)
  → session: SUBMITTED
  → recipient: SIGNED
       │
       ├── All active recipients SIGNED?
       │         YES → envelope: COMPLETED
       │               → completion emails queued (all participants)
       │               → Download Signed PDF available
       │
       └── Some remain unsigned?
                 → envelope: PARTIALLY_SIGNED
                 → current routing_order complete? → next order invited
                 → signer signed + approver present? → ApprovalRequest created
```

---

## 3. Coordinate System Reference

All field positions across the builder, signing page, and signed PDF generation use a single canonical coordinate system:

| Property | Value |
|---|---|
| Canvas width | **1040 px** (constant) |
| Canvas height | Derived from PDF page aspect ratio; A4 fallback ≈ **1471 px** |
| Origin | Top-left of each page |
| Y direction | Downward (browser convention); flipped to bottom-left for PDF rendering |
| Storage | `x`, `y`, `width`, `height` as integers in `page_width / page_height` pixel space |
| Normalization | `normalize_field_geometry()` in `envelopes/services.py` converts any source coordinate space to the canonical 1040 px basis before any DB write |

`FormFieldSerializer` returns `coordinate_basis: "canonical-1040"` so API consumers know which coordinate space they are working in.

---

## 4. Concrete Example: Upload PDF → Template → Envelope → Signing

This section walks through a single, real example from the very first click to the completed signed PDF. Every API call, every database row, and every file written to disk (or MinIO) is named explicitly.

**Scenario:** Jesse uploads a "Service Agreement" PDF, builds a template with two signature fields, creates an envelope for two signers, and both signers complete the document.

---

### Phase 1 — Upload the PDF (File Library)

**User action:** Opens **File Library → Upload**, selects `service-agreement.pdf` (1.2 MB, 2 pages).

**Frontend:** Posts `multipart/form-data` to:

```
POST /api/v1/documents/
Content-Type: multipart/form-data

organization: 1
title: Service Agreement
file: <binary PDF data>
```

**Backend — `DocumentViewSet.perform_create()`:**

1. DRF's `ModelSerializer.save()` writes the `Document` row first with the file reference.
2. Django's storage backend (`FileSystemStorage` in dev, `S3Boto3Storage` in prod) receives the file stream and writes it to disk or MinIO:
   - **Local dev path:** `backend/media/documents/service-agreement.pdf`
   - **MinIO/S3 path:** `s3://hanmak/documents/service-agreement.pdf`
3. `perform_create()` then runs synchronously:
   - Reads `document.file.size` → `file_size = 1,258,496`
   - Reads `content_type` from the multipart upload → `mime_type = 'application/pdf'`
   - Streams the file in chunks through `hashlib.sha256()` → `sha256 = 'a3f9...'`
   - Saves these three fields back: `document.save(update_fields=['file_size', 'mime_type', 'sha256'])`

**Database rows created:**

| Table | Row | Key fields |
|---|---|---|
| `documents_document` | id=42 | `title="Service Agreement"`, `status="uploaded"`, `page_count=0`, `file="documents/service-agreement.pdf"`, `sha256="a3f9..."` |

**Files on disk / MinIO:**

```
documents/service-agreement.pdf   ← the original PDF
```

**API response:**
```json
{
  "id": 42,
  "title": "Service Agreement",
  "status": "uploaded",
  "page_count": 0,
  "file_url": "http://localhost:8003/media/documents/service-agreement.pdf",
  "pages": [],
  "sha256": "a3f9..."
}
```

---

### Phase 2 — Prepare for Builder (Render Page Images)

**User action:** Clicks **Open in Form Builder** on the document row in File Library.

**Frontend:** Before redirecting to `/form-builder/?doc=42`, calls:

```
POST /api/v1/documents/42/prepare-for-builder/
{ "width": 1040 }
```

**Backend — `DocumentViewSet.prepare_for_builder()`:**

1. **Count pages:** Opens the PDF file via Django's storage backend and passes it to `PdfReader` (pypdf). `len(reader.pages) = 2` → `document.page_count = 2`.
2. **Mark ready:** `document.status = "ready"`, `document.processed_at = now()`. Saved.
3. **Create `DocumentPage` stubs:** `DocumentPage.objects.get_or_create(document=42, page_number=1, defaults={width:1040, height:1471})` and the same for page 2.
4. **Create scan record:** `DocumentScan.objects.create(document=42, status="clean", signature_version="basic-2026.05", findings=[], scanned_at=now())`.
5. **Render page images — `generate_document_page_images(document, target_width=1040)`:**
   - Checks `_pdf2image_available()`:
     - **If poppler/pdf2image is installed:** calls `convert_from_bytes(pdf_bytes, dpi=150, fmt='png')` → gets two PIL Image objects at ~1240 px wide (150 dpi A4)
     - **If not available:** falls back to `simple_blank_png(1040, 1471)` — a pure-Python white PNG built from raw zlib-compressed pixel data (no external dependencies)
   - For each page:
     - Resizes the PIL image to exactly 1040 px wide using LANCZOS resampling, preserving aspect ratio → `height ≈ 1471`
     - Saves PNG bytes to a `ContentFile`
     - `page.image.save('document-42-page-1.png', ContentFile(png_bytes), save=False)` → Django storage writes the PNG
     - `page.save(update_fields=['width', 'height', 'image'])`

**Database rows created/updated:**

| Table | Row | Key fields |
|---|---|---|
| `documents_document` | id=42 | `status="ready"`, `page_count=2`, `processed_at=now()` |
| `documents_documentpage` | id=101 | `document=42`, `page_number=1`, `width=1040`, `height=1471`, `image="document-pages/document-42-page-1.png"` |
| `documents_documentpage` | id=102 | `document=42`, `page_number=2`, `width=1040`, `height=1471`, `image="document-pages/document-42-page-2.png"` |
| `documents_documentscan` | id=7 | `document=42`, `status="clean"` |

**Files on disk / MinIO after this step:**

```
documents/service-agreement.pdf          ← original PDF (unchanged)
document-pages/document-42-page-1.png   ← 1040×1471 px PNG, page 1
document-pages/document-42-page-2.png   ← 1040×1471 px PNG, page 2
```

**API response includes `rendered_pages[]`:**
```json
{
  "id": 42,
  "status": "ready",
  "page_count": 2,
  "pages": [
    { "id": 101, "page_number": 1, "width": 1040, "height": 1471,
      "image_url": "http://localhost:8003/media/document-pages/document-42-page-1.png" },
    { "id": 102, "page_number": 2, "width": 1040, "height": 1471,
      "image_url": "http://localhost:8003/media/document-pages/document-42-page-2.png" }
  ],
  "rendered_pages": [ ... same two objects ... ]
}
```

---

### Phase 3 — Form Builder: Drag Fields, Then Save

**User action:** Browser navigates to `/form-builder/?doc=42`. The Form Builder loads.

**Frontend on mount:**

1. Detects `?doc=42` URL param → fires `GET /api/v1/documents/42/` to load document + pages.
2. Renders the two `image_url` PNGs as the canvas backgrounds (no PDF.js needed — server images exist).
3. User has no existing template yet, so also calls `POST /api/v1/templates/` to create a blank template:
   ```
   POST /api/v1/templates/
   { "name": "Service Agreement", "organization": 1 }
   → { "id": 5, "status": "draft", "version": 0 }
   ```

**User drags fields:**

- Drags **Signature** onto page 1 at x=133, y=1040, size 374×104 → assigns to Party 1 (Seller)
- Drags **Signature** onto page 2 at x=133, y=200, size 374×104 → assigns to Party 2 (Buyer)
- Double-clicks "Party 1" tab → renames to "Seller"
- Double-clicks "Party 2" tab → renames to "Buyer"
- Clicks **Save**

**Frontend posts:**

```
POST /api/v1/templates/5/setup/
{
  "document": 42,
  "changelog": "Initial setup",
  "fields": [
    { "field_key": "seller-signature", "field_type": "signature", "label": "Seller Signature",
      "required": true, "party_key": "party-1",
      "page": 1, "x": 133, "y": 1040, "width": 374, "height": 104,
      "page_width": 1040, "page_height": 1471, "coordinate_basis": "page-pixels" },
    { "field_key": "buyer-signature", "field_type": "signature", "label": "Buyer Signature",
      "required": true, "party_key": "party-2",
      "page": 2, "x": 133, "y": 200, "width": 374, "height": 104,
      "page_width": 1040, "page_height": 1471, "coordinate_basis": "page-pixels" }
  ],
  "parties": [
    { "key": "party-1", "label": "Seller", "routing_order": 1 },
    { "key": "party-2", "label": "Buyer",  "routing_order": 2 }
  ]
}
```

**Backend — `TemplateViewSet.setup()` → `setup_template_version()` (atomic transaction):**

1. **Normalize fields:** `normalize_field_geometry()` is called on each field. Since `page_width` is already 1040, coordinates pass through unchanged — no scaling needed.
2. **Increment version:** `MAX(version_number)` on template 5's versions = 0 → `next_version = 1`.
3. **Update template:** `template.status = "active"`, `template.version = 1`. Saved.
4. **Create `TemplateVersion`:**
   ```python
   TemplateVersion.objects.create(
       template=template_5,
       version_number=1,
       document=document_42,
       field_schema={
           "source": "backend-service",
           "page_count": 2,
           "document_id": 42,
           "fields": [ <normalized field dicts> ]
       },
       workflow_schema={"stages": [{"key": "signer", "type": "signing", "order": 1}]},
       changelog="Initial setup",
       is_published=True,
       created_by=jesse
   )
   ```
5. **Create `TemplateParty` rows** (one per unique `party_key` in the fields):
   - `TemplateParty(template_version=v1, role_key="party-1", label="Seller", routing_order=1)`
   - `TemplateParty(template_version=v1, role_key="party-2", label="Buyer", routing_order=2)`
6. **Create `FormField` rows:**
   - `FormField(template=5, template_version=v1, party=seller_party, field_key="seller-signature", field_type="signature", page=1, x=133, y=1040, width=374, height=104, page_width=1040, page_height=1471)`
   - `FormField(template=5, template_version=v1, party=buyer_party, field_key="buyer-signature", field_type="signature", page=2, x=133, y=200, width=374, height=104, page_width=1040, page_height=1471)`

**Database rows created:**

| Table | Row | Key fields |
|---|---|---|
| `envelopes_template` | id=5 | `status="active"`, `version=1` |
| `envelopes_templateversion` | id=v1 | `template=5`, `version_number=1`, `document=42`, `field_schema={...}`, `is_published=True` |
| `envelopes_templateparty` | id=p1 | `template_version=v1`, `role_key="party-1"`, `label="Seller"`, `routing_order=1` |
| `envelopes_templateparty` | id=p2 | `template_version=v1`, `role_key="party-2"`, `label="Buyer"`, `routing_order=2` |
| `envelopes_formfield` | id=f1 | `template=5`, `template_version=v1`, `party=p1`, `field_key="seller-signature"`, `page=1`, `x=133`, `y=1040` |
| `envelopes_formfield` | id=f2 | `template=5`, `template_version=v1`, `party=p2`, `field_key="buyer-signature"`, `page=2`, `x=133`, `y=200` |

**No new files are written.** The document PDF and page PNGs from Phase 2 are reused as-is.

---

### Phase 4 — Create Envelope from Template

**User action:** Back on the Templates list, clicks **Use** on the "Service Agreement" template and fills in the modal:

| Party | Name | Email | Routing order |
|---|---|---|---|
| Seller (party-1) | Jesse Tabali | jesse@example.com | 1 |
| Buyer (party-2) | Acme Corp Rep | rep@acme.com | 2 |

**Frontend posts:**

```
POST /api/v1/envelopes/create-from-template/
{
  "organization": 1,
  "template_version": "v1",
  "name": "Service Agreement — Acme Corp",
  "message": "Please review and sign.",
  "recipients": [
    { "party_key": "party-1", "name": "Jesse Tabali", "email": "jesse@example.com",
      "role": "signer", "routing_order": 1 },
    { "party_key": "party-2", "name": "Acme Corp Rep", "email": "rep@acme.com",
      "role": "signer", "routing_order": 2 }
  ]
}
```

**Backend — `create_envelope_from_template()` (atomic transaction):**

1. Validates both `party_key` values exist in the version's field schema — both present ✓.
2. Creates `Envelope` row: `status="draft"`.
3. Creates `Recipient` rows for each entry in `recipients`.
4. Creates `EnvelopeDocument` linking document 42 to the new envelope.
5. Copies each `FormField` from `version_fields(v1)` to envelope-scoped rows:
   - `normalize_field_geometry()` called again — coordinates unchanged (already canonical).
   - `party_key → recipient_instance` via the `party_map` dict built in step 1.
   - `document_page` FK set by matching `page_number` to existing `DocumentPage` rows.

**Database rows created:**

| Table | Row | Key fields |
|---|---|---|
| `envelopes_envelope` | id=99 | `status="draft"`, `template=5`, `template_version=v1`, `sender=jesse` |
| `envelopes_recipient` | id=r1 | `envelope=99`, `name="Jesse Tabali"`, `email="jesse@example.com"`, `role="signer"`, `routing_order=1` |
| `envelopes_recipient` | id=r2 | `envelope=99`, `name="Acme Corp Rep"`, `email="rep@acme.com"`, `role="signer"`, `routing_order=2` |
| `documents_envelopedocument` | id=ed1 | `envelope=99`, `document=42`, `order=1` |
| `envelopes_formfield` | id=ef1 | `envelope=99`, `recipient=r1`, `template_version=v1`, `document_page=101`, `field_key="seller-signature"`, `page=1`, `x=133`, `y=1040` |
| `envelopes_formfield` | id=ef2 | `envelope=99`, `recipient=r2`, `template_version=v1`, `document_page=102`, `field_key="buyer-signature"`, `page=2`, `x=133`, `y=200` |

**Still no new files.** All file references point back to the original upload in Phase 1 and the PNGs from Phase 2.

---

### Phase 5 — Send Envelope

**User action:** Opens the envelope detail and clicks **Send**.

**Frontend posts:**

```
POST /api/v1/envelopes/99/send/
```

**Backend — `EnvelopeViewSet.send()`:**

1. `EnvelopeStatusSerializer` validates the envelope has recipients, at least one signer, and at least one field.
2. `envelope.status → "sent"`, `envelope.sent_at = now()`. Saved.
3. `queue_envelope_invites(envelope=99, queued_by=jesse, request=request)`:
   - Loops through **routing_order=1** recipients only (Jesse — the seller):
     - `SigningSession.objects.get_or_create(envelope=99, recipient=r1)` → creates session with random UUID token, e.g. `token="abc-123-..."`, `status="created"`
     - Builds signing URL: `https://app.hanmak.io/sign/abc-123-...`
     - Creates `EmailMessage` row: `to="jesse@example.com"`, `kind="envelope_invite"`, `subject="Jesse Tabali sent you Service Agreement — Acme Corp for signature"`
   - Routing order 2 (Acme) is **not** invited yet — they wait until Jesse finishes.
4. For each `EmailMessage`, `deliver_email_message_task.apply_async(args=[message.id], queue='email')` is called → Celery picks it up and delivers the SMTP message.

**Database rows created:**

| Table | Row | Key fields |
|---|---|---|
| `signing_signingsession` | id=s1 | `envelope=99`, `recipient=r1`, `token="abc-123-..."`, `status="created"` |
| `messaging_emailmessage` | id=em1 | `to="jesse@example.com"`, `kind="envelope_invite"`, `body contains signing URL` |

---

### Phase 6 — Jesse (Seller) Signs

**Jesse's action:** Receives the email, clicks the link, opens `https://app.hanmak.io/sign/abc-123-...`.

**Frontend on mount (`PublicSigning.jsx`):**

```
GET /api/v1/sign/abc-123.../
```

**Backend — `PublicSigningSessionView.get()`:**

- Token `"abc-123-..."` found → session s1 ✓
- Feature flag `public_signing` enabled ✓
- `expires_at` is null → not expired ✓
- Status is `"created"` → transitions to `"opened"`:
  - `session.status = "opened"`, `session.opened_at = now()`, `session.ip_address = "203.0.113.5"`, `session.user_agent = "Mozilla/5.0..."`. Saved.

**Response payload includes:**
- `fields[]`: ef1 only (seller-signature, `required: true`, `page: 1`, `x: 133`, `y: 1040`)
- `documents[]`: `[{ document_detail: { id: 42, file_url: "...", pages: [{page_number:1, image_url:"...page-1.png"}, {page_number:2, image_url:"...page-2.png"}] } }]`

**Frontend renders:**
- Page 1 background image loaded from `image_url` (PNG served from local media or MinIO)
- Signature field overlay appears at x=133, y=1040 (yellow outline — unfilled)
- Page 2 background also shown, but no fields appear there for Jesse
- Right panel shows "seller-signature — required — Click to Sign"

**Jesse signs:**
- Clicks the field → Signature Modal opens
- Chooses "Type" tab → types "Jesse Tabali" → picks "Dancing Script" font → clicks "Apply Signature"
- `fieldValues["ef1"] = { type: "typed", name: "Jesse Tabali", font: "Dancing Script", color: "#0f172a" }`
- Overlay turns green and shows the typed name in the cursive font
- Progress bar shows 1/1 (100%) — Submit button enabled

**Jesse submits:**

```
POST /api/v1/sign/abc-123.../
{
  "field_values": [
    { "field_key": "seller-signature",
      "value": "[TYPED:Jesse Tabali|Dancing Script|#0f172a]" }
  ],
  "signature": {
    "signature_type": "typed",
    "typed_name": "Jesse Tabali",
    "metadata": {}
  }
}
```

**Backend — `PublicSigningSessionView.post()`:**

1. Idempotency check: status is `"opened"` → not already submitted ✓
2. Not a decline or delegate action ✓
3. **Creates `ConsentRecord`:** `{ envelope=99, recipient=r1, session=s1, consent_text="Accepted electronic signature consent.", ip_address="203.0.113.5" }`
4. **Creates `Signature`:** `{ envelope=99, recipient=r1, session=s1, signature_type="typed", typed_name="Jesse Tabali" }`
5. **Validates required fields:** ef1 (`seller-signature`, required=True) → value `"[TYPED:...]"` is non-empty ✓
6. **Upserts `EnvelopeFieldValue`:** `update_or_create(envelope=99, recipient=r1, field_key="seller-signature", defaults={ field=ef1, value="[TYPED:Jesse Tabali|Dancing Script|#0f172a]" })`
7. **Status transitions:** `session.status → "submitted"`, `recipient.status → "signed"`, `recipient.signed_at = now()`
8. **Completion check:** Active non-CC non-DELEGATED recipients: r1 (signed ✓) and r2 (not signed). Not all signed yet.
9. `envelope.status → "partially_signed"`. Saved.
10. **Routing-order check:** All routing_order=1 recipients (just r1) now signed → call `queue_envelope_invites()` for routing_order=2:
    - `SigningSession.objects.get_or_create(envelope=99, recipient=r2)` → creates session s2 with token `"xyz-456-..."`
    - Creates `EmailMessage` em2 for Acme Corp Rep with signing URL `https://app.hanmak.io/sign/xyz-456-...`
    - `deliver_email_message_task.apply_async(args=[em2.id], queue='email')` → Celery delivers the email

**Database rows created/updated:**

| Table | Row | Action |
|---|---|---|
| `signing_consentrecord` | id=cr1 | Created: `envelope=99, recipient=r1` |
| `signing_signature` | id=sig1 | Created: `typed_name="Jesse Tabali"` |
| `signing_envelopefieldvalue` | id=fv1 | Created: `field_key="seller-signature"`, `value="[TYPED:...]"` |
| `signing_signingsession` | id=s1 | Updated: `status="submitted"`, `submitted_at=now()` |
| `envelopes_recipient` | id=r1 | Updated: `status="signed"`, `signed_at=now()` |
| `envelopes_envelope` | id=99 | Updated: `status="partially_signed"` |
| `signing_signingsession` | id=s2 | Created: `recipient=r2`, `token="xyz-456-..."`, `status="created"` |
| `messaging_emailmessage` | id=em2 | Created: invite email for Acme Corp Rep |

---

### Phase 7 — Acme Corp Rep (Buyer) Signs

Acme receives the email, opens `https://app.hanmak.io/sign/xyz-456-...`. The same flow as Phase 6 repeats:

- Session s2 transitions `"created" → "opened"`, IP and user agent recorded
- Response includes ef2 only (`buyer-signature`, page 2)
- Acme draws their signature on the canvas → clicks Apply
- Submits

**Backend post():**

1. All previous steps repeated for s2/r2/ef2.
2. **Completion check:** Active recipients: r1 (signed ✓), r2 (signed ✓). **All signed!**
3. `envelope.status → "completed"`, `envelope.completed_at = now()`. Saved.
4. `queue_completion_emails(envelope=99, queued_by=jesse, request=request)` → creates completion `EmailMessage` rows for every participant (Jesse, Acme, plus any CC recipients).
5. Each email is sent via `deliver_email_message_task.apply_async(...)`.

**Database rows created/updated:**

| Table | Row | Action |
|---|---|---|
| `signing_consentrecord` | id=cr2 | Created for Acme |
| `signing_signature` | id=sig2 | Created: `signature_type="drawn"`, `metadata={"dataUrl": "data:image/png;base64,..."}` |
| `signing_envelopefieldvalue` | id=fv2 | Created: `field_key="buyer-signature"`, `value="data:image/png;base64,..."` |
| `signing_signingsession` | id=s2 | Updated: `status="submitted"` |
| `envelopes_recipient` | id=r2 | Updated: `status="signed"` |
| `envelopes_envelope` | id=99 | Updated: `status="completed"`, `completed_at=now()` |
| `messaging_emailmessage` | id=em3, em4 | Created: completion emails for Jesse and Acme |

---

### Phase 8 — Download the Signed PDF

Either signer clicks **Download Signed PDF** on their completed signing page.

**Frontend:**

```js
apiClient.get('/api/v1/sign/abc-123.../download/', { responseType: 'blob' })
```

Note: this uses the Axios instance (which sends `Authorization: Bearer ...` even for the public endpoint) and stores the result as a `Blob` — not `window.open()`, which would strip the auth header.

**Backend — `PublicSigningDownloadView.get()`:**

1. Looks up session by token `"abc-123-..."` → envelope 99, `status="completed"` ✓
2. Calls `build_signed_pdf(envelope=99)` from `evidence/pdf.py`:
   - **Primary path — `build_image_overlay_pdf()`:**
     - Fetches all `DocumentPage` rows for document 42 (pages 101, 102) — each has a stored `.image` PNG
     - For each page, opens the PNG as a Pillow image
     - Queries all `EnvelopeFieldValue` rows for envelope 99:
       - fv1: `field_key="seller-signature"`, field ef1 stored at page=1, x=133, y=1040, w=374, h=104
       - fv2: `field_key="buyer-signature"`, field ef2 stored at page=2, x=133, y=200, w=374, h=104
     - `field_geometry_for_page(field, page_width=1040, page_height=1471)` converts coordinates from top-left browser basis to bottom-left PDF basis (flips Y)
     - For ef1 (typed signature): renders "Jesse Tabali" in Dancing Script font at the scaled position using PIL's `ImageDraw` + `ImageFont`
     - For ef2 (drawn signature): decodes the base-64 PNG from `sig2.metadata["dataUrl"]` → pastes onto page 2 at the field position
     - Each annotated page image is added to a PDF using `reportlab` `ImageReader`
     - Returns `(pdf_bytes, metadata_dict)`
   - **Fallback path — `build_stamped_source_pdf()`:** (only if page images are missing)
     - Opens `service-agreement.pdf` from storage
     - Creates a `reportlab` canvas at each page's exact `mediabox` dimensions
     - Draws field values as text/image overlays
     - Merges via `pypdf` `merge_page()`
3. Returns `HttpResponse(pdf_bytes, content_type='application/pdf')` with `Content-Disposition: attachment; filename="signed-99.pdf"`

**Frontend:**

```js
const url = URL.createObjectURL(res.data);   // res.data is the Blob
const a = document.createElement('a');
a.href = url;
a.download = 'signed-document.pdf';
a.click();
URL.revokeObjectURL(url);
```

The browser downloads `signed-document.pdf` — a two-page PDF with Jesse's typed signature on page 1 and Acme's drawn signature on page 2, both positioned exactly where the fields were placed in Form Builder.

---

### Complete File Inventory After the Full Flow

```
media/
  documents/
    service-agreement.pdf            ← Phase 1: original upload (never modified)

  document-pages/
    document-42-page-1.png           ← Phase 2: 1040×1471 server-rendered page 1
    document-42-page-2.png           ← Phase 2: 1040×1471 server-rendered page 2
```

That is the **entire file footprint**. The template setup (Phase 3), envelope creation (Phase 4), signing (Phases 6–7), and PDF download (Phase 8) all reuse these three files — they do not write any new files. The signed PDF is generated on-the-fly from the page PNGs + field values stored in the database.

---

### Complete Database Row Inventory

| Phase | Table | Rows created |
|---|---|---|
| 1 — Upload | `documents_document` | 1 (doc 42) |
| 2 — Prepare | `documents_documentpage` | 2 (pages 101, 102) |
| 2 — Prepare | `documents_documentscan` | 1 (scan 7, status=clean) |
| 3 — Template | `envelopes_template` | 1 (template 5, status=draft→active) |
| 3 — Template | `envelopes_templateversion` | 1 (v1, stores full field_schema JSON) |
| 3 — Template | `envelopes_templateparty` | 2 (Seller party-1, Buyer party-2) |
| 3 — Template | `envelopes_formfield` | 2 (template-scoped: f1, f2) |
| 4 — Envelope | `envelopes_envelope` | 1 (env 99, status=draft) |
| 4 — Envelope | `envelopes_recipient` | 2 (r1=Jesse, r2=Acme) |
| 4 — Envelope | `documents_envelopedocument` | 1 (links doc 42 ↔ env 99) |
| 4 — Envelope | `envelopes_formfield` | 2 (envelope-scoped: ef1, ef2; copies of f1, f2) |
| 5 — Send | `signing_signingsession` | 1 (s1 for Jesse, routing_order=1) |
| 5 — Send | `messaging_emailmessage` | 1 (em1 — invite to Jesse) |
| 6 — Jesse signs | `signing_consentrecord` | 1 (cr1) |
| 6 — Jesse signs | `signing_signature` | 1 (sig1, typed) |
| 6 — Jesse signs | `signing_envelopefieldvalue` | 1 (fv1, seller-signature value) |
| 6 — Jesse signs | `signing_signingsession` | 1 (s2 for Acme, routing_order=2) |
| 6 — Jesse signs | `messaging_emailmessage` | 1 (em2 — invite to Acme) |
| 7 — Acme signs | `signing_consentrecord` | 1 (cr2) |
| 7 — Acme signs | `signing_signature` | 1 (sig2, drawn) |
| 7 — Acme signs | `signing_envelopefieldvalue` | 1 (fv2, buyer-signature value) |
| 7 — Acme signs | `messaging_emailmessage` | 2 (em3 em4 — completion to Jesse + Acme) |

**Total: 3 files + 29 database rows for a complete two-signer signing flow.**

---

## 5. Related Documentation

| Document | Contents |
|---|---|
| `docs/USER_GUIDE.md` | Task-oriented guide for operators, signers, and reviewers (cross-references Sections 1, 2, and 7 of this document) |
| `docs/DEVELOPER_GUIDE.md` | Architecture, API patterns, testing, rate limiting, CI (Sections 8 and 8.1 reference this document) |
| `docs/REACT_FRONTEND_ARCHITECTURE.md` | React component tree, routing, data-fetching conventions, bundle splitting |
| `docs/FRONTEND_BACKEND_HOOKUP_AUDIT.md` | Per-endpoint wiring audit and change log |
| `docs/DEPLOYMENT_HARDENING_RUNBOOK.md` | Security headers, rate limits, production env vars |
| `docs/MVP_READINESS_CHECKLIST.md` | Gates required before removing the vanilla JS prototype |

---

## 6. How Workflow Builder Relates to Templates and Envelopes

The Workflow Builder is a **post-signing orchestration layer**. It does not replace Templates or Envelopes — it wraps around an already-sent envelope to coordinate the human steps that must happen after (or alongside) signing.

### 6.1 The Conceptual Boundary

```
Template ──► TemplateVersion ──► Envelope ──► Signing
                                      │
                                      └──► WorkflowRun ──► WorkflowStage (×N)
                                                │
                                                └──► WorkflowEvent (audit trail)
```

- A **Template** defines what the document looks like and which parties sign which fields.
- An **Envelope** is a single sending of that template to specific recipients.
- A **WorkflowRun** attaches to the **Envelope** (not to the Template) to orchestrate stages such as legal review, manager approval, or compliance sign-off that the signing system alone cannot model.

The three systems are intentionally decoupled. You can send an envelope without ever creating a workflow run. You can define a workflow without it ever being tied to a specific template. This separation lets you apply the same workflow definition to many different templates' envelopes.

### 6.2 The Data Relationship in Detail

#### Template side — `TemplateVersion.workflow_schema`

`TemplateVersion` has a `workflow_schema` JSON field:

```python
# Example value — informational only
{'stages': [{'key': 'signer', 'type': 'signing', 'order': 1}]}
```

**This is a hint, not a foreign key.** There is no FK from `TemplateVersion` to `WorkflowDefinition`. The `workflow_schema` field is informational metadata that a front-end or integration could use to pre-populate a workflow run, but HanMak does NOT currently read this field to auto-start a workflow run when an envelope is created or sent. It exists as a schema anchor for future automation.

#### Envelope side — `WorkflowRun.envelope`

The only hard database link between envelopes and workflows is:

```python
class WorkflowRun(models.Model):
    envelope = models.ForeignKey(Envelope, related_name='workflow_runs', on_delete=models.CASCADE)
    workflow = models.ForeignKey(WorkflowDefinition, related_name='runs', ...)
```

One envelope can have multiple `WorkflowRun` rows. There is no uniqueness constraint preventing this — it is the manager's responsibility to avoid duplicate runs.

#### Organisation scoping

Both `WorkflowDefinition` and `Envelope` belong to an `Organization`. The `WorkflowRunSerializer.validate()` enforces that both belong to the **same organisation** before a run can be created:

```python
if envelope.organization_id != workflow.organization_id:
    raise serializers.ValidationError(
        'Workflow and envelope must belong to the same organization.'
    )
```

### 6.3 What Does NOT Happen Automatically

| Event | Auto-triggers workflow run? | Auto-advances stage? |
|---|---|---|
| Envelope created from template | ❌ No | — |
| Envelope sent | ❌ No | — |
| Recipient signs | ❌ No | ❌ No |
| All recipients sign (envelope completed) | ❌ No | ❌ No |
| Approval approved | ❌ No | ❌ No |

Nothing in the signing or approval system signals the workflow engine. All state changes require a manager to call `POST /api/v1/workflow-runs/<id>/advance/` explicitly. This is a deliberate design choice: the workflow engine is a human coordination tool, not an event-driven pipeline.

### 6.4 What Templates Contribute to a Workflow

When you create an envelope from a template and then start a workflow run on that envelope, the template contributes indirectly:

- The **document identity** (which PDF pages are in the envelope) flows through `DocumentPage` rows that are already rendered by the time the workflow starts.
- The **field values** submitted by signers (stored in `EnvelopeFieldValue`) are queryable during workflow review stages using the `GET /api/v1/envelopes/<id>/` endpoint.
- The **routing order** of signers (from `TemplateParty.routing_order`) means signing finishes in a defined sequence before a manager starts advancing workflow stages.

The template itself is not queried at workflow-run time. The `WorkflowRun` and `WorkflowStage` logic cares only about the `Envelope` FK and the `WorkflowDefinition.stages` ordered list.

### 6.5 Intended Use Pattern

The intended pattern for combining Templates, Envelopes, and Workflows is:

```
1. Define template (Template → TemplateVersion → FormFields + Parties)
2. Send envelope (Template → Envelope → SigningSessions → Emails)
3. Recipients sign (Envelope status → "completed" or "partially_signed")
4. Manager creates workflow run (WorkflowRun links envelope ↔ workflow)
5. Manager advances stages as each human step completes
6. Workflow run completes (status → "completed", WorkflowEvent recorded)
```

Steps 1–3 happen in Templates/Envelopes/Signing. Steps 4–6 happen entirely in Workflow Builder.

---

## 7. Workflow Builder — Implementation Reference

### 7.1 The Data Model

| Model | Table | Purpose |
|---|---|---|
| `WorkflowDefinition` | `workflow_workflowdefinition` | The reusable template for a process: name, status, org owner, schema JSON, created_by |
| `WorkflowStage` | `workflow_workflowstage` | One ordered step within a definition: key (slug), label, stage_type, order, config JSON |
| `WorkflowRun` | `workflow_workflowrun` | A live execution of a definition against one envelope: current_stage_key, status, started_at, completed_at |
| `WorkflowEvent` | `workflow_workflowevent` | Immutable audit log: one row per state change, stores actor, message, metadata, timestamp |

#### WorkflowDefinition fields

| Field | Type | Notes |
|---|---|---|
| `organization` | FK → Organization | Tenant scoping — all queries filtered to user's org |
| `name` | CharField(255) | Unique per org (`unique_together`) |
| `description` | TextField | Optional |
| `status` | choices: `draft` / `active` / `archived` | Only `active` definitions can start runs |
| `schema` | JSONField | Mirrors all stages as a JSON snapshot; updated atomically by `replace_stages` |
| `created_by` | FK → User (nullable) | Set to request.user on create; set_null on user deletion |

#### WorkflowStage fields

| Field | Type | Notes |
|---|---|---|
| `workflow` | FK → WorkflowDefinition | Parent definition |
| `key` | SlugField | Unique per workflow (`unique_together`); auto-derived from label if not provided |
| `label` | CharField(255) | Human-readable name shown in UI |
| `stage_type` | CharField(80) | `signing`, `approval`, `review`, `notification`, or `condition` |
| `order` | PositiveIntegerField | Unique per workflow; defines advancement sequence |
| `config` | JSONField | Arbitrary per-stage config including `assignee_user`, `assignee_team` |

#### WorkflowRun fields

| Field | Type | Notes |
|---|---|---|
| `envelope` | FK → Envelope (CASCADE) | The envelope this run is orchestrating |
| `workflow` | FK → WorkflowDefinition (SET_NULL) | The definition being executed; nullable so runs survive if definition is deleted |
| `status` | choices: `running` / `completed` / `failed` / `cancelled` | |
| `current_stage_key` | CharField(120) | The `key` of the stage currently being processed; blank = not yet at any stage |
| `started_at` | DateTimeField | Auto-set on creation |
| `completed_at` | DateTimeField (nullable) | Set when status → completed/failed/cancelled |

#### WorkflowEvent fields

| Field | Type | Notes |
|---|---|---|
| `run` | FK → WorkflowRun | Parent run |
| `envelope` | FK → Envelope | Denormalised for quick audit queries without joining through WorkflowRun |
| `event_type` | CharField(100) | e.g. `workflow.stage_advanced`, `workflow.completed` |
| `stage_key` | CharField(120) | The stage key at the time of the event |
| `actor` | FK → User (nullable, SET_NULL) | The user who triggered the event |
| `message` | TextField | Human-readable description of what happened |
| `metadata` | JSONField | Arbitrary payload passed in the advance request body |

### 7.2 API Endpoints

All endpoints are under `/api/v1/` and gated by the `workflow_builder` feature flag. Requests to these endpoints return 403 if the flag is disabled.

#### WorkflowDefinition

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/workflow-definitions/` | List all definitions for the org (includes nested stages) |
| `POST` | `/workflow-definitions/` | Create a new draft definition |
| `GET` | `/workflow-definitions/<id>/` | Retrieve one definition |
| `PATCH` | `/workflow-definitions/<id>/` | Update name, description, status directly |
| `DELETE` | `/workflow-definitions/<id>/` | Delete definition (admin only) |
| `POST` | `/workflow-definitions/<id>/activate/` | Validate and move status → `active` |
| `POST` | `/workflow-definitions/<id>/archive/` | Move status → `archived` |
| `POST` | `/workflow-definitions/<id>/simulate/` | Run validation and return result without changing status |
| `POST` | `/workflow-definitions/<id>/replace-stages/` | Atomically replace all stages: deletes existing, creates new list |

#### WorkflowRun

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/workflow-runs/` | List all runs for the org, newest first |
| `POST` | `/workflow-runs/` | Create a new run (must supply `workflow` + `envelope`) |
| `GET` | `/workflow-runs/<id>/` | Retrieve one run |
| `POST` | `/workflow-runs/<id>/advance/` | Move to the next stage; complete if no next stage |

#### WorkflowEvent

| Method | URL | Purpose |
|---|---|---|
| `GET` | `/workflow-events/` | List all events for the org |
| `GET` | `/workflow-events/<id>/` | Retrieve one event |

Write operations on events are restricted to `ADMIN` / `MANAGER` roles.

### 7.3 Validation Rules

The backend enforces these rules before any operation:

#### On activation (`/activate/` or `simulate()`)

| Rule | Error if violated |
|---|---|
| Workflow `name` must be non-empty | `'Workflow name is required.'` |
| At least one stage must exist | `'At least one workflow stage is required.'` |
| All stage `key` values must be unique within the workflow | `'Stage keys must be unique.'` |
| All stage `order` values must be unique within the workflow | `'Stage order values must be unique.'` |
| First stage type should be a standard type | Warning (not blocking): `'First stage uses an uncommon type.'` |
| Workflow should have at least one human-action stage | Warning (not blocking): `'Workflow has no human action stage.'` |

#### On run creation (`WorkflowRunSerializer.validate()`)

| Rule | Error if violated |
|---|---|
| Envelope and workflow must belong to the same org | `'Workflow and envelope must belong to the same organization.'` |
| Workflow must have `status == "active"` | `'Only active workflows can be started.'` |
| If `current_stage_key` is supplied, it must be a key that exists in the workflow | `'Choose a stage that belongs to this workflow.'` |

#### On advance (`WorkflowRunViewSet.advance()`)

| Rule | Error if violated |
|---|---|
| Run status must be `"running"` | `'Workflow run is <status>.'` (400) |

### 7.4 The Advance Mechanism — Exactly What Happens

When `POST /api/v1/workflow-runs/<id>/advance/` is called:

1. Load the run. If `status != "running"`, return 400.
2. Load the workflow's stages ordered by `order`.
3. Find `current_index` = the position in that list where `stage.key == run.current_stage_key`. If `current_stage_key` is blank (run was just created), `current_index` resolves to `-1`.
4. `next_stage = stages[current_index + 1]` if it exists; otherwise `None`.
5. **If `next_stage` exists:**
   - Set `run.current_stage_key = next_stage.key`. Save.
   - Record `WorkflowEvent(event_type='workflow.stage_advanced', stage_key=next_stage.key, message=…)`.
6. **If no next stage (at the end):**
   - Set `run.status = "completed"`, `run.completed_at = now()`. Save.
   - Record `WorkflowEvent(event_type='workflow.completed', …)`.
7. Return the updated run serialized.

The first advance call moves from "not started" (`current_index = -1`) to `stages[0]`. The second call moves to `stages[1]`. And so on until the list is exhausted.

**Important:** The `advance` endpoint accepts any authenticated admin or manager. It does not check `config.assignee_user` or `config.assignee_team`. Those fields are advisory labels displayed in the UI; they do not gate access.

### 7.5 The `replace_stages` Action — Exactly What Happens

When `POST /api/v1/workflow-definitions/<id>/replace-stages/` is called with a `stages` list:

1. Open an atomic database transaction.
2. Delete **all** existing `WorkflowStage` rows for this workflow.
3. For each item in the `stages` list (in order):
   - Derive `label` (default: `"Stage N"`).
   - Derive `key` from the label (slugified, lowercased, non-alphanumeric → `_`; duplicate keys get `_N` suffix).
   - Create a `WorkflowStage` row.
4. Mirror the new stage list into `workflow.schema['stages']` JSON and save.
5. Commit the transaction.

This is fully atomic: either all stages are replaced or none are. There is no partial state.

### 7.6 Stage Types

| Type | Meaning | Typical use |
|---|---|---|
| `signing` | A human recipient must sign | First stage — map to the signing phase |
| `approval` | A manager must approve the completed envelope | Second stage — legal or managerial sign-off |
| `review` | A reviewer reads but does not necessarily approve | Compliance or audit review gate |
| `notification` | A step that represents an outbound alert or notification | Post-completion notification gate |
| `condition` | A branching step (not yet auto-evaluated; manual advance still required) | Future conditional routing |

Stage types are stored as free-text strings; only the validation warning references the set above. Custom types are accepted by the backend.

### 7.7 The Feature Flag

The Workflow Builder is release-controlled via the key `workflow_builder`. All four viewsets (`WorkflowDefinitionViewSet`, `WorkflowStageViewSet`, `WorkflowRunViewSet`, `WorkflowEventViewSet`) carry `feature_flag_key = 'workflow_builder'`. Any request to these endpoints returns 403 if the flag is disabled in Release Control.

**To enable:** Developer → Release Control → find `workflow_builder` → Enable (or Release to 100%).

### 7.8 The React UI — WorkflowBuilder.jsx

The single-page `WorkflowBuilder` component provides:

| UI Element | What it does |
|---|---|
| Stats bar | Shows total workflows, active workflows, total stages across all workflows, running runs |
| Workflow card grid | Lists all definitions with status badges, stage count, created-by, created-at |
| **New Workflow** modal | Name + description + default two-stage starter list; creates definition then immediately calls `replace-stages` to persist the stages |
| Edit Drawer | Add / remove / reorder stages; set `assignee_user` and `assignee_team` per stage; Save Stages calls `replace-stages`; Activate / Archive buttons |
| **New Run** modal | Dropdown filtered to `status=sent` envelopes only; submits `{ workflow: <id>, envelope: <id> }` to `/workflow-runs/` |
| Recent Runs table | Shows `envelope`, `workflow`, `status`, `current_stage_key`, `started_at` |
| Advance button (per run row) | Posts to `/workflow-runs/<id>/advance/` |

Data is fetched on mount for: workflows, workflow-runs, users (for assignee dropdowns), teams (for assignee dropdowns), and envelopes filtered to `status=sent`.

### 7.9 Full Happy-Path Walkthrough

```
1.  Developer → Release Control → Enable "workflow_builder"

2.  Workflow Builder → New Workflow
      name: "Enterprise Signing Process"
      stages:
        - label: "Signer Review",     stage_type: "signing",  order: 1
        - label: "Manager Approval",  stage_type: "approval", order: 2
        - label: "Legal Sign-off",    stage_type: "review",   order: 3

3.  Edit Drawer → Activate
      POST /workflow-definitions/<id>/activate/
      → status: "active"

4.  Templates → Create Envelope → Send
      → Envelope status becomes "sent"
      → Signing session emails delivered to recipients

5.  Recipients sign (public signing flow)
      → Envelope status becomes "completed" (or "partially_signed" if sequential)

6.  Workflow Builder → New Run
      → Choose "Enterprise Signing Process" (active)
      → Choose the sent/completed envelope
      POST /workflow-runs/
      → WorkflowRun created: status="running", current_stage_key=""

7.  Advance to Stage 1 (Signer Review)
      POST /workflow-runs/<run_id>/advance/
      → current_stage_key = "signer_review"
      → WorkflowEvent recorded: event_type="workflow.stage_advanced"

8.  Human review complete. Advance to Stage 2 (Manager Approval)
      POST /workflow-runs/<run_id>/advance/
      → current_stage_key = "manager_approval"
      → WorkflowEvent recorded

9.  Approval given. Advance to Stage 3 (Legal Sign-off)
      POST /workflow-runs/<run_id>/advance/
      → current_stage_key = "legal_sign_off"
      → WorkflowEvent recorded

10. Legal complete. Advance past final stage.
      POST /workflow-runs/<run_id>/advance/
      → status = "completed", completed_at = now()
      → WorkflowEvent recorded: event_type="workflow.completed"
```

### 7.10 Known Design Limitations

| Limitation | Detail |
|---|---|
| **Manual progression only** | No signing, approval, or system event auto-triggers stage advancement. Every advance requires an explicit API call |
| **Assignees are advisory** | `config.assignee_user` / `config.assignee_team` are stored and displayed but not enforced by the advance endpoint |
| **No auto-start** | Creating an envelope — even from a template with `workflow_schema` — does NOT automatically create a `WorkflowRun` |
| **No duplicate-run guard** | Multiple `WorkflowRun` rows can exist for the same envelope simultaneously; no uniqueness constraint prevents this |
| **No stage branching** | The `condition` stage type is accepted but not evaluated; advancement is always linear (`current_index + 1`) |
| **WorkflowRun survives definition deletion** | `workflow` FK is `SET_NULL` — a run whose definition was deleted continues to show `workflow: null` but retains its `current_stage_key` and event history |
