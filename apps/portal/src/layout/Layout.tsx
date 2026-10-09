import { useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { MountainLine } from '@ongod/ui-web';
import { useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';

/** Header (with the mountain-line motif), main landmark and footer around every page. */
export function Layout() {
  const { status, user, logout } = useAuth();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const first = useRef(true);

  // Screen-reader and keyboard users land at the top of the new page after a route change.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus({ preventScroll: false });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="portal-shell">
      <a className="ui-skip-link" href="#main">
        {mn.nav.skip}
      </a>
      <header className="portal-header">
        <div className="portal-header__inner">
          <Link to="/" className="portal-brand" aria-label={mn.appName}>
            <MountainLine className="portal-brand__motif" />
            <span className="portal-brand__name">{mn.appName}</span>
          </Link>
          <nav className="portal-nav" aria-label={mn.nav.label}>
            <NavLink to="/plans">{mn.nav.plans}</NavLink>
            {status === 'authenticated' && user ? (
              <>
                <NavLink to="/account">{mn.nav.account}</NavLink>
                <button type="button" className="portal-nav__button" onClick={() => void logout()}>
                  {mn.nav.logout}
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login">{mn.nav.login}</NavLink>
                <NavLink to="/register" className="portal-nav__cta">
                  {mn.nav.register}
                </NavLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main" ref={main} tabIndex={-1} className="portal-main">
        <Outlet />
      </main>

      <footer className="portal-footer">
        <div className="portal-footer__inner">
          <span>{mn.footer.rights}</span>
          <nav aria-label={mn.footer.privacy}>
            <Link to="/privacy">{mn.footer.privacy}</Link>
            <Link to="/terms">{mn.footer.terms}</Link>
            <Link to="/delete-account">{mn.footer.deleteAccount}</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
