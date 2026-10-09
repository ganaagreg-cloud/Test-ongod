import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@ongod/ui-web';
import { Link } from 'react-router';
import { dashboardQuery } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { mn } from '../i18n/mn';

export function DashboardPage() {
  const { data, error, refetch } = useQuery(dashboardQuery());

  const counters = data
    ? [
        { key: 'paymentSubmitted', value: data.paymentSubmitted, to: '/payments', emphasis: true },
        { key: 'pendingPayment', value: data.pendingPayment },
        { key: 'activeUsers', value: data.activeUsers },
        { key: 'expiringIn30Days', value: data.expiringIn30Days },
        { key: 'newUsersThisWeek', value: data.newUsersThisWeek },
      ].map((counter) => ({
        ...counter,
        label: mn.dashboard[counter.key as keyof typeof mn.dashboard],
      }))
    : undefined;

  return (
    <>
      <PageHeader title={mn.dashboard.title} />
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : null}
      <ul className="admin-counters" aria-busy={!data || undefined}>
        {counters
          ? counters.map((counter) => (
              <li
                key={counter.key}
                className={
                  counter.emphasis && counter.value > 0
                    ? 'admin-counter is-attention'
                    : 'admin-counter'
                }
              >
                <span className="admin-counter__value">{counter.value}</span>
                <span className="admin-counter__label">{String(counter.label)}</span>
                {counter.to ? (
                  <Link className="admin-counter__link" to={counter.to}>
                    {mn.dashboard.openQueue}
                  </Link>
                ) : null}
              </li>
            ))
          : Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="admin-counter">
                <Skeleton width="40%" />
                <Skeleton width="70%" />
              </li>
            ))}
      </ul>
    </>
  );
}
