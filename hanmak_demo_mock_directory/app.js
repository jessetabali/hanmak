/* ===== HanMak — App Router & Utilities ===== */

// ---- Page Registry ----
const PAGE_REGISTRY = {};

function registerPage(id, renderer) {
  PAGE_REGISTRY[id] = renderer;
}

// ---- Router ----
let currentPage = null;

const PUBLIC_BETA_PAGES = new Set(['login', 'setup', 'public-signing']);

function hanmakFrontendConfig() {
  return window.HANMAK_FRONTEND_CONFIG || {};
}

function hanmakBetaModeEnabled() {
  return hanmakFrontendConfig().mode === 'beta';
}

function hanmakPageRequiresAuth(pageId) {
  const config = hanmakFrontendConfig();
  if (config.requireAuth === false) return false;
  return !PUBLIC_BETA_PAGES.has(pageId);
}

function renderAuthGate(pageId) {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon('lock')}</div>
    <div class="empty-state-title">Sign In Required</div>
    <div class="empty-state-desc">Beta mode requires an authenticated HanMak API session before opening <code>${pageId}</code>.</div>
    <button class="btn btn-primary" onclick="navigate('login')">${icon('key')} Sign In</button>
  </div>`;
}

const PAGE_FEATURE_FLAGS = {
  dashboard: 'core_dashboard',
  inbox: 'core_inbox',
  profile: 'core_profile',
  templates: 'template_library',
  'form-builder': 'form_builder',
  documents: 'file_library',
  signing: 'signing_sessions_admin',
  'public-signing': 'public_signing',
  envelopes: 'envelope_management',
  'workflow-builder': 'workflow_builder',
  approvals: 'approval_queue',
  'api-docs': 'api_docs',
  'api-keys': 'api_keys',
  'oauth-apps': 'oauth_apps',
  webhooks: 'webhook_lab',
  sdk: 'sdk_cli',
  'test-lab': 'test_lab',
  'email-messages': 'email_messages',
  users: 'admin_users',
  organizations: 'admin_organizations',
  teams: 'admin_teams',
  roles: 'admin_roles',
  tasks: 'background_tasks',
  'system-health': 'system_health',
  'settings-general': 'settings_general',
  'settings-branding': 'settings_branding',
  'settings-email': 'settings_email',
  'settings-storage': 'settings_storage',
  'settings-security': 'settings_security',
  'settings-notifications': 'settings_notifications',
  audit: 'audit_evidence',
  'evidence-bundles': 'audit_evidence',
  'legal-holds': 'legal_holds',
  retention: 'retention_policies',
  'data-residency': 'data_residency',
  'compliance-exports': 'compliance_exports',
  billing: 'billing_usage',
  license: 'license_management',
  roadmap: 'roadmap',
  sso: 'identity_sso_scim',
  'operations-console': 'operations_console',
};

function cachedReleaseFlags() {
  try {
    return JSON.parse(localStorage.getItem('HANMAK_RELEASE_FLAGS') || '[]');
  } catch {
    return [];
  }
}

function pageIsReleaseEnabled(pageId) {
  const key = PAGE_FEATURE_FLAGS[pageId];
  if (!key) return true;
  const flag = cachedReleaseFlags().find(item => item.key === key);
  if (!flag) return true;
  return flag.is_enabled && !['planned', 'internal', 'paused', 'retired'].includes(flag.release_stage);
}

function renderFeatureGate(pageId) {
  const key = PAGE_FEATURE_FLAGS[pageId] || pageId;
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon('lock')}</div>
    <div class="empty-state-title">Feature Not Released</div>
    <div class="empty-state-desc">This page is controlled by <code>${key}</code>. Enable or release it from Release Control before using it broadly.</div>
    <button class="btn btn-primary" onclick="navigate('release-control')">${icon('settings')} Open Release Control</button>
  </div>`;
}

function navigate(pageId, params = {}) {
  const renderer = PAGE_REGISTRY[pageId];
  if (!renderer) {
    console.warn('No page registered for:', pageId);
    document.getElementById('page-content').innerHTML =
      `<div class="empty-state"><div class="empty-state-icon">${icon('alert-circle')}</div><div class="empty-state-title">Page Not Found</div><div class="empty-state-desc">The page "${pageId}" is not registered.</div></div>`;
    return;
  }
  currentPage = pageId;

  // Update nav active states and ARIA current page
  document.querySelectorAll('.nav-item').forEach(el => {
    const pages = (el.dataset.page || '').split(' ');
    const isActive = pages.includes(pageId);
    el.classList.toggle('active', isActive);
    el.setAttribute('aria-current', isActive ? 'page' : 'false');
  });

  // Update breadcrumb
  const breadcrumbNames = {
    'dashboard': 'Dashboard', 'inbox': 'Inbox / My Tasks', 'envelopes': 'Envelopes',
    'templates': 'Templates', 'form-builder': 'Form Builder', 'documents': 'File Library',
    'signing': 'Signing Workflow', 'workflow-builder': 'Workflow Builder', 'approvals': 'Approval Queue',
    'audit': 'Audit Evidence', 'api-docs': 'API Docs', 'api-keys': 'API Keys',
    'oauth-apps': 'OAuth Apps', 'webhooks': 'Webhook Lab', 'operations-console': 'Operations Console', 'release-control': 'Release Control', 'sdk': 'SDK / CLI',
    'test-lab': 'Test Lab', 'users': 'Users', 'organizations': 'Organizations',
    'teams': 'Teams', 'roles': 'Roles & Permissions', 'tasks': 'Background Tasks',
    'system-health': 'System Health', 'settings-general': 'General Settings',
    'settings-branding': 'Branding', 'settings-email': 'Email / SMTP',
    'settings-storage': 'Storage', 'settings-security': 'Security',
    'settings-notifications': 'Notifications', 'sso': 'SSO / SCIM / LDAP',
    'legal-holds': 'Legal Holds', 'retention': 'Retention Policies',
    'data-residency': 'Data Residency', 'compliance-exports': 'Compliance Exports',
    'billing': 'Usage & Billing', 'license': 'License', 'roadmap': 'Roadmap',
    'profile': 'Profile Settings', 'setup': 'Account Setup', 'login': 'Sign In',
  };
  const crumb = document.getElementById('breadcrumb-current');
  const pageName = breadcrumbNames[pageId] || pageId;
  if (crumb) crumb.textContent = pageName;
  document.title = pageName ? `${pageName} — HanMak` : 'HanMak';

  // Scroll to top
  const content = document.getElementById('page-content');
  content.scrollTop = 0;

  if (hanmakPageRequiresAuth(pageId) && !localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    content.innerHTML = renderAuthGate(pageId);
    return;
  }

  if (!pageIsReleaseEnabled(pageId)) {
    content.innerHTML = renderFeatureGate(pageId);
    return;
  }

  // Render
  try {
    content.innerHTML = renderer(params);
    // Post-render hook if exists
    if (typeof window[`${pageId.replace(/-/g,'_')}_init`] === 'function') {
      window[`${pageId.replace(/-/g,'_')}_init`]();
    }
  } catch (e) {
    console.error('Page render error:', e);
    content.innerHTML = `<div class="empty-state"><div class="empty-state-title">Render Error</div><div class="empty-state-desc">${e.message}</div></div>`;
  }
}

// ---- Toast Notifications ----
function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f8ef7" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${icons[type] || icons.info}<span style="flex:1">${message}</span><button onclick="this.closest('.toast').remove()" style="background:none;border:none;cursor:pointer;padding:0 0 0 8px;color:var(--text-tertiary);font-size:18px;line-height:1;flex-shrink:0" title="Dismiss">×</button>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ---- Modal Helpers ----
const FOCUSABLE_SELECTORS = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function trapFocus(e, containerId) {
  if (e.key !== 'Tab') return;
  const container = document.getElementById(containerId);
  if (!container) return;
  const focusable = Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
}

function openModal(html) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  overlay.addEventListener('keydown', e => trapFocus(e, 'active-modal'));
  // Auto-focus first focusable element (skip the overlay backdrop itself)
  requestAnimationFrame(() => {
    const first = overlay.querySelector(FOCUSABLE_SELECTORS);
    if (first) first.focus();
  });
}

function closeModal() {
  const modal = document.getElementById('active-modal');
  if (modal) modal.remove();
}

function openDrawer(html) {
  closeDrawer();
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'active-drawer-overlay';
  overlay.onclick = closeDrawer;
  document.body.appendChild(overlay);

  const drawer = document.createElement('div');
  drawer.className = 'drawer';
  drawer.id = 'active-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = html;
  document.body.appendChild(drawer);
  drawer.addEventListener('keydown', e => trapFocus(e, 'active-drawer'));
  requestAnimationFrame(() => {
    const first = drawer.querySelector(FOCUSABLE_SELECTORS);
    if (first) first.focus();
  });
}

function openDrawerLg(html) {
  closeDrawer();
  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'active-drawer-overlay';
  overlay.onclick = closeDrawer;
  document.body.appendChild(overlay);

  const drawer = document.createElement('div');
  drawer.className = 'drawer drawer-lg';
  drawer.id = 'active-drawer';
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-modal', 'true');
  drawer.innerHTML = html;
  document.body.appendChild(drawer);
  drawer.addEventListener('keydown', e => trapFocus(e, 'active-drawer'));
  requestAnimationFrame(() => {
    const first = drawer.querySelector(FOCUSABLE_SELECTORS);
    if (first) first.focus();
  });
}

function closeDrawer() {
  document.getElementById('active-drawer-overlay')?.remove();
  document.getElementById('active-drawer')?.remove();
}

// ---- Icon Helper ----
const ICONS = {
  'plus': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  'x': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  'x-circle': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  'edit': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
  'trash': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  'eye': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  'copy': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  'refresh': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
  'check': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
  'alert-circle': '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  'download': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
  'send': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
  'filter': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>',
  'more': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
  'key': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>',
  'upload': '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  'play': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
  'stop': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>',
  'chevron-right': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
  'chevron-down': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>',
  'settings': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 1 4.93 19.07 10 10 0 0 1 19.07 4.93z"/></svg>',
  'user-plus': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
  'shield': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  'zap': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  'lock': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  'globe': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  'activity': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  'file': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  'tag': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
  'rotate': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  'external-link': '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
  'toggle-right': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="16" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  'toggle-left': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="5" width="22" height="14" rx="7" ry="7"/><circle cx="8" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  'user': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  'list': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  'grid': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  'save': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
  'check-circle': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  'help-circle': '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
};

function icon(name, size = 14) {
  return ICONS[name] || `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>`;
}

// ---- Sidebar Toggle ----
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (window.matchMedia('(max-width: 768px)').matches) {
    sidebar.classList.toggle('mobile-open');
  } else {
    sidebar.classList.toggle('collapsed');
  }
}

// ---- Org Switcher Modal ----
function organizationInitials(name) {
  return String(name || 'HanMak').split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || 'HM';
}

function setActiveOrganization(org, {refresh = false} = {}) {
  if (!org?.id) return;
  localStorage.setItem('HANMAK_ORGANIZATION_ID', org.id);
  updateOrganizationChrome(org);
  if (refresh) {
    closeModal();
    showToast(`Switched to ${org.name}`, 'success');
    navigate(currentPage || 'dashboard');
  }
}

function updateOrganizationChrome(org) {
  const avatarEl = document.querySelector('.sidebar-org-avatar');
  const nameEl = document.querySelector('.sidebar-org-name');
  if (avatarEl) avatarEl.textContent = organizationInitials(org?.name);
  if (nameEl) nameEl.textContent = org?.name || 'Select Organization';
}

async function loadAvailableOrganizations() {
  if (!window.hanmakApi) return [];
  const data = await hanmakApi('/organizations/', {
    headers: {'X-HanMak-Organization': ''},
  });
  return data.results || data || [];
}

async function hydrateOrganizationChrome() {
  if (!localStorage.getItem('HANMAK_ACCESS_TOKEN')) return;
  try {
    const organizations = await loadAvailableOrganizations();
    if (!organizations.length) return updateOrganizationChrome({name: 'No Organization'});
    const selectedId = Number(localStorage.getItem('HANMAK_ORGANIZATION_ID') || 0);
    const selected = organizations.find(org => org.id === selectedId) || organizations[0];
    setActiveOrganization(selected);
  } catch (error) {
    console.warn('Organization chrome unavailable', error.message);
  }
}

function updateUserChrome(profile) {
  const name = profile?.display_name || profile?.username || profile?.email || 'Signed in user';
  const role = profile?.title || profile?.email || 'Account profile';
  const avatarEl = document.querySelector('.sidebar-user-avatar');
  const nameEl = document.querySelector('.sidebar-user-name');
  const roleEl = document.querySelector('.sidebar-user-role');
  if (avatarEl) avatarEl.textContent = avatarInitials(name);
  if (nameEl) nameEl.textContent = name;
  if (roleEl) roleEl.textContent = role;
}

function updateNavBadge(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = value;
  el.style.display = Number(value) > 0 ? '' : 'none';
}

async function hydrateShellChrome() {
  if (!window.hanmakApi || !localStorage.getItem('HANMAK_ACCESS_TOKEN')) return;
  try {
    const [profile, inbox, approvals, taskSummary] = await Promise.all([
      hanmakApi('/profiles/me/').catch(() => null),
      hanmakApi('/inbox/').catch(() => null),
      hanmakApi('/approval-requests/?status=pending&page_size=100').catch(() => null),
      hanmakApi('/task-runs/summary/').catch(() => null),
    ]);
    if (profile) updateUserChrome(profile);
    if (inbox?.counts) {
      const approvalRows = approvals ? (approvals.results || approvals) : [];
      const approvalCount = Number(approvals?.count ?? (Array.isArray(approvalRows) ? approvalRows.filter(row => String(row.status || '').toLowerCase() === 'pending').length : inbox.counts.approvals || 0));
      const taskCount = Number(taskSummary?.failed || taskSummary?.failed_24h || taskSummary?.counts?.failed || inbox.counts.failed_tasks || 0);
      const inboxCount = Number(inbox.counts.signing || 0) + approvalCount + taskCount;
      updateNavBadge('nav-inbox-count', inboxCount);
      updateNavBadge('nav-approval-count', approvalCount);
      updateNavBadge('nav-task-count', taskCount);
      // Show notification dot on topbar bell when there are unread items
      const notifDot = document.getElementById('topbar-notif-dot');
      if (notifDot) notifDot.style.display = inboxCount > 0 ? '' : 'none';
    }
  } catch (error) {
    console.warn('Shell chrome unavailable', error.message);
  }
}

async function showOrgSwitcher() {
  if (!window.hanmakApi || !localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    showToast('Connect the API before switching organizations.', 'info');
    return;
  }
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div>
          <div class="modal-title">Switch Organization</div>
          <div class="modal-subtitle">Loading organizations...</div>
        </div>
        <button class="modal-close" onclick="closeModal()">${icon('x', 16)}</button>
      </div>
      <div class="modal-body" id="org-switcher-body" style="padding:12px;">
        <div style="padding:1rem;color:var(--text-muted);font-size:0.875rem">Loading...</div>
      </div>
    </div>
  `);
  try {
    const organizations = await loadAvailableOrganizations();
    renderOrgSwitcherBody(organizations);
  } catch (error) {
    const body = document.getElementById('org-switcher-body');
    if (body) body.innerHTML = `<div class="alert alert-danger">${icon('alert-circle')} ${escapeHtml(error.message || 'Could not load organizations')}</div>`;
  }
}

function renderOrgSwitcherBody(organizations) {
  const body = document.getElementById('org-switcher-body');
  if (!body) return;
  const selectedId = Number(localStorage.getItem('HANMAK_ORGANIZATION_ID') || 0);
  body.innerHTML = `
    ${organizations.length ? organizations.map(org => {
      const active = org.id === selectedId || (!selectedId && org === organizations[0]);
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-radius:var(--radius-md);cursor:pointer;border:${active?'2px solid var(--accent)':'2px solid transparent'};background:${active?'var(--accent-light)':'transparent'};margin-bottom:6px;" onclick='setActiveOrganization(${JSON.stringify({id: org.id, name: org.name}).replaceAll("'", "&apos;")}, {refresh: true})'>
          <div style="width:36px;height:36px;border-radius:8px;background:${avatarColor(org.name)};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;flex-shrink:0;">${organizationInitials(org.name)}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(org.name)}</div>
            <div style="font-size:11px;color:var(--text-secondary);">/${escapeHtml(org.slug || org.id)}${org.plan_name ? ` · ${escapeHtml(org.plan_name)}` : ''}</div>
          </div>
          ${active ? `<span class="badge badge-accent">Active</span>` : ''}
        </div>
      `;
    }).join('') : '<div class="empty-state"><div class="empty-state-title">No organizations yet</div><div class="empty-state-desc">Create one from Admin > Organizations.</div></div>'}
    <hr class="divider">
    <button class="btn btn-secondary w-full" onclick="closeModal();navigate('organizations')">
      ${icon('plus')} Manage Organizations
    </button>
  `;
}

// ---- Utility Functions ----
function formatDate(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date || new Date());
}

function formatRelative(daysAgo) {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `${daysAgo} days ago`;
  return formatDate(new Date(Date.now() - daysAgo * 86400000));
}

function randomDate(daysBack = 30) {
  const d = new Date(Date.now() - Math.random() * daysBack * 86400000);
  return formatDate(d);
}

function avatarColor(name) {
  const colors = ['#4f8ef7','#10b981','#8b5cf6','#f59e0b','#ef4444','#14b8a6','#f97316','#ec4899'];
  let hash = 0;
  for (let c of name) hash = (hash << 5) - hash + c.charCodeAt(0);
  return colors[Math.abs(hash) % colors.length];
}

function avatarInitials(name) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
}

function avatar(name, size = 32) {
  const color = avatarColor(name);
  return `<div class="user-avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.38)}px;background:${color};">${avatarInitials(name)}</div>`;
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => showToast('Copied to clipboard', 'success'));
}

const CONFIRM_CALLBACKS = {};
let confirmCallbackCounter = 0;

function confirm(message, onConfirm) {
  if (typeof onConfirm !== 'function') {
    console.warn('confirm(message, onConfirm) requires a callback. Falling back to immediate confirmation for legacy call:', message);
    return true;
  }
  const callbackId = `confirm-${++confirmCallbackCounter}`;
  CONFIRM_CALLBACKS[callbackId] = onConfirm;
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div class="modal-title">Confirm Action</div>
        <button class="modal-close" onclick="closeModal()">${icon('x',16)}</button>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;color:var(--text-primary);line-height:1.6;">${message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn btn-danger" onclick="runConfirmCallback('${callbackId}')">Confirm</button>
      </div>
    </div>
  `);
  return false;
}

function runConfirmCallback(callbackId) {
  const callback = CONFIRM_CALLBACKS[callbackId];
  delete CONFIRM_CALLBACKS[callbackId];
  closeModal();
  if (typeof callback === 'function') callback();
}

// ---- Tab switcher helper ----
function switchTab(groupId, tabId) {
  document.querySelectorAll(`[data-tab-group="${groupId}"]`).forEach(el => {
    el.classList.toggle('active', el.dataset.tabId === tabId);
  });
  document.querySelectorAll(`[data-tab-content-group="${groupId}"]`).forEach(el => {
    el.style.display = el.dataset.tabContentId === tabId ? 'block' : 'none';
  });
}

// ---- Settings nav helper ----
function switchSettingsSection(sectionId, container) {
  const c = document.querySelector(container || '.settings-content-area');
  if (!c) return;
  c.querySelectorAll('[data-section]').forEach(el => {
    el.style.display = el.dataset.section === sectionId ? 'block' : 'none';
  });
  document.querySelectorAll('.settings-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === sectionId);
  });
}

// ---- Production Utilities ----

function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function setButtonLoading(btn, isLoading, loadingText = 'Saving…') {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.originalHtml = btn.innerHTML;
    btn.innerHTML = `<span class="btn-spinner" aria-hidden="true"></span>${escapeHtml(loadingText)}`;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  } else {
    if (btn.dataset.originalHtml !== undefined) btn.innerHTML = btn.dataset.originalHtml;
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }
}

function renderSkeleton(rows = 5, cols = 4) {
  const cells = Array.from({length: cols}, () => '<td><div class="skeleton-line"></div></td>').join('');
  return Array.from({length: rows}, () => `<tr>${cells}</tr>`).join('');
}

function renderCardSkeleton(count = 3) {
  return Array.from({length: count}, () =>
    `<div class="skeleton-card"><div class="skeleton-line skeleton-line-title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line-short"></div></div>`
  ).join('');
}

function renderStatSkeleton(count = 4) {
  return `<div class="stats-grid">${Array.from({length: count}, () =>
    `<div class="stat-card"><div class="skeleton-line skeleton-line-short" style="margin-bottom:12px"></div><div class="skeleton-line skeleton-line-title" style="width:60%"></div></div>`
  ).join('')}</div>`;
}

// ---- Offline Banner ----
function updateOfflineBanner() {
  const existing = document.getElementById('offline-banner');
  if (!navigator.onLine) {
    if (!existing) {
      const banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.setAttribute('role', 'alert');
      banner.setAttribute('aria-live', 'assertive');
      banner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg> No internet connection — changes may not be saved`;
      document.body.insertAdjacentElement('afterbegin', banner);
    }
  } else {
    existing?.remove();
  }
}

window.addEventListener('online', updateOfflineBanner);
window.addEventListener('offline', updateOfflineBanner);

// ---- Topbar Auth Button ----
function topbarAuthAction() {
  if (localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    navigate('profile');
  } else {
    navigate('login');
  }
}

function updateTopbarAuthButton() {
  const btn = document.getElementById('topbar-signin-btn');
  if (!btn) return;
  if (localStorage.getItem('HANMAK_ACCESS_TOKEN')) {
    btn.title = 'My Profile';
    btn.setAttribute('aria-label', 'My Profile');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  } else {
    btn.title = 'Sign in';
    btn.setAttribute('aria-label', 'Sign in');
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>`;
  }
}

// ---- Help Modal ----
function openHelpModal() {
  openModal(`
    <div class="modal modal-sm">
      <div class="modal-header">
        <div><div class="modal-title">${icon('help-circle')} Keyboard Shortcuts</div><div class="modal-subtitle">Navigate HanMak without a mouse</div></div>
        <button class="modal-close" onclick="closeModal()" aria-label="Close">${icon('x', 16)}</button>
      </div>
      <div class="modal-body" style="padding:20px 24px">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tbody>
            ${[
              ['/','Focus global search'],
              ['Escape','Close modal or drawer'],
              ['Shift + ?','Open this help panel'],
            ].map(([key, desc]) => `
              <tr style="border-bottom:1px solid var(--border-light)">
                <td style="padding:10px 0;width:110px"><kbd style="font-size:11px">${escapeHtml(key)}</kbd></td>
                <td style="padding:10px 0;color:var(--text-secondary)">${escapeHtml(desc)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-light)">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.05em">Quick Links</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${[
              ['api-docs','API Docs'],
              ['system-health','System Health'],
              ['tasks','Background Tasks'],
              ['release-control','Release Control'],
            ].map(([page, label]) => `<button class="btn btn-secondary btn-sm" onclick="closeModal();navigate('${page}')">${escapeHtml(label)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  `);
}

// ---- Global Keyboard Shortcuts ----
document.addEventListener('keydown', e => {
  // Escape closes open modal or drawer
  if (e.key === 'Escape') {
    if (document.getElementById('active-modal')) { closeModal(); return; }
    if (document.getElementById('active-drawer')) { closeDrawer(); return; }
  }
  // '/' focuses the global search when focus is not in a text field
  if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    const searchInput = document.getElementById('global-search');
    if (searchInput) searchInput.focus();
  }
  // Shift+? opens help modal
  if (e.key === '?' && e.shiftKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
    e.preventDefault();
    openHelpModal();
  }
});
