// Bump this when auth config changes (e.g. SECRET_KEY rotation, token lifetime changes)
// so stale tokens in localStorage are cleared automatically.
const HANMAK_TOKEN_VERSION = '2';
if (localStorage.getItem('HANMAK_TOKEN_VERSION') !== HANMAK_TOKEN_VERSION) {
  localStorage.removeItem('HANMAK_ACCESS_TOKEN');
  localStorage.removeItem('HANMAK_REFRESH_TOKEN');
  localStorage.removeItem('HANMAK_ORGANIZATION_ID');
  localStorage.setItem('HANMAK_TOKEN_VERSION', HANMAK_TOKEN_VERSION);
}

function defaultHanmakApiBaseUrl() {
  if ((location.protocol === 'http:' || location.protocol === 'https:') && location.port === '8080') {
    return `${location.origin}/api/v1`;
  }
  return 'http://127.0.0.1:8080/api/v1';
}

const HANMAK_FRONTEND_CONFIG = window.HANMAK_FRONTEND_CONFIG || {};
const HANMAK_API_BASE_URL = HANMAK_FRONTEND_CONFIG.apiBaseUrl || localStorage.getItem('HANMAK_API_BASE_URL') || defaultHanmakApiBaseUrl();

function hanmakToken() {
  return localStorage.getItem('HANMAK_ACCESS_TOKEN') || '';
}

function hanmakOrganizationId() {
  return localStorage.getItem('HANMAK_ORGANIZATION_ID') || '';
}

async function hanmakApi(path, options = {}, _retry = false) {
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : {'Content-Type': 'application/json'}),
    ...(options.headers || {}),
  };
  const token = hanmakToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const organizationId = hanmakOrganizationId();
  if (organizationId && !Object.prototype.hasOwnProperty.call(headers, 'X-HanMak-Organization')) {
    headers['X-HanMak-Organization'] = organizationId;
  }
  const response = await fetch(`${HANMAK_API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();

  // On 401, attempt a silent token refresh once then retry the original request
  if (response.status === 401 && !_retry) {
    try {
      await hanmakRefreshLogin();
      return hanmakApi(path, options, true);
    } catch {
      hanmakLogout();
      if (typeof refreshAuthButton === 'function') refreshAuthButton();
      throw new Error('Session expired. Please sign in again.');
    }
  }

  if (!response.ok) {
    const detail = data?.detail || data?.non_field_errors?.join(', ') || response.statusText;
    throw new Error(detail);
  }
  return data;
}

async function hanmakLogin(username = 'admin', password = 'admin123') {
  const data = await hanmakApi('/auth/login/', {
    method: 'POST',
    body: JSON.stringify({username, password}),
  });
  localStorage.setItem('HANMAK_ACCESS_TOKEN', data.access);
  localStorage.setItem('HANMAK_REFRESH_TOKEN', data.refresh);
  return data;
}

// Uses raw fetch so it cannot trigger another 401-refresh cycle in hanmakApi
async function hanmakRefreshLogin() {
  const refresh = localStorage.getItem('HANMAK_REFRESH_TOKEN');
  if (!refresh) throw new Error('No refresh token available');
  const response = await fetch(`${HANMAK_API_BASE_URL}/auth/refresh/`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({refresh}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.detail || 'Token refresh failed');
  localStorage.setItem('HANMAK_ACCESS_TOKEN', data.access);
  if (data.refresh) localStorage.setItem('HANMAK_REFRESH_TOKEN', data.refresh);
  return data;
}

function hanmakLogout() {
  localStorage.removeItem('HANMAK_ACCESS_TOKEN');
  localStorage.removeItem('HANMAK_REFRESH_TOKEN');
  localStorage.removeItem('HANMAK_ORGANIZATION_ID');
}

async function hanmakLoadDashboardSummary() {
  const [completion, inbox, search, audit, webhooks, profile, risks, workflows, approvalBottlenecks] = await Promise.all([
    hanmakApi('/analytics/completion/'),
    hanmakApi('/inbox/'),
    hanmakApi('/search/?q=Contract'),
    hanmakApi('/audit-events/?page_size=7').catch(() => ({results: []})),
    hanmakApi('/analytics/webhook-health/').catch(() => []),
    hanmakApi('/profiles/me/').catch(() => null),
    hanmakApi('/risk-findings/?page_size=4').catch(() => ({results: []})),
    hanmakApi('/workflows/?page_size=6').catch(() => ({results: []})),
    hanmakApi('/analytics/approval-bottlenecks/').catch(() => []),
  ]);
  return {completion, inbox, search, audit, webhooks, profile, risks, workflows, approvalBottlenecks};
}

window.HANMAK_API_BASE_URL = HANMAK_API_BASE_URL;
window.hanmakOrganizationId = hanmakOrganizationId;
window.hanmakApi = hanmakApi;
window.hanmakLogin = hanmakLogin;
window.hanmakRefreshLogin = hanmakRefreshLogin;
window.hanmakLogout = hanmakLogout;
window.hanmakLoadDashboardSummary = hanmakLoadDashboardSummary;
