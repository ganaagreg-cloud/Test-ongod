import { Navigate, Outlet, useLocation } from 'react-router';
import { Skeleton } from '@ongod/ui-web';
import { useAuth } from '../auth/AuthContext';
import { mn } from '../i18n/mn';

/** Pages behind the login. While the session is being restored it shows a quiet placeholder. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
        <Skeleton shape="pill" width="100%" />
      </div>
    );
  }
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
