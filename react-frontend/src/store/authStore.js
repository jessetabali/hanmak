import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient, setAuthTokens, clearAuthTokens } from '../api/client';
import { EP } from '../api/endpoints';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      organization: null,
      organizationId: localStorage.getItem('HANMAK_ORGANIZATION_ID') || null,
      isAuthenticated: !!localStorage.getItem('HANMAK_ACCESS_TOKEN'),

      login: async (username, password) => {
        const { data } = await apiClient.post(EP.TOKEN_OBTAIN, { username, password });
        setAuthTokens(data.access, data.refresh);
        set({ isAuthenticated: true });
        await get().fetchMe();
      },

      logout: () => {
        clearAuthTokens();
        set({ user: null, organization: null, organizationId: null, isAuthenticated: false });
      },

      fetchMe: async () => {
        try {
          const { data } = await apiClient.get(EP.PROFILE_ME);
          set({ user: data });
        } catch {
          // token invalid — will be caught by the axios interceptor
        }
      },

      setOrganization: (org) => {
        localStorage.setItem('HANMAK_ORGANIZATION_ID', String(org.id));
        set({ organization: org, organizationId: org.id });
      },
    }),
    {
      name: 'hanmak-auth',
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
        organizationId: state.organizationId,
      }),
    },
  ),
);
