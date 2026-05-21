# HanMak User Guide

This guide explains how to use the HanMak mock/live application as an operator, administrator, signer, or reviewer.

## 1. Accessing HanMak

In Docker development, open:

```text
http://127.0.0.1:8080/mock/
```

Demo credentials:

```text
admin / admin123
```

The mock frontend connects to:

```text
http://127.0.0.1:8080/api/v1
```

If you are using a different API URL, open the browser console and run:

```js
localStorage.setItem('HANMAK_API_BASE_URL', 'http://127.0.0.1:8080/api/v1')
location.reload()
```

## 2. Release Control

Use **Developer → Release Control** as the control panel for feature rollout.

Release Control lets you:

- Seed all current HanMak feature controls.
- Enable or disable individual features.
- Move features through `Planned`, `Internal QA`, `Beta`, `Released`, `Paused`, and `Retired`.
- Set rollout percentage.
- Assign an owner.
- Maintain QA checklist items.
- Store release notes.
- Release a feature to 100%.

Current controllable features include:

- Dashboard
- Inbox / My Tasks
- Profile & Security
- Login & Account Setup
- Envelopes
- Public Signing
- Signing Sessions Admin
- Templates
- Form Builder
- File Library
- Workflow Builder
- Approval Queue
- API Docs
- API Keys
- OAuth Apps
- Webhook Lab
- SDK / CLI
- Test Lab
- Email Messages
- Users
- Organizations
- Teams
- Roles & Permissions
- Background Tasks
- System Health
- General Settings
- Branding Settings
- Email / SMTP Settings
- Storage Settings
- Security Settings
- Notification Settings
- SSO / SCIM / LDAP
- Audit Evidence
- Legal Holds
- Retention Policies
- Data Residency
- Compliance Exports
- Usage & Billing
- License
- Roadmap
- Operations Console
- Release Control

When Release Control opens, it automatically seeds the default controls if none exist yet. After that, the mock router caches the release flags locally. If a page is disabled, paused, retired, planned, or internal-only, the app shows a feature-gated screen instead of the feature page. Release Control itself remains accessible so you can recover from disabled states.

Backend APIs also enforce selected release flags for tenant-scoped features. For example, disabling Workflow Builder blocks `/api/v1/workflows/`, disabling Public Signing blocks signer-link access, and disabling Billing blocks billing usage endpoints.

## 3. Dashboard And Inbox

Use **Dashboard** for the main operational overview:

- Completion metrics
- Pending tasks
- Recent activity in a scrollable audit-backed list with load-more paging
- Webhook/API summaries
- Quick actions

Use **Inbox / My Tasks** to act on assigned work:

- Signing tasks
- Approval tasks
- Search, document/task, priority, and status-tab filtering
- Checkbox selection and bulk mark-read, snooze, retry, and cancel actions
- Delegation actions
- Snooze / mark-read actions
- Failed task links into Background Tasks
- Retry, cancel, or delete failed background tasks assigned to you
- Completed task history for recently signed, approved, rejected, or cancelled items

Signing tasks only appear for the signer email assigned to that recipient. Delegated approvals appear in the delegate's inbox, and the original approval leaves the pending approval queue once delegated.
Approval and signing inbox rows are workflow actions. Failed background-task rows are administrative task-run records and can be deleted after review.

## 4. Templates And Form Builder

Use **Templates** to manage reusable document templates.

Typical flow:

1. Open **Templates**.
2. Create or edit a template.
3. Open **Form Builder**.
4. Upload a PDF/document, open a File Library document in the builder, or use the sample.
5. Drag fields onto the document.
6. Assign fields to Party 1, Party 2, Party 3, or a custom party key.
7. Save the template.

Field placement is page-aware. Dragged and resized fields are kept inside the current page, and saved templates preserve the page size plus normalized coordinates so envelopes and public signing links render the fields in the same location. HanMak renders stored page previews on a fixed 1040px-wide coordinate basis; A4-style fallback pages are about 1471px tall, while uploaded pages keep their aspect ratio. Each field stores the exact page width and height basis used when it was placed, so downloaded signed PDFs use the same placement basis as the browser preview.
Use **Preview** in the Form Builder toolbar to open a signer-style preview of the current unsaved field layout, including date picker, dropdown, radio group, signature, initials, checkbox, and attachment controls.

**Resizing fields:** Click a field to select it, then drag any of the four corner handles (square dots at the corners) to resize it. The opposite corner stays pinned.

**Renaming parties:** Double-click a party tab (e.g. "Party 1") in the top bar to rename it inline. Press Enter or click away to confirm; press Escape to cancel. Custom party names are saved with the template and reflected in envelope creation (e.g. "Buyer", "Seller").

Supported field types include:

- Text
- Textarea
- Number
- Email
- Date picker
- Dropdown/select
- Radio Group (multiple-choice; options are configurable in the inspector)
- Checkbox
- Signature
- Initials
- Attachment upload

Attachment fields let a signer upload a file during signing. After submission, the attachment is visible from the completed signing page and the envelope detail drawer. When a signed PDF is generated, signer attachments are appended to the end of the artifact with a metadata cover page; uploaded PDF attachments are appended as pages when PDF tooling is available.
Signature fields follow the allowed methods chosen in Form Builder, so a signer only sees the typed, drawn, or uploaded-image options that were enabled on the template field.

Template actions include editing metadata, opening the Form Builder, creating an envelope from a template, duplicating a template, archiving, activating, deleting from the row or details modal, and quick setup for templates that do not yet have a document/version.

> **How it works under the hood:** For a full technical explanation of how template creation, versioning, field geometry normalization, and envelope creation from a template work end-to-end, see `docs/HOW_IT_WORKS.md` — Section 1.

## 4.1 File Library

Use **File Library** to manage reusable source documents before they become templates or envelope attachments.

Available actions include upload, search, status filtering, sorting, rename, duplicate, process, scan, render PNG pages, preview/download, delete, and **Open in Form Builder**. Opening a library document in the builder prepares page previews on the backend, loads the rendered pages into the builder canvas, and lets you save the document as a reusable template without uploading it again.

Delete operations can be blocked by permissions or active legal holds. When that happens, the UI now shows the backend reason instead of leaving the action looking like it did nothing.

## 5. Envelopes

Use **Envelopes** to create, send, track, and manage signing packages.

Common actions:

- Create envelope from a template.
- Assign recipients to template parties.
- Send envelope.
- Remind recipients.
- Void envelope.
- Bulk send, void, or delete draft envelopes.
- Open the envelope drawer for details.
- View signer-uploaded attachments.
- Generate signed PDFs.
- Open related documents and email records.

Envelope sending now checks readiness before queueing emails: the envelope must have recipients, at least one signer or approver, and at least one field. Draft recipient edits preserve copied field ownership by matching the old recipient order to the new recipient order.

## 6. Public Signing

Signer links are created when an envelope is sent. You can find a test signing URL from:

- **Email Messages**
- Envelope invite records
- Signing Sessions Admin

Public signing supports:

- Electronic consent
- Typed signature
- Drawn signature
- Uploaded signature image
- Initials
- Date fields
- Dropdowns
- Checkboxes
- Attachment upload fields
- Readonly completed view
- Decline signing with a reason

Date fields render as date pickers, dropdown fields render as select menus, and attachment fields render as upload controls on the public signing page. Typed signatures include signer-facing style controls for script/serif/sans/mono appearance, color, size, bold, and italic styling.
Filled fields lose their editable outline once completed. After submission, later signers, completed signing, envelope details, and approval review render the document as a filled form: previously submitted values are printed in place with readable sizing, typed-signature styling is preserved, and drawn/uploaded signatures are overlaid as signature images rather than placeholder text. Signed PDF generation prefers the same stored page-preview image used by the browser overlay, so downloaded PDFs match the on-screen placement more closely.

Each signer can only fill fields assigned to them or shared/unassigned fields. A signer cannot fill another recipient's fields unless the task has been delegated.

Multi-page documents render all pages in the signing view. If backend page images are unavailable, the signing page falls back to client-side PDF rendering using pdfjs-dist so all pages are always visible.

After completing a signing task, the link remains viewable: it shows the read-only signed document with all filled fields overlaid and a **Download Signed PDF** button regardless of whether other signers have finished. The download button is also shown when revisiting a completed link.

Declining a signing task marks the envelope declined and revokes other open signer links for that envelope.

> **How it works under the hood:** For a full technical explanation of session validation, signature capture methods, field value submission, routing-order sequencing, consent records, PDF generation paths, and the decline/delegate flows, see `docs/HOW_IT_WORKS.md` — Section 2.

## 7. Workflow Builder

Use **Workflow Builder** to create and test signing/approval workflow definitions.

Capabilities:

- Create workflow definitions.
- Add stages.
- Replace stages safely.
- Validate workflows.
- Simulate workflows.
- Activate or archive workflows.
- Start workflow runs against envelopes.
- Advance runs.
- View workflow events.

Workflows must have at least one stage before activation.

> **How it works under the hood:** For the full technical explanation of the Workflow Builder data model, API endpoints, stage types, advance mechanics, validation rules, and how Workflow Builder relates to Templates and Envelopes, see `docs/HOW_IT_WORKS.md` — Sections 6 and 7.

## 8. Approval Queue

Use **Approval Queue** to manage approval work:

- Approve
- Reject
- Request changes
- Delegate approval
- Export queue rows
- View per-status counts
- Open detail view with notes, timing, assignee, status, and related envelope context

Pending approval records can be approved, rejected, sent back for changes, delegated, or opened with the related envelope from the detail view.

## 9. Audit And Evidence

Use **Audit Evidence** and **Evidence Bundles** to inspect audit history and generate evidence artifacts.

Capabilities:

- Search audit events.
- Filter by event type prefix.
- Filter by date range.
- Generate evidence bundle.
- Generate signed PDF artifact.
- Verify evidence bundle hashes.
- Run visual QA metadata checks.

Evidence manifests include recipients, signatures, field values, signer-uploaded field attachments, consents, documents, email messages, approval requests, and audit events.

## 10. Developer Features

The Developer section includes:

- API Docs
- API Keys
- OAuth Apps
- Webhook Lab
- Operations Console
- Release Control
- Email Messages
- SDK / CLI
- Test Lab

Use **Test Lab** to exercise higher-confidence end-to-end flows before releasing a feature. The suite run buttons queue Background Task records, the page hydrates recent run status from the backend, the report action copies backend run data as CSV, and failed recorded suite runs can be requeued.

Verified 2026-05-15: the active Test Lab page is backend-backed through `/api/v1/task-runs/` for run list, detail, report export, and failed-run restart.

Use **OAuth Apps** to create, edit, disable/delete, and rotate OAuth application credentials. Rotated client secrets are shown once only; copy them immediately because the backend stores only a hash.

Use **Webhook Lab** to add or edit endpoint URLs, choose subscribed events, queue a test delivery, inspect delivery history, replay failed deliveries, or delete an endpoint.

## 11. Admin Features

The Admin section includes:

- Users
- Organizations
- Teams
- Roles & Permissions
- Background Tasks
- System Health

Admin users can create managed users, invite users, manage teams, assign custom roles, edit role permissions, review impersonation requests, revoke sessions, monitor task queues, and inspect system health. Built-in roles are **Super Admin**, **Admin**, **Manager**, **Signer**, and **Viewer**. Super Admin is an app-level operator role: it can see organizations globally, switch organization context, create users/invitations for any organization, create root organizations, manage billing/license records across organizations, and perform direct organization cleanup when the backend permits it.

Teams and Roles support full create, edit, and delete flows. System roles cannot be deleted. Team and role changes are recorded in the admin audit trail.

Background Tasks shows live queue totals, task runs, task definitions, worker inspect details when available, and clear empty-state messages when no runs have been recorded. Use retry, cancel, purge, and log actions from this page when investigating failed work.

System Health shows live service checks, resource metrics, alert thresholds, subscriptions, incidents, and public status data. Admins can create incidents, resolve incidents, rerun checks, and publish the current status snapshot.

System Health also includes production-readiness and observability data from the backend. Use the readiness view before deployment to review TLS/security-cookie settings, CORS, database backend, static/media policy, backup policy, restore-drill timestamp, secrets manager configuration, APM configuration, external alerts, and payment webhook secrets. The deployment runbook is also available from System Health and in `docs/DEPLOYMENT_HARDENING_RUNBOOK.md`.

## 12. Settings

Settings pages include:

- General
- Branding
- Email / SMTP
- Storage
- Security
- SSO / SCIM / LDAP
- Notifications

Use **Email / SMTP** to enter custom SMTP settings and send test email.

Use **Branding** to upload organization logos, apply the color palette, save signing/email domains, and update email footer text. Saved logo/color changes are applied to the current shell immediately and persisted for later sessions.

Use **Storage** to save the active storage backend, bucket, and endpoint. The usage and encryption panels show live media-disk, object-storage, and MinIO health data when the backend can report it.

Use **Security** to manage MFA/passkey policy, password policy, session limits, and IP allowlist behavior.

Use **SSO / SCIM / LDAP** to save OIDC/SAML/LDAP/JIT/social provider settings. SAML provider presets fill the editable fields, security toggles are saved with the connection, and test actions validate the saved backend connection.

Verified 2026-05-15: SAML preset loading updates the editable form fields, SAML security toggles are included in the saved backend configuration, and `/api/v1/sso-connections/` is reachable through the Docker/Nginx stack.

## 13. Compliance

Compliance pages include:

- Legal Holds
- Retention Policies
- Data Residency
- Compliance Exports

These are release-controlled separately so you can keep them internal until the legal/compliance flow is fully reviewed.

## 14. Billing And License

Billing and license pages include:

- Plans
- Subscription/usage metrics
- Checkout and payment portal handoff
- Invoices
- Payment methods
- Payment webhook event history
- License key details
- Licensed features

Super admins can switch organizations before opening Billing or License to inspect and manage the selected organization's usage, payment handoff records, invoices, and license keys. They can also allocate a plan directly, override a payment method, generate a new license key, and override an existing license record for externally purchased licenses.

Payment provider webhooks are backend-managed. When Stripe, Adyen, or the generic HanMak webhook secret is configured, incoming provider events are recorded, signature-checked, and reconciled to checkout sessions, subscriptions, and invoices when the provider payload includes organization or session metadata.

The **License** page renders the licensed feature list returned by the backend license record. New development licenses are seeded with a default feature list during activation if no custom feature list was supplied.

The **Roadmap** page stores feature requests, roadmap subscriptions, upvotes, and per-feature notify-me records through backend app settings so release feedback survives page refreshes.

## 15. Recommended Feature Review Process

Use this process before releasing a feature:

1. Open **Release Control**.
2. Click **Seed Defaults** if controls do not exist yet.
3. Set the feature stage to `Internal QA`.
4. Test the feature using the UI.
5. Check related API behavior.
6. Confirm permissions and audit behavior.
7. Save QA checklist results.
8. Move to `Beta` with a rollout percentage.
9. After successful testing, click **Release**.

## 16. MVP QA Checkpoint

The backend test checkpoint is currently green: the tenant API suite passes with `91 tests OK`. Before calling a feature MVP-ready, run the Docker click-through QA from the browser at:

```text
http://127.0.0.1:8080/mock/
```

Click every visible action in each module and classify it:

- `Pass`: the action works with live backend data.
- `Fix`: the action errors, does nothing, or shows stale/static data.
- `Defer`: the action belongs to production-only setup and should stay disabled or documented.

Recommended order: Auth/Profile, Dashboard/Inbox, Envelopes/Templates/Form Builder/File Library, Public Signing/Workflow/Approvals/Audit, Admin/System Health/Background Tasks, Settings/Compliance/Developer/Billing/License.
