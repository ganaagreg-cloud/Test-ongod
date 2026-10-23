import { Link, Navigate } from 'react-router';
import { Button, Notice, Skeleton, Timeline, type TimelineStep } from '@ongod/ui-web';
import { getCurrentSubscription } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/** Where a request ends up: active after a QPay payment (ADR-0041), else closed. */
export default function Status() {
  usePage({ title: mn.status.metaTitle, noindex: true });
  const current = useAsync((signal) => getCurrentSubscription(signal));

  if (current.loading && !current.data) {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
        <Skeleton shape="pill" width="100%" />
      </div>
    );
  }
  if (current.error) {
    return (
      <div className="portal-page portal-narrow">
        <ErrorNotice error={current.error} />
        <Button variant="secondary" onClick={current.reload}>
          {mn.common.retry}
        </Button>
      </div>
    );
  }

  const subscription = current.data?.subscription;
  if (!subscription) {
    return (
      <div className="portal-page portal-narrow">
        <h1>{mn.status.title}</h1>
        <p>{mn.status.nothing}</p>
        <Link to="/plans" className="portal-linkbutton">
          {mn.status.choosePlan}
        </Link>
      </div>
    );
  }
  if (subscription.status === 'PENDING_PAYMENT') return <Navigate to="/pay" replace />;

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.status.title}</h1>
      <p className="portal-muted">
        {mn.status.reference}: <span className="portal-code">{subscription.referenceCode}</span>
      </p>

      {subscription.status === 'ACTIVE' ? (
        <>
          <Timeline steps={activeSteps(subscription.endsAt)} stateLabels={mn.status.stateLabels} />
          <Notice tone="success" title={mn.status.activeTitle}>
            {mn.status.activeNote}
          </Notice>
        </>
      ) : (
        // Expired, cancelled or revoked: start again with a plan.
        <>
          <Notice tone="warning">{mn.status.expired}</Notice>
          <Link to="/plans" className="portal-linkbutton">
            {mn.status.choosePlan}
          </Link>
        </>
      )}
    </div>
  );
}

/** Хүлээгдэж байна → Идэвхжсэн (DESIGN.md "Portal screens"). */
function activeSteps(endsAt: string | null): TimelineStep[] {
  return [
    { label: mn.status.received, state: 'done' },
    {
      label: mn.status.active,
      state: 'done',
      ...(endsAt ? { text: mn.status.activeText(formatDate(endsAt)) } : {}),
    },
  ];
}
