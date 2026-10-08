import { lazy, Suspense } from 'react';
import { mn } from './i18n/mn';

// Dev-only pages; tree-shaken out of production builds.
const DevUiPage = import.meta.env.DEV ? lazy(() => import('./dev/UiPage')) : null;

export function App() {
  if (DevUiPage && window.location.pathname === '/dev/ui') {
    return (
      <Suspense>
        <DevUiPage />
      </Suspense>
    );
  }
  return <h1>{mn.appName}</h1>;
}
