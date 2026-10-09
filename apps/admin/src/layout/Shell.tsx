import { Button, MountainLine } from '@ongod/ui-web';
import { NavLink, Outlet } from 'react-router';
import { useAdmin, useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';

const LINKS = [
  { to: '/', label: mn.nav.dashboard, end: true },
  { to: '/payments', label: mn.nav.payments },
  { to: '/users', label: mn.nav.users },
  { to: '/episodes', label: mn.nav.episodes },
  { to: '/categories', label: mn.nav.categories },
  { to: '/audit', label: mn.nav.audit },
] as const;

export function Shell() {
  const user = useAdmin();
  const { logout } = useAuth();
  return (
    <div className="admin-shell">
      <a className="ui-skip-link" href="#main">
        {mn.common.skip}
      </a>
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <MountainLine />
          <span className="admin-sidebar__name">{mn.appName}</span>
        </div>
        <nav aria-label={mn.nav.label} className="admin-sidebar__nav">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={'end' in link ? link.end : false}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="admin-sidebar__user">
          <p className="admin-sidebar__who">
            <span>{mn.nav.signedInAs}</span>
            <strong>{user.username}</strong>
            <span>{mn.roles[user.role]}</span>
          </p>
          <Button variant="secondary" onClick={() => void logout()}>
            {mn.nav.logout}
          </Button>
        </div>
      </aside>
      <main id="main" className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
