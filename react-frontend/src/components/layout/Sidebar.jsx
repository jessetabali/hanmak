import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useUiStore } from '../../store/uiStore';
import { useErrorLogStore } from '../../store/errorLogStore';
import { useApiQuery } from '../../hooks/useApi';
import { EP } from '../../api/endpoints';

const NAV = [
  {
    label: 'Main',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/inbox', label: 'Inbox' },
      { to: '/envelopes', label: 'Envelopes' },
      { to: '/templates', label: 'Templates' },
      { to: '/documents', label: 'File Library' },
      { to: '/signing', label: 'Signing Sessions' },
      { to: '/approvals', label: 'Approvals' },
      { to: '/workflow', label: 'Workflow Builder' },
    ],
  },
  {
    label: 'Audit & Compliance',
    items: [
      { to: '/audit', label: 'Audit Trail' },
      { to: '/evidence-bundles', label: 'Evidence Bundles' },
      { to: '/compliance/legal-holds', label: 'Legal Holds' },
      { to: '/compliance/retention', label: 'Retention Policies' },
      { to: '/compliance/data-residency', label: 'Data Residency' },
      { to: '/compliance/exports', label: 'Compliance Exports' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { to: '/admin/users', label: 'Users' },
      { to: '/admin/organizations', label: 'Organizations' },
      { to: '/admin/teams', label: 'Teams' },
      { to: '/admin/roles', label: 'Roles' },
    ],
  },
  {
    label: 'Developer',
    items: [
      { to: '/developer/api-keys', label: 'API Keys' },
      { to: '/developer/oauth-apps', label: 'OAuth Apps' },
      { to: '/developer/webhooks', label: 'Webhooks' },
      { to: '/developer/api-docs', label: 'API Docs' },
      { to: '/developer/test-lab', label: 'Test Lab' },
      { to: '/developer/email-messages', label: 'Email Messages' },
      { to: '/developer/operations', label: 'Operations Console' },
      { to: '/developer/release-control', label: 'Release Control' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/system/tasks', label: 'Background Tasks' },
      { to: '/system/health', label: 'System Health' },
      { to: '/system/error-log', label: 'Error Log', badge: 'errorLog' },
    ],
  },
  {
    label: 'Settings',
    items: [{ to: '/settings', label: 'Settings' }],
  },
  {
    label: 'Billing',
    items: [
      { to: '/billing', label: 'Billing' },
      { to: '/license', label: 'License' },
    ],
  },
];

export default function Sidebar() {
  const { user, logout, organizationId, globalScope, setOrganization, setGlobalScope } = useAuth();
  const { mobileSidebarOpen } = useUiStore();
  const navigate = useNavigate();
  const errorCount = useErrorLogStore((s) => s.entries.filter((e) => !e.resolved).length);
  const isSuperAdmin = Boolean(
    user?.is_superuser ||
    user?.role === 'super_admin' ||
    (Array.isArray(user?.roles) && user.roles.includes('super_admin')) ||
    (Array.isArray(user?.memberships) && user.memberships.some((m) => m.role === 'super_admin')),
  );
  const { data: orgsData } = useApiQuery(
    ['sidebar-organizations', isSuperAdmin],
    EP.ORGANIZATIONS,
    { page_size: 500, scope: 'all' },
    { enabled: isSuperAdmin },
  );
  const organizations = orgsData?.results ?? orgsData ?? [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleScopeChange = (event) => {
    const value = event.target.value;
    if (value === 'global') {
      setGlobalScope();
      navigate('/admin/organizations');
      return;
    }
    const org = organizations.find((item) => String(item.id) === value);
    if (org) setOrganization(org);
  };

  return (
    <aside
      className={`sidebar ${mobileSidebarOpen ? 'mobile-open' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="sidebar-logo">
        <span className="sidebar-logo-text">HanMak</span>
      </div>

      {isSuperAdmin && (
        <div style={{ padding: '0 14px 12px' }}>
          <label style={{ display: 'block', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>
            Scope
          </label>
          <select
            className="form-input"
            value={globalScope ? 'global' : String(organizationId || '')}
            onChange={handleScopeChange}
            style={{ minHeight: 34, fontSize: 12, padding: '5px 8px' }}
          >
            <option value="global">Global: all organizations</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>{org.name}</option>
            ))}
          </select>
        </div>
      )}

      <nav className="sidebar-nav">
        {NAV.map((section) => (
          <div className="nav-section" key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map((item) => {
              const badgeCount = item.badge === 'errorLog' ? errorCount : 0;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/settings'}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  aria-current={({ isActive }) => (isActive ? 'page' : undefined)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>{item.label}</span>
                  {badgeCount > 0 && (
                    <span
                      style={{
                        background: 'var(--danger)',
                        color: '#fff',
                        borderRadius: 10,
                        fontSize: 10,
                        fontWeight: 700,
                        padding: '1px 6px',
                        minWidth: 18,
                        textAlign: 'center',
                        lineHeight: '16px',
                      }}
                    >
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.display_name || user?.username || 'User'}</div>
          <div className="sidebar-user-email">{user?.email || ''}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  );
}
