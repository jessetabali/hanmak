import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

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
        const { data } = await axios.post(`${BASE_URL}/token/refresh/`, { refresh });
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
