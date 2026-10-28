import { Icon, MountainLine } from '@ongod/ui-web';
import type { IconName } from '@ongod/tokens';
import { NavLink, Outlet } from 'react-router';
import { useAdmin, useAuth } from '../auth/AuthContext';
import { Menu, MenuItem } from '../components/Menu';
import { mn } from '../i18n/mn';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
}

const GROUPS: ReadonlyArray<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { to: '/', label: mn.nav.dashboard, icon: 'home', end: true },
      { to: '/payments', label: mn.nav.payments, icon: 'doc' },
      { to: '/plans', label: mn.nav.plans, icon: 'check' },
      { to: '/gifts', label: mn.nav.gifts, icon: 'bookmark' },
      { to: '/users', label: mn.nav.users, icon: 'profile' },
    ],
  },
  {
    label: mn.nav.groupContent,
    items: [
      { to: '/episodes', label: mn.nav.episodes, icon: 'play' },
      { to: '/series', label: mn.nav.series, icon: 'library' },
      { to: '/playlists', label: mn.nav.playlists, icon: 'bookmark' },
      { to: '/categories', label: mn.nav.categories, icon: 'device' },
      { to: '/tags', label: mn.nav.tags, icon: 'copy' },
      { to: '/comments', label: mn.nav.comments, icon: 'info' },
    ],
  },
  { label: mn.nav.groupSystem, items: [{ to: '/audit', label: mn.nav.audit, icon: 'settings' }] },
];

const displayName = (user: { firstName?: string; lastName?: string; username: string }) =>
  `${user.lastName ?? ''} ${user.firstName ?? ''}`.trim() || user.username;

const initialsOf = (user: { firstName?: string; lastName?: string; username: string }) =>
  (
    [user.firstName, user.lastName].map((part) => part?.trim().charAt(0) ?? '').join('') ||
    user.username.charAt(0)
  ).toUpperCase();

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
          {GROUPS.map((group, index) => (
            <div key={index} className="admin-sidebar__group">
              {group.label ? <p className="admin-sidebar__group-label">{group.label}</p> : null}
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end ?? false}>
                  <Icon name={item.icon} size="small" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar__user">
          <Menu
            label={mn.nav.userMenu}
            align="start"
            side="up"
            triggerClassName="admin-user"
            trigger={
              <>
                <span className="admin-user__avatar" aria-hidden="true">
                  {initialsOf(user)}
                </span>
                <span className="admin-user__text">
                  <span className="admin-user__name">{displayName(user)}</span>
                  <span className="admin-user__role">{mn.roles[user.role]}</span>
                </span>
              </>
            }
          >
            {(close) => (
              <MenuItem
                onClick={() => {
                  close();
                  void logout();
                }}
              >
                {mn.nav.logout}
              </MenuItem>
            )}
          </Menu>
        </div>
      </aside>
      <main id="main" className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
