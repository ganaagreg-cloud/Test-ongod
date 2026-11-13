import { useEffect } from 'react';
import { Outlet, useSearchParams } from 'react-router';
import { MountainLine } from '@ongod/ui-web';
import { mn } from '../i18n/mn';

/**
 * The pages the mobile apps open (/app/*): the brand and the page, nothing else. No navigation,
 * no footer and no link to plans or the account, because the apps must not lead to a purchase
 * (ADR-0053).
 */
export function AppLayout() {
  // The app passes ?theme=day when the member uses day mode: then the page is white (ADR-0103).
  const [params] = useSearchParams();
  const day = params.get('theme') === 'day';
  useEffect(() => {
    if (!day) return;
    document.documentElement.dataset.theme = 'light';
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [day]);
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header__inner">
          <span className="portal-brand">
            <MountainLine className="portal-brand__motif" />
            <span className="portal-brand__name">{mn.appName}</span>
          </span>
        </div>
      </header>
      <main id="main" className="portal-main">
        <Outlet />
      </main>
    </div>
  );
}
