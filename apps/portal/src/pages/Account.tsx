import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router';
import { Badge, Button, Notice, Skeleton } from '@ongod/ui-web';
import { getCurrentSubscription, getPlans } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { StoreBadges } from '../components/StoreBadges';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

const DAY_MS = 24 * 60 * 60 * 1000;

export default function Account() {
  usePage({ title: mn.account.metaTitle, noindex: true });
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const current = useAsync((signal) => getCurrentSubscription(signal));
  // Off before launch (ADR-0072): no gift links while nothing can be bought.
  const plans = useAsync(() => getPlans());
  const paymentsOpen = plans.data?.paymentsOpen ?? true;

  if (!user) return null;

  const now = new Date();
  const accessUntil =
    user.accessUntil && new Date(user.accessUntil) > now ? user.accessUntil : null;
  const subscription = current.data?.subscription;
  const open = subscription?.status === 'PENDING_PAYMENT';
  const daysLeft = accessUntil
    ? Math.ceil((new Date(accessUntil).getTime() - now.getTime()) / DAY_MS)
    : 0;
  // The ring shows the part of the period that is left (the plan's length, a year if unknown).
  const period = subscription?.status === 'ACTIVE' ? subscription.plan.durationDays : 365;
  const ring = { '--portal-ring': Math.min(100, Math.round((daysLeft / period) * 100)) };

  return (
    <div className="portal-page portal-account">
      <header className="portal-account__head">
        <div>
          <p className="portal-kicker">{mn.account.hello(user.firstName)}</p>
          <h1 className="portal-head__title">{mn.account.title}</h1>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            await logout();
            navigate('/', { replace: true });
          }}
        >
          {mn.account.logout}
        </Button>
      </header>

      <div className="portal-account__grid">
        <div className="portal-account__col">
          <section className="portal-card portal-access" aria-labelledby="access-title">
            {accessUntil ? (
              <div className="portal-ring" style={ring as CSSProperties} aria-hidden="true">
                <span>
                  <b>{daysLeft}</b>
                  <small>{mn.account.daysLeftShort}</small>
                </span>
              </div>
            ) : null}
            <div className="portal-access__text">
              <h2 id="access-title" className="portal-kicker">
                {mn.account.access}
              </h2>
              <p className="portal-access__state">
                {accessUntil
                  ? mn.account.accessActive(formatDate(accessUntil))
                  : mn.account.accessInactive}
              </p>
              <p className="portal-muted">
                {accessUntil ? mn.account.daysLeft(daysLeft) : mn.account.inactiveText}
              </p>
              {open ? (
                <Link to="/pay" className="portal-linkbutton">
                  {mn.account.openRequestAction}
                </Link>
              ) : (
                <Link to="/plans" className="portal-linkbutton">
                  {accessUntil ? mn.account.renew : mn.account.getAccess}
                </Link>
              )}
              {paymentsOpen ? (
                <p className="portal-gift-links">
                  <Link to="/gift">{mn.gift.giveLink}</Link>
                  <Link to="/redeem">{mn.gift.redeemLink}</Link>
                  <Link to="/gifts">{mn.gift.myTitle}</Link>
                </p>
              ) : null}
            </div>
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
                  <dl className="portal-facts">
                    <div>
                      <dt>{mn.status.reference}</dt>
                      <dd>
                        <span className="portal-code">{subscription.referenceCode}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>{subscription.plan.name}</dt>
                      <dd>
                        <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                          {mn.account.statuses[subscription.status]}
                        </Badge>
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="portal-muted">{mn.status.nothing}</p>
                )}
              </>
            )}
          </section>
        </div>

        <div className="portal-account__col">
          <section className="portal-card" aria-labelledby="apps-title">
            <h2 id="apps-title" className="portal-card__title">
              {mn.account.appsTitle}
            </h2>
            <p className="portal-muted">{mn.account.appsText}</p>
            <StoreBadges />
          </section>

          <section className="portal-card" aria-labelledby="profile-title">
            <h2 id="profile-title" className="portal-card__title">
              {mn.account.infoTitle}
            </h2>
            <dl className="portal-facts">
              <div>
                <dt>
                  {user.lastName} {user.firstName}
                </dt>
                <dd>@{user.username}</dd>
              </div>
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
            <Link to="/delete-account" className="portal-danger-link">
              {mn.account.deleteAccount}
            </Link>
          </section>
        </div>
      </div>

      {!user.emailVerified && !open ? <Notice tone="warning">{mn.plans.verifyFirst}</Notice> : null}
    </div>
  );
}
