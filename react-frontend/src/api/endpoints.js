// Central registry of all API endpoint paths.
// Import from here rather than hard-coding strings in components.

export const EP = {
  // Auth
  TOKEN_OBTAIN: '/token/',
  TOKEN_REFRESH: '/token/refresh/',

  // Accounts
  USERS: '/users/',
  USER: (id) => `/users/${id}/`,
  PROFILE_ME: '/profiles/me/',
  PROFILE_ACTIVITY: '/profiles/activity/',
  CHANGE_PASSWORD: '/profiles/me/change_password/',
  SESSIONS: '/user-sessions/',
  SESSION: (id) => `/user-sessions/${id}/`,
  SESSION_REVOKE: (id) => `/user-sessions/${id}/revoke/`,
  SESSION_REVOKE_OTHERS: '/user-sessions/revoke_others/',
  MFA_DEVICES: '/mfa-devices/',
  ORGANIZATIONS: '/organizations/',
  ORGANIZATION: (id) => `/organizations/${id}/`,
  ORGANIZATION_BRANDING: (id) => `/organizations/${id}/branding/`,
  ORGANIZATION_LOGO: (id) => `/organizations/${id}/upload_logo/`,
  TEAMS: '/teams/',
  TEAM: (id) => `/teams/${id}/`,
  MEMBERSHIPS: '/memberships/',
  MEMBERSHIP: (id) => `/memberships/${id}/`,
  ROLES: '/roles/',
  ROLE: (id) => `/roles/${id}/`,
  INVITATIONS: '/invitations/',
  INVITATION: (id) => `/invitations/${id}/`,

  // Envelopes
  ENVELOPES: '/envelopes/',
  ENVELOPE: (id) => `/envelopes/${id}/`,
  ENVELOPE_SEND: (id) => `/envelopes/${id}/send/`,
  ENVELOPE_VOID: (id) => `/envelopes/${id}/void/`,
  ENVELOPE_DOWNLOAD: (id) => `/envelopes/${id}/download/`,
  ENVELOPE_BULK: '/envelopes/bulk-action/',
  ENVELOPE_SUMMARY: '/envelopes/summary/',
  RECIPIENTS: '/recipients/',
  RECIPIENT: (id) => `/recipients/${id}/`,

  // Templates
  TEMPLATES: '/templates/',
  TEMPLATE: (id) => `/templates/${id}/`,
  TEMPLATE_SETUP: (id) => `/templates/${id}/setup/`,
  TEMPLATE_VERSIONS: '/template-versions/',
  TEMPLATE_PARTIES: '/template-parties/',
  FORM_FIELDS: '/form-fields/',
  FORM_FIELD: (id) => `/form-fields/${id}/`,

  // Documents
  DOCUMENTS: '/documents/',
  DOCUMENT: (id) => `/documents/${id}/`,
  DOCUMENT_PROCESS: (id) => `/documents/${id}/process/`,
  DOCUMENT_SCAN: (id) => `/documents/${id}/scan/`,
  DOCUMENT_RENDER_PAGES: (id) => `/documents/${id}/render_pages/`,
  DOCUMENT_PREPARE: (id) => `/documents/${id}/prepare-for-builder/`,
  DOCUMENT_DUPLICATE: (id) => `/documents/${id}/duplicate/`,
  STORED_FILES: '/stored-files/',

  // Signing
  SIGNING_SESSIONS: '/signing-sessions/',
  SIGN: (token) => `/sign/${token}/`,
  SIGN_SUBMIT: (token) => `/sign/${token}/submit/`,
  SIGN_DECLINE: (token) => `/sign/${token}/decline/`,

  // Workflow
  WORKFLOWS: '/workflows/',
  WORKFLOW: (id) => `/workflows/${id}/`,
  WORKFLOW_REPLACE_STAGES: (id) => `/workflows/${id}/replace-stages/`,
  WORKFLOW_RUNS: '/workflow-runs/',
  WORKFLOW_RUN: (id) => `/workflow-runs/${id}/`,
  WORKFLOW_RUN_ADVANCE: (id) => `/workflow-runs/${id}/advance/`,
  WORKFLOW_EVENTS: '/workflow-events/',

  // Approvals
  APPROVALS: '/approval-requests/',
  APPROVAL: (id) => `/approval-requests/${id}/`,
  APPROVAL_APPROVE: (id) => `/approval-requests/${id}/approve/`,
  APPROVAL_REJECT: (id) => `/approval-requests/${id}/reject/`,
  APPROVAL_DELEGATE: (id) => `/approval-requests/${id}/delegate/`,

  // Audit / Evidence
  AUDIT_EVENTS: '/audit-events/',
  EVIDENCE_BUNDLES: '/evidence-bundles/',
  EVIDENCE_BUNDLE: (id) => `/evidence-bundles/${id}/`,
  EVIDENCE_GENERATE: (id) => `/evidence-bundles/${id}/generate/`,
  EVIDENCE_GENERATE_PDF: (id) => `/evidence-bundles/${id}/generate-signed-pdf/`,
  EVIDENCE_VERIFY: (id) => `/evidence-bundles/${id}/verify/`,

  // Inbox
  INBOX: '/inbox/',

  // Search
  SEARCH: '/search/',

  // Settings
  GENERAL_SETTINGS: '/general-settings/',
  EMAIL_SETTINGS: '/app-settings/',
  STORAGE_SETTINGS: '/storage-settings/',
  SECURITY_SETTINGS: '/security-settings/',
  NOTIFICATION_PREFS: '/notification-preferences/',
  EMAIL_TEMPLATES: '/email-templates/',
  EMAIL_TEMPLATES_TEST: '/email-messages/test_smtp/',

  // Identity / SSO
  SSO_CONNECTIONS: '/sso-connections/',
  SSO_CONNECTION: (id) => `/sso-connections/${id}/`,
  SCIM_CONNECTIONS: '/scim-connections/',
  LDAP_CONNECTIONS: '/ldap-connections/',
  JIT_SETTINGS: '/jit-settings/',
  SOCIAL_PROVIDERS: '/social-providers/',

  // System
  HEALTH_SUMMARY: '/health-checks/summary/',
  HEALTH_CHECKS: '/health-checks/',
  HEALTH_CHECK_RUN: (id) => `/health-checks/${id}/run/`,
  INCIDENTS: '/incidents/',
  TASK_DEFINITIONS: '/task-definitions/',
  TASK_RUNS: '/task-runs/',
  TASK_RUN: (id) => `/task-runs/${id}/`,
  TASK_RUN_RESTART: (id) => `/task-runs/${id}/restart/`,
  TASK_RUN_CANCEL: (id) => `/task-runs/${id}/cancel/`,

  // Compliance
  LEGAL_HOLDS: '/legal-holds/',
  LEGAL_HOLD: (id) => `/legal-holds/${id}/`,
  LEGAL_HOLD_RELEASE: (id) => `/legal-holds/${id}/release/`,
  RETENTION_POLICIES: '/retention-policies/',
  DATA_RESIDENCY_REGIONS: '/data-residency-regions/',
  DATA_RESIDENCY_POLICIES: '/data-residency-policies/',
  COMPLIANCE_EXPORTS: '/compliance-exports/',

  // Billing
  PLANS: '/plans/',
  SUBSCRIPTIONS: '/subscriptions/',
  INVOICES: '/invoices/',
  PAYMENT_METHODS: '/payment-methods/',
  PAYMENT_PORTAL_SESSIONS: '/payment-portal-sessions/',
  PAYMENT_WEBHOOK_EVENTS: '/payment-webhook-events/',
  LICENSE_KEYS: '/license-keys/',

  // Developer
  API_KEYS: '/api-keys/',
  API_KEY: (id) => `/api-keys/${id}/`,
  API_KEY_ROTATE: (id) => `/api-keys/${id}/rotate/`,
  API_KEY_REVOKE: (id) => `/api-keys/${id}/revoke/`,
  API_REQUEST_LOGS: '/api-request-logs/',
  OAUTH_APPS: '/oauth-apps/',
  OAUTH_APP: (id) => `/oauth-apps/${id}/`,
  OAUTH_APP_ROTATE_SECRET: (id) => `/oauth-apps/${id}/rotate_secret/`,
  OAUTH_GRANTS: '/oauth-grants/',
  OAUTH_GRANT: (id) => `/oauth-grants/${id}/`,
  OAUTH_GRANT_REVOKE: (id) => `/oauth-grants/${id}/revoke/`,
  WEBHOOK_ENDPOINTS: '/webhook-endpoints/',
  WEBHOOK_ENDPOINT: (id) => `/webhook-endpoints/${id}/`,
  WEBHOOK_TEST: (id) => `/webhook-endpoints/${id}/test/`,
  WEBHOOK_DELIVERIES: '/webhook-deliveries/',
  WEBHOOK_DELIVERY_REPLAY: (id) => `/webhook-deliveries/${id}/replay/`,
  EVENT_OUTBOX: '/event-outbox/',
  OBJECT_PERMISSIONS: '/object-permissions/',
  RISK_FINDINGS: '/risk-findings/',
  RISK_FINDING_RESOLVE: (id) => `/risk-findings/${id}/resolve/`,
  POLICY_RULES: '/policy-rules/',
  SEARCH_INDEX: '/search-index/',
  SEARCH_INDEX_REBUILD: '/search-index/rebuild/',

  // Release control / feature flags
  FEATURE_FLAGS: '/feature-flags/',
  FEATURE_FLAG: (id) => `/feature-flags/${id}/`,
  FEATURE_FLAGS_SEED: '/feature-flags/seed-defaults/',
  FEATURE_FLAG_REVIEW: (id) => `/feature-flags/${id}/review/`,
  FEATURE_FLAG_RELEASE: (id) => `/feature-flags/${id}/release/`,
  FEATURE_FLAGS_SUMMARY: '/feature-flags/summary/',

  // Analytics
  ANALYTICS_COMPLETION: '/analytics/completion/',
  ANALYTICS_APPROVAL: '/analytics/approval-bottlenecks/',

  // App settings (generic key-value store)
  APP_SETTINGS: '/app-settings/',
};
