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

          // Ensure org ID is in localStorage so every API write includes organization
          if (!localStorage.getItem('HANMAK_ORGANIZATION_ID')) {
            try {
              const { data: orgData } = await apiClient.get(EP.ORGANIZATIONS, { params: { page_size: 1 } });
              const firstOrg = orgData?.results?.[0];
              if (firstOrg) {
                localStorage.setItem('HANMAK_ORGANIZATION_ID', String(firstOrg.id));
                set({ organization: firstOrg, organizationId: firstOrg.id });
              }
            } catch {
              // non-fatal — org may not be needed for all users
            }
          }
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
