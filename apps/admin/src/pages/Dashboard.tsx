import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';
import type { DashboardDto } from '@ongod/shared';
import { Badge, Button, Icon, Skeleton } from '@ongod/ui-web';
import { dashboardQuery } from '../api/queries';
import { LoadError, MediaBadge, PageHeader, useNow } from '../components/bits';
import { formatDate, formatMnt } from '../lib/format';
import { whenLabel } from '../lib/when';
import { mn } from '../i18n/mn';

const t = mn.dashboard;
const DAY_MS = 86_400_000;

const nameOf = (u: { firstName: string; lastName: string; username: string }) =>
  `${u.lastName} ${u.firstName}`.trim() || u.username;

/**
 * What the owner checks first (ADR-0056): the month's money and the counts in one strip, then
 * the latest payments, what goes out next, broken files and members whose access ends soon.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { data, error, refetch } = useQuery(dashboardQuery());

  return (
    <>
      <PageHeader title={t.title}>
        <Button variant="secondary" onClick={() => void navigate('/users')}>
          <Icon name="profile" size="small" />
          {t.users}
        </Button>
        <Button onClick={() => void navigate('/episodes/new')}>
          <Icon name="plus" size="small" />
          {t.newEpisode}
        </Button>
      </PageHeader>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      {data ? <Overview data={data} /> : <Loading />}
    </>
  );
}

function Loading() {
  return (
    <ul className="admin-counters" aria-busy="true">
      {Array.from({ length: 5 }, (_, i) => (
        <li key={i} className="admin-counter">
          <Skeleton width="40%" />
          <Skeleton width="70%" />
        </li>
      ))}
    </ul>
  );
}

function Overview({ data }: { data: DashboardDto }) {
  const now = useNow();
  const { revenue, mediaProblems } = data;

  return (
    <>
      <ul className="admin-counters">
        <Counter
          value={formatMnt(revenue.thisMonthMnt)}
          label={t.revenue}
          note={`${t.paymentsCount(revenue.paymentsThisMonth)} · ${t.lastMonth(formatMnt(revenue.lastMonthMnt))}`}
          to="/payments"
        />
        <Counter value={data.activeUsers} label={t.activeUsers} to="/users" />
        <Counter
          value={data.pendingPayment}
          label={t.pendingPayment}
          to="/payments?status=PENDING_PAYMENT"
        />
        <Counter value={data.expiringIn30Days} label={t.expiringIn30Days} />
        <Counter value={data.newUsersThisWeek} label={t.newUsersThisWeek} to="/users" />
      </ul>

      <div className="admin-dash-grid">
        <Card title={t.recentPayments} to="/payments" empty={t.noPayments}>
          {data.recentPayments.map((p) => {
            const when = whenLabel(p.createdAt, now);
            return (
              <Row key={p.id} to={`/users/${p.user.id}`}>
                <span className="admin-dash-row__main">
                  <strong>{nameOf(p.user)}</strong>
                  <small className="admin-code">{p.referenceCode}</small>
                </span>
                <span className="admin-dash-row__side">
                  <strong>{formatMnt(p.amountMnt)}</strong>
                  <small title={when.title}>{when.text}</small>
                </span>
              </Row>
            );
          })}
        </Card>

        <Card title={t.upcoming} to="/episodes?status=SCHEDULED" empty={t.noUpcoming}>
          {data.upcoming.map((e) => {
            const when = whenLabel(e.scheduledFor, now);
            return (
              <Row key={e.id} to={`/episodes/${e.id}`}>
                <strong className="admin-dash-row__main">{e.title}</strong>
                <span className="admin-dash-row__side" title={when.title}>
                  {when.text}
                </span>
              </Row>
            );
          })}
        </Card>

        <Card
          title={t.mediaProblems}
          subtitle={
            mediaProblems.items.length > 0
              ? t.mediaSummary(mediaProblems.failed, mediaProblems.stuck)
              : undefined
          }
          empty={t.noMediaProblems}
        >
          {mediaProblems.items.map((m) => (
            <Row key={m.episodeId} to={`/episodes/${m.episodeId}`}>
              <span className="admin-dash-row__main">
                <strong>{m.title}</strong>
                {m.failReason ? <small>{m.failReason}</small> : null}
              </span>
              <span className="admin-dash-row__side">
                {m.status === 'FAILED' ? (
                  <MediaBadge status="FAILED" />
                ) : (
                  <Badge tone="warning">{t.stuck}</Badge>
                )}
              </span>
            </Row>
          ))}
        </Card>

        <Card title={t.expiringSoon} empty={t.noExpiring}>
          {data.expiringSoon.map((u) => (
            <Row key={u.id} to={`/users/${u.id}`}>
              <span className="admin-dash-row__main">
                <strong>{nameOf(u)}</strong>
                <small>@{u.username}</small>
              </span>
              <span className="admin-dash-row__side">
                <strong>{t.daysLeft(Math.ceil((Date.parse(u.accessUntil) - now) / DAY_MS))}</strong>
                <small>{formatDate(u.accessUntil)}</small>
              </span>
            </Row>
          ))}
        </Card>
      </div>
    </>
  );
}

function Counter({
  value,
  label,
  note,
  to,
}: {
  value: ReactNode;
  label: string;
  note?: string;
  to?: string;
}) {
  const body = (
    <>
      <span className="admin-counter__value">{value}</span>
      <span className="admin-counter__label">{label}</span>
      {note ? <span className="admin-counter__note">{note}</span> : null}
    </>
  );
  return (
    <li className="admin-counter">
      {to ? (
        <Link to={to} className="admin-counter__link">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function Card({
  title,
  subtitle,
  to,
  empty,
  children,
}: {
  title: string;
  subtitle?: string | undefined;
  to?: string;
  empty: string;
  children: ReactNode[];
}) {
  return (
    <section className="admin-card admin-dash-card" aria-label={title}>
      <header className="admin-dash-card__head">
        <h2 className="admin-card__title">{title}</h2>
        {subtitle ? <span className="admin-hint">{subtitle}</span> : null}
        {to ? (
          <Link to={to} className="admin-dash-card__all">
            {t.all}
            <Icon name="chevronRight" size="small" />
          </Link>
        ) : null}
      </header>
      {children.length > 0 ? (
        <ul className="admin-dash-list">{children}</ul>
      ) : (
        <p className="admin-hint">{empty}</p>
      )}
    </section>
  );
}

function Row({ to, children }: { to: string; children: ReactNode }) {
  return (
    <li>
      <Link to={to} className="admin-dash-row">
        {children}
      </Link>
    </li>
  );
}
