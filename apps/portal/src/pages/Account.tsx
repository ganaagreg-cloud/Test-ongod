import { Link, useNavigate } from 'react-router';
import { Badge, Button, Notice, Skeleton } from '@ongod/ui-web';
import { getCurrentSubscription } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

export default function Account() {
  usePage({ title: mn.account.metaTitle, noindex: true });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const current = useAsync((signal) => getCurrentSubscription(signal));

  if (!user) return null;

  const accessUntil =
    user.accessUntil && new Date(user.accessUntil) > new Date() ? user.accessUntil : null;
  const subscription = current.data?.subscription;
  const open =
    subscription?.status === 'PENDING_PAYMENT' || subscription?.status === 'PAYMENT_SUBMITTED';

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.account.title}</h1>

      <section className="portal-card" aria-labelledby="profile-title">
        <h2 id="profile-title" className="portal-card__title">
          {user.lastName} {user.firstName}
        </h2>
        <p className="portal-muted">@{user.username}</p>
        <dl className="portal-facts">
          <div>
            <dt>{mn.account.email}</dt>
            <dd>
              {user.email}{' '}
              <Badge tone={user.emailVerified ? 'success' : 'warning'}>
                {user.emailVerified ? mn.account.emailVerified : mn.account.emailUnverified}
              </Badge>
            </dd>
          </div>
          <div>
            <dt>{mn.account.phone}</dt>
            <dd>{user.phone}</dd>
          </div>
          <div>
            <dt>{mn.account.access}</dt>
            <dd>
              <Badge tone={accessUntil ? 'active' : 'neutral'}>
                {accessUntil
                  ? mn.account.accessActive(formatDate(accessUntil))
                  : mn.account.accessInactive}
              </Badge>
            </dd>
          </div>
        </dl>
        {!user.emailVerified ? (
          <Link
            to="/verify"
            state={{ next: '/account' }}
            className="portal-linkbutton portal-linkbutton--secondary"
          >
            {mn.account.verifyNow}
          </Link>
        ) : null}
      </section>

      <section className="portal-card" aria-labelledby="request-title">
        <h2 id="request-title" className="portal-card__title">
          {open ? mn.account.openRequest : mn.account.lastRequest}
        </h2>
        {current.loading && !current.data ? (
          <Skeleton width="55%" />
        ) : (
          <>
            <ErrorNotice error={current.error} />
            {subscription ? (
              <p>
                <span className="portal-code">{subscription.referenceCode}</span>{' '}
                <Badge
                  tone={
                    subscription.status === 'ACTIVE'
                      ? 'success'
                      : subscription.status === 'REJECTED'
                        ? 'danger'
                        : subscription.status === 'PAYMENT_SUBMITTED'
                          ? 'info'
                          : 'neutral'
                  }
                >
                  {mn.account.statuses[subscription.status]}
                </Badge>
              </p>
            ) : null}
            {open ? (
              <Link
                to={subscription?.status === 'PAYMENT_SUBMITTED' ? '/status' : '/pay'}
                className="portal-linkbutton"
              >
                {mn.account.openRequestAction}
              </Link>
            ) : (
              <Link to="/plans" className="portal-linkbutton">
                {accessUntil ? mn.account.renew : mn.account.getAccess}
              </Link>
            )}
          </>
        )}
      </section>

      {!user.emailVerified && !open ? <Notice tone="warning">{mn.plans.verifyFirst}</Notice> : null}

      <div className="portal-actions">
        <Button
          variant="secondary"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
        >
          {mn.account.logout}
        </Button>
        <Link to="/delete-account" className="portal-linkbutton portal-linkbutton--ghost">
          {mn.account.deleteAccount}
        </Link>
      </div>
    </div>
  );
}
