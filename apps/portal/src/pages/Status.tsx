import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router';
import type { z } from 'zod';
import type { currentSubscriptionResponseSchema } from '@ongod/shared';
import { Button, Notice, Skeleton, Timeline, useToast, type TimelineStep } from '@ongod/ui-web';
import { getCurrentSubscription } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

type Current = z.infer<typeof currentSubscriptionResponseSchema>;

/** How often a submitted payment is checked again while the page is open (SPEC D). */
export const STATUS_POLL_MS = 30_000;

export default function Status() {
  usePage({ title: mn.status.metaTitle, noindex: true });
  const toast = useToast();
  const { reloadUser } = useAuth();
  const first = useAsync((signal) => getCurrentSubscription(signal));
  const [live, setLive] = useState<Current>();
  const [pollError, setPollError] = useState<unknown>();

  const current = live ?? first.data;
  const status = current?.subscription?.status;

  const refresh = async () => {
    try {
      const next = await getCurrentSubscription();
      setLive(next);
      setPollError(undefined);
      // Only called while the payment is being checked, so ACTIVE here means it just got approved.
      if (next.subscription?.status === 'ACTIVE') {
        toast.show(mn.status.activeTitle, { tone: 'success' });
        void reloadUser();
      }
    } catch (err) {
      setPollError(err);
    }
  };

  // While the payment is being checked: look again every 30 s, and at once when the tab returns.
  useEffect(() => {
    if (status !== 'PAYMENT_SUBMITTED') return;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, STATUS_POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  if (first.loading && !first.data) {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
        <Skeleton shape="pill" width="100%" />
      </div>
    );
  }
  if (first.error) {
    return (
      <div className="portal-page portal-narrow">
        <ErrorNotice error={first.error} />
        <Button variant="secondary" onClick={first.reload}>
          {mn.common.retry}
        </Button>
      </div>
    );
  }

  const subscription = current?.subscription;
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

  const steps = timelineFor(subscription.status, subscription.endsAt);

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.status.title}</h1>
      <p className="portal-muted">
        {mn.status.reference}: <span className="portal-code">{subscription.referenceCode}</span>
      </p>

      {steps ? <Timeline steps={steps} stateLabels={mn.status.stateLabels} /> : null}

      {subscription.status === 'ACTIVE' ? (
        <Notice tone="success" title={mn.status.activeTitle}>
          {mn.status.activeNote}
        </Notice>
      ) : null}

      {subscription.status === 'REJECTED' ? (
        <>
          <Notice tone="danger" title={mn.status.rejectedTitle}>
            {subscription.rejectReason ? (
              <>
                {mn.status.reason}: {subscription.rejectReason}
              </>
            ) : null}
          </Notice>
          <Link to="/plans" className="portal-linkbutton">
            {mn.status.tryAgain}
          </Link>
        </>
      ) : null}

      {subscription.status === 'EXPIRED' ||
      subscription.status === 'CANCELLED' ||
      subscription.status === 'REVOKED' ? (
        <>
          <Notice tone="warning">{mn.status.expired}</Notice>
          <Link to="/plans" className="portal-linkbutton">
            {mn.status.choosePlan}
          </Link>
        </>
      ) : null}

      {status === 'PAYMENT_SUBMITTED' ? (
        <>
          <ErrorNotice error={pollError} />
          <Button variant="secondary" onClick={() => void refresh()}>
            {mn.status.refreshNow}
          </Button>
        </>
      ) : null}
    </div>
  );
}

/** Хүлээгдэж байна → Шалгаж байна → Идэвхжсэн (DESIGN.md "Portal screens"). */
function timelineFor(status: string, endsAt: string | null): TimelineStep[] | undefined {
  const received = { label: mn.status.received, text: mn.status.receivedText };
  const reviewing = { label: mn.status.reviewing, text: mn.status.reviewingText };
  const active = { label: mn.status.active };

  if (status === 'PAYMENT_SUBMITTED') {
    return [
      { ...received, state: 'done' },
      { ...reviewing, state: 'current' },
      { ...active, state: 'upcoming' },
    ];
  }
  if (status === 'ACTIVE') {
    return [
      { label: received.label, state: 'done' },
      { label: reviewing.label, state: 'done' },
      {
        ...active,
        state: 'done',
        ...(endsAt ? { text: mn.status.activeText(formatDate(endsAt)) } : {}),
      },
    ];
  }
  if (status === 'REJECTED') {
    return [
      { label: received.label, state: 'done' },
      { label: reviewing.label, state: 'done' },
    ];
  }
  return undefined;
}
