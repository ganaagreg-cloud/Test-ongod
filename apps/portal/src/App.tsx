import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router';
import { Skeleton } from '@ongod/ui-web';
import { RequireAuth } from './components/RequireAuth';
import { Layout } from './layout/Layout';
import Landing from './pages/Landing';
import { mn } from './i18n/mn';

// The landing page is in the first bundle (it is what people see first); the rest loads on demand.
const Plans = lazy(() => import('./pages/Plans'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Verify = lazy(() => import('./pages/Verify'));
const Forgot = lazy(() => import('./pages/Forgot'));
const Reset = lazy(() => import('./pages/Reset'));
const Pay = lazy(() => import('./pages/Pay'));
const Status = lazy(() => import('./pages/Status'));
const Account = lazy(() => import('./pages/Account'));
const DeleteAccount = lazy(() => import('./pages/DeleteAccount'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Privacy = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./pages/Legal').then((m) => ({ default: m.Terms })));

/**
 * Dev-only component page at /dev/ui. The import sits inside an `import.meta.env.DEV` block,
 * which Vite replaces with `false` in production so the bundler drops the whole branch (checked
 * by apps/portal/test/no-dev-in-build.test.ts after a build).
 */
let devRoute: ReactNode = null;
if (import.meta.env.DEV) {
  const Gallery = lazy(() => import('@ongod/ui-web/gallery'));
  devRoute = <Route path="dev/ui" element={<Gallery />} />;
}

const Loading = (
  <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
    <Skeleton width="60%" />
    <Skeleton shape="pill" width="100%" />
  </div>
);

export function App() {
  return (
    <Suspense fallback={Loading}>
      <Routes>
        {devRoute}
        <Route element={<Layout />}>
          <Route index element={<Landing />} />
          <Route path="plans" element={<Plans />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />
          <Route path="verify" element={<Verify />} />
          <Route path="forgot" element={<Forgot />} />
          <Route path="reset" element={<Reset />} />
          <Route element={<RequireAuth />}>
            <Route path="pay" element={<Pay />} />
            <Route path="status" element={<Status />} />
            <Route path="account" element={<Account />} />
          </Route>
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="delete-account" element={<DeleteAccount />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
