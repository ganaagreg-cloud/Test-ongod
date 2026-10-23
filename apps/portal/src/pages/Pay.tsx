import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';
import type { currentSubscriptionResponseSchema } from '@ongod/shared';
import { Button, Notice, Skeleton } from '@ongod/ui-web';
import { getCurrentSubscription } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';
import { openCheckout } from '../lib/checkout';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

type Current = z.infer<typeof currentSubscriptionResponseSchema>;

/** Every 2 s at first, every 4 s after 40 s, and it stops after 10 minutes (ADR-0041). */
const FAST_MS = 2_000;
const SLOW_MS = 4_000;
const SLOW_AFTER_MS = 40_000;
const GIVE_UP_MS = 10 * 60_000;

/** The waiting room for a QPay payment: pay at the checkout, come back here, access arrives by itself. */
export default function Pay() {
  usePage({ title: mn.pay.metaTitle, noindex: true });
  const navigate = useNavigate();
  const { reloadUser } = useAuth();
  const [params] = useSearchParams();
  const canceledAtCheckout = params.get('canceled') === '1';
  const first = useAsync((signal) => getCurrentSubscription(signal));
  const [live, setLive] = useState<Current>();
  const [stopped, setStopped] = useState(false);

  const current = live ?? first.data;
  const subscription = current?.subscription;
  const waiting = subscription?.status === 'PENDING_PAYMENT';

  // Ask the API (which asks Wire) until the payment shows up as ACTIVE.
  useEffect(() => {
    if (!waiting) return;
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > GIVE_UP_MS) return setStopped(true);
      if (document.visibilityState === 'visible') {
        try {
          const next = await getCurrentSubscription();
          if (cancelled) return;
          setLive(next);
          if (next.subscription?.status === 'ACTIVE') {
            void reloadUser();
            navigate('/status', { replace: true });
            return;
          }
        } catch {
          // The next round tries again.
        }
      }
      const slow = Date.now() - startedAt > SLOW_AFTER_MS;
      timer = setTimeout(() => void tick(), slow ? SLOW_MS : FAST_MS);
    };
    timer = setTimeout(() => void tick(), FAST_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [waiting, navigate, reloadUser]);

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

  if (!subscription) return <Navigate to="/plans" replace />;
  if (subscription.status === 'ACTIVE') return <Navigate to="/status" replace />;
  if (subscription.status !== 'PENDING_PAYMENT') {
    // Cancelled at the checkout, expired or closed: start again.
    return <Navigate to="/plans" replace />;
  }

  return (
    <div className="portal-page portal-narrow portal-pay">
      <h1>{mn.pay.title}</h1>
      <p className="portal-lead">{mn.pay.lead(subscription.plan.name)}</p>

      <section aria-labelledby="pay-summary" className="portal-card">
        <h2 id="pay-summary">{mn.pay.amount}</h2>
        <p className="portal-plan__price">{formatMnt(subscription.amountMnt)}</p>
        <p className="portal-muted">{mn.pay.qpayNote}</p>
        {canceledAtCheckout ? <Notice tone="warning">{mn.pay.canceled}</Notice> : null}
        {subscription.checkoutUrl ? (
          <Button fullWidth onClick={() => openCheckout(subscription.checkoutUrl!, navigate)}>
            {mn.pay.payWithQpay}
          </Button>
        ) : (
          <Notice tone="danger">{mn.common.errorGeneric}</Notice>
        )}
      </section>

      <section aria-live="polite" className="portal-section">
        {stopped ? (
          <Notice tone="info">{mn.pay.stopped}</Notice>
        ) : (
          <p className="portal-muted" role="status">
            {mn.pay.waiting}
          </p>
        )}
      </section>
    </div>
  );
}
