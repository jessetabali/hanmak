import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_ENTRIES = 500;

const REDACT_KEYS = ['password', 'token', 'secret', 'key', 'access', 'refresh', 'authorization', 'credential'];

function sanitize(data) {
  if (data == null) return null;
  if (data instanceof FormData) return '[FormData — binary/multipart]';
  if (typeof data === 'string') {
    try { data = JSON.parse(data); } catch { return data.length > 500 ? data.slice(0, 500) + '…' : data; }
  }
  if (typeof data !== 'object' || Array.isArray(data)) return data;
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = REDACT_KEYS.some((r) => k.toLowerCase().includes(r)) ? '[REDACTED]' : v;
  }
  return out;
}

function classify(statusCode) {
  if (!statusCode || statusCode >= 500) return 'error';
  if (statusCode === 401 || statusCode === 403) return 'warning';
  if (statusCode >= 400) return 'error';
  return 'info';
}

export const useErrorLogStore = create(
  persist(
    (set, get) => ({
      entries: [],

      logApiError: (error, config) => {
        const statusCode = error.response?.status ?? 0;
        const method = (config?.method ?? 'UNKNOWN').toUpperCase();
        const rawUrl = config?.url ?? '';
        const endpoint = rawUrl.replace(/^.*\/api\/v\d+/, '') || rawUrl;

        let requestPayload = null;
        try {
          const raw = config?.data;
          requestPayload = raw instanceof FormData
            ? '[FormData]'
            : typeof raw === 'string'
            ? sanitize(JSON.parse(raw))
            : sanitize(raw);
        } catch {
          requestPayload = '[parse error]';
        }

        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          level: classify(statusCode),
          source: 'api',
          method,
          endpoint,
          statusCode,
          message: error.message,
          requestPayload,
          responseBody: error.response?.data ?? null,
          pageUrl: window.location.pathname + window.location.search,
          resolved: false,
        };

        set((state) => ({
          entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
        }));
      },

      logRenderError: (error, info) => {
        const entry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          timestamp: new Date().toISOString(),
          level: 'error',
          source: 'render',
          method: null,
          endpoint: null,
          statusCode: null,
          message: error?.message ?? String(error),
          requestPayload: null,
          responseBody: info?.componentStack ?? null,
          pageUrl: window.location.pathname + window.location.search,
          resolved: false,
        };
        set((state) => ({
          entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
        }));
      },

      resolve: (id) =>
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, resolved: true } : e)) })),

      unresolve: (id) =>
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, resolved: false } : e)) })),

      deleteEntry: (id) =>
        set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

      clearResolved: () =>
        set((s) => ({ entries: s.entries.filter((e) => !e.resolved) })),

      clearAll: () => set({ entries: [] }),

      unresolvedCount: () => get().entries.filter((e) => !e.resolved).length,
    }),
    {
      name: 'hanmak-error-log',
      partialize: (state) => ({ entries: state.entries }),
    },
  ),
);
