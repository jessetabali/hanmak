import axios from 'axios';
import { useErrorLogStore } from '../store/errorLogStore';

function normalizeApiBaseUrl(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) return '/api/v1';
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`;
}

const BASE_URL = normalizeApiBaseUrl(
  import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL,
);

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('HANMAK_ACCESS_TOKEN');
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const orgId = localStorage.getItem('HANMAK_ORGANIZATION_ID');
  if (orgId) config.headers['X-HanMak-Organization'] = orgId;

  return config;
});

let isRefreshing = false;
let refreshQueue = [];

const processQueue = (error, token = null) => {
  refreshQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  refreshQueue = [];
};

// Refresh access token on 401 and replay the original request
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retried) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return apiClient(original);
          })
          .catch(Promise.reject.bind(Promise));
      }

      original._retried = true;
      isRefreshing = true;

      try {
        const refresh = localStorage.getItem('HANMAK_REFRESH_TOKEN');
        const { data } = await axios.post(`${BASE_URL}/auth/refresh/`, { refresh });
        localStorage.setItem('HANMAK_ACCESS_TOKEN', data.access);
        apiClient.defaults.headers.common.Authorization = `Bearer ${data.access}`;
        processQueue(null, data.access);
        original.headers.Authorization = `Bearer ${data.access}`;
        return apiClient(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('HANMAK_ACCESS_TOKEN');
        localStorage.removeItem('HANMAK_REFRESH_TOKEN');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Improve error.message so components using `e.message` see the actual
    // backend validation error instead of the generic axios status string.
    if (error.response?.data) {
      const d = error.response.data;
      if (d.detail) {
        error.message = d.detail;
      } else if (Array.isArray(d) && d.length) {
        error.message = d.join('; ');
      } else if (d && typeof d === 'object') {
        const parts = Object.entries(d).map(([k, v]) => {
          const msg = Array.isArray(v) ? v.join(', ') : String(v);
          return k === 'non_field_errors' ? msg : `${k}: ${msg}`;
        });
        if (parts.length) error.message = parts.join(' | ');
      } else if (typeof d === 'string' && d) {
        error.message = d;
      }
    }

    // Persist to error log (skip 401 — those are handled by token refresh)
    if (error.response?.status !== 401) {
      try {
        useErrorLogStore.getState().logApiError(error, error.config);
      } catch {
        // non-fatal — don't let logging break the app
      }
    }

    return Promise.reject(error);
  },
);

export const setAuthTokens = (access, refresh) => {
  localStorage.setItem('HANMAK_ACCESS_TOKEN', access);
  localStorage.setItem('HANMAK_REFRESH_TOKEN', refresh);
  apiClient.defaults.headers.common.Authorization = `Bearer ${access}`;
};

export const clearAuthTokens = () => {
  localStorage.removeItem('HANMAK_ACCESS_TOKEN');
  localStorage.removeItem('HANMAK_REFRESH_TOKEN');
  localStorage.removeItem('HANMAK_ORGANIZATION_ID');
  delete apiClient.defaults.headers.common.Authorization;
};
