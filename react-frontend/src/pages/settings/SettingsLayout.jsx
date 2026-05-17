import { NavLink, Outlet } from 'react-router-dom';

const SETTINGS_NAV = [
  { to: '/settings/general', label: 'General' },
  { to: '/settings/branding', label: 'Branding' },
  { to: '/settings/email', label: 'Email / SMTP' },
  { to: '/settings/storage', label: 'Storage' },
  { to: '/settings/security', label: 'Security' },
  { to: '/settings/notifications', label: 'Notifications' },
  { to: '/settings/sso', label: 'SSO / Identity' },
];

export default function SettingsLayout() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Organization and application configuration</p>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="card" style={{ padding: '1rem', height: 'fit-content' }}>
          {SETTINGS_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `settings-nav-item ${isActive ? 'active' : ''}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
