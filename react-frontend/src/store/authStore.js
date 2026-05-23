import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient, setAuthTokens, clearAuthTokens } from '../api/client';
import { EP } from '../api/endpoints';

function isSuperAdminUser(user) {
  return Boolean(
    user?.is_superuser ||
    user?.role === 'super_admin' ||
    (Array.isArray(user?.roles) && user.roles.includes('super_admin')) ||
    (Array.isArray(user?.memberships) && user.memberships.some((m) => m.role === 'super_admin')),
  );
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      user: null,
      organization: null,
      organizationId: localStorage.getItem('HANMAK_ORGANIZATION_ID') || null,
      globalScope: localStorage.getItem('HANMAK_GLOBAL_SCOPE') === 'true',
      isAuthenticated: !!localStorage.getItem('HANMAK_ACCESS_TOKEN'),

      login: async (username, password) => {
        const { data } = await apiClient.post(EP.TOKEN_OBTAIN, { username, password });
        setAuthTokens(data.access, data.refresh);
        set({ isAuthenticated: true });
        await get().fetchMe();
      },

      logout: () => {
        clearAuthTokens();
        localStorage.removeItem('HANMAK_IS_SUPER_ADMIN');
        localStorage.removeItem('HANMAK_GLOBAL_SCOPE');
        set({ user: null, organization: null, organizationId: null, globalScope: false, isAuthenticated: false });
      },

      fetchMe: async () => {
        try {
          const { data } = await apiClient.get(EP.PROFILE_ME);
          const isSuperAdmin = isSuperAdminUser(data);
          localStorage.setItem('HANMAK_IS_SUPER_ADMIN', isSuperAdmin ? 'true' : 'false');
          if (isSuperAdmin && !localStorage.getItem('HANMAK_GLOBAL_SCOPE')) {
            localStorage.setItem('HANMAK_GLOBAL_SCOPE', 'true');
          }
          set({ user: data, globalScope: localStorage.getItem('HANMAK_GLOBAL_SCOPE') === 'true' });

          // Ensure org ID is in localStorage so every API write includes organization
          if (!isSuperAdmin && !localStorage.getItem('HANMAK_ORGANIZATION_ID')) {
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
        localStorage.setItem('HANMAK_GLOBAL_SCOPE', 'false');
        localStorage.setItem('HANMAK_ORGANIZATION_ID', String(org.id));
        set({ organization: org, organizationId: org.id, globalScope: false });
      },

      setGlobalScope: () => {
        localStorage.setItem('HANMAK_GLOBAL_SCOPE', 'true');
        set({ organization: null, globalScope: true });
      },
    }),
    {
      name: 'hanmak-auth',
      partialize: (state) => ({
        user: state.user,
        organization: state.organization,
        organizationId: state.organizationId,
        globalScope: state.globalScope,
      }),
    },
  ),
);
