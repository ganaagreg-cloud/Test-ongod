import { lazy, Suspense, type ComponentType } from 'react';
import { mn } from './i18n/mn';

// Dev-only component page (/admin/dev/ui). The import sits inside an `import.meta.env.DEV` block,
// which Vite replaces with `false` in production, so the bundler drops it.
let DevPage: ComponentType | undefined;
if (import.meta.env.DEV) {
  DevPage = lazy(() => import('@ongod/ui-web/gallery'));
}

export function App() {
  if (DevPage && window.location.pathname.replace(/\/$/, '').endsWith('/dev/ui')) {
    return (
      <Suspense>
        <DevPage />
      </Suspense>
    );
  }
  return <h1>{mn.appName}</h1>;
}
