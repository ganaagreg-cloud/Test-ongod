import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import { Skeleton } from '@ongod/ui-web';
import { useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { TotpSetupPage, TotpVerifyPage } from './auth/TotpPage';
import { Shell } from './layout/Shell';
import { CategoriesPage } from './pages/Categories';
import { DashboardPage } from './pages/Dashboard';
import { EpisodeEditPage } from './pages/EpisodeEdit';
import { EpisodesPage } from './pages/Episodes';
import { AuditPage } from './pages/Audit';
import { PaymentsPage } from './pages/Payments';
import { UserDetailPage } from './pages/UserDetail';
import { UsersPage } from './pages/Users';

// Dev-only component page (/admin/dev/ui). The import sits inside an `import.meta.env.DEV` block,
// which Vite replaces with `false` in production, so the bundler drops it.
let DevPage: ComponentType | undefined;
if (import.meta.env.DEV) {
  DevPage = lazy(() => import('@ongod/ui-web/gallery'));
}

export function App() {
  const { gate } = useAuth();

  if (DevPage && window.location.pathname.replace(/\/$/, '').endsWith('/dev/ui')) {
    return (
      <Suspense>
        <DevPage />
      </Suspense>
    );
  }

  switch (gate.stage) {
    case 'loading':
      return (
        <main className="admin-auth" aria-busy="true">
          <Skeleton width="40%" />
        </main>
      );
    case 'anonymous':
      return <LoginPage />;
    case 'forbidden':
      return <LoginPage forbidden={gate} />;
    case 'totp-setup':
      return <TotpSetupPage />;
    case 'totp-verify':
      return <TotpVerifyPage />;
    case 'ready':
      return (
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<DashboardPage />} />
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="users/:id" element={<UserDetailPage />} />
            <Route path="episodes" element={<EpisodesPage />} />
            <Route path="episodes/new" element={<EpisodeEditPage />} />
            <Route path="episodes/:id" element={<EpisodeEditPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      );
  }
}
