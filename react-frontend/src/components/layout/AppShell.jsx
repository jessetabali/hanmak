import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import ErrorBoundary from './ErrorBoundary';
import { useUiStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';

export default function AppShell() {
  const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUiStore();
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const location = useLocation();

  useEffect(() => {
    fetchMe();
  }, []);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      {/* Mobile overlay */}
      {mobileSidebarOpen && (
        <div className="sidebar-overlay" onClick={closeMobileSidebar} aria-hidden="true" />
      )}

      <Sidebar />

      <div className="main-area">
        <Topbar />
        <main className="page-content" id="page-content" role="main" aria-label="Page content">
          <ErrorBoundary resetKey={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
