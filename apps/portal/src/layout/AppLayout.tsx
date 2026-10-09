import { Outlet } from 'react-router';
import { MountainLine } from '@ongod/ui-web';
import { mn } from '../i18n/mn';

/**
 * The pages the mobile apps open (/app/*): the brand and the page, nothing else. No navigation,
 * no link to plans, prices or the account, because the apps must not lead to a purchase
 * (audit D-01, ADR-0006).
 */
export function AppLayout() {
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <div className="portal-header__inner">
          <span className="portal-brand" aria-label={mn.appName}>
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
