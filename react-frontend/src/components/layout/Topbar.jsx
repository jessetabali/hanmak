import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUiStore } from '../../store/uiStore';

export default function Topbar() {
  const { isAuthenticated, user } = useAuth();
  const { toggleSidebar } = useUiStore();
  const navigate = useNavigate();

  return (
    <header className="topbar" role="banner">
      <button
        className="topbar-icon-btn"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        ☰
      </button>

      <div className="topbar-search">
        <input
          type="search"
          placeholder="Search…"
          className="form-input"
          style={{ width: '240px' }}
          onFocus={() => navigate('/search')}
          readOnly
        />
      </div>

      <div className="topbar-actions">
        <button
          className="topbar-icon-btn"
          title="Inbox / Notifications"
          aria-label="Inbox and notifications"
          onClick={() => navigate('/inbox')}
        >
          ✉
        </button>

        <button
          className="topbar-icon-btn"
          title={isAuthenticated ? 'My Profile' : 'Sign in'}
          aria-label={isAuthenticated ? 'My Profile' : 'Sign in'}
          onClick={() => navigate(isAuthenticated ? '/profile' : '/login')}
        >
          {user ? user.display_name?.[0] || user.username?.[0] || '?' : '?'}
        </button>
      </div>
    </header>
  );
}
