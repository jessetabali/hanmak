import { create } from 'zustand';

export const useUiStore = create((set) => ({
  sidebarCollapsed: false,
  mobileSidebarOpen: false,

  toggleSidebar: () =>
    set((s) => ({
      sidebarCollapsed: !s.sidebarCollapsed,
      mobileSidebarOpen: false,
    })),

  openMobileSidebar: () => set({ mobileSidebarOpen: true }),
  closeMobileSidebar: () => set({ mobileSidebarOpen: false }),
}));
