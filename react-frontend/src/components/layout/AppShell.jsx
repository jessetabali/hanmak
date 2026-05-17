import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useUiStore } from '../../store/uiStore';

export default function AppShell() {
  const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useUiStore();

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
          <Outlet />
        </main>
      </div>
    </div>
  );
}
