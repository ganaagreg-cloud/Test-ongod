import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button, Notice, Skeleton } from '@ongod/ui-web';
import { createGift, getPlans } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { PlanCard } from '../components/PlanCard';
import { mn } from '../i18n/mn';
import { openCheckout } from '../lib/checkout';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/** Эрх бэлэглэх (SPEC J, ADR-0060): pick a plan and pay; the code comes after the payment. */
export default function GiftBuy() {
  usePage({ title: mn.gift.buyMetaTitle, noindex: true });
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const plans = useAsync(() => getPlans());
  // Off before launch (ADR-0072): nothing can be bought, so no gift either.
  const paymentsOpen = plans.data?.paymentsOpen ?? true;
  const [choosing, setChoosing] = useState<string>();
  const [error, setError] = useState<unknown>();
  const verified = user?.emailVerified ?? false;

  const choose = async (planId: string) => {
    setChoosing(planId);
    setError(undefined);
    try {
      const { gift } = await createGift(planId);
      if (gift.checkoutUrl) openCheckout(gift.checkoutUrl, navigate);
      else navigate('/gifts');
    } catch (err) {
      setError(err);
    } finally {
      setChoosing(undefined);
    }
  };

  return (
    <div className="portal-page">
      <h1>{mn.gift.buyTitle}</h1>
      <p className="portal-lead">{mn.gift.buyLead}</p>

      {params.get('canceled') ? <Notice tone="warning">{mn.gift.canceled}</Notice> : null}
      {!verified ? (
        <Notice tone="warning">
          {mn.gift.verifyFirst}{' '}
          <Link to="/verify" state={{ next: '/gift' }}>
            {mn.plans.verifyAction}
          </Link>
        </Notice>
      ) : null}
      <ErrorNotice error={error ?? plans.error} />
      {paymentsOpen ? null : <Notice tone="info">{mn.landing.paymentsClosed}</Notice>}

      <div className="portal-plans" aria-busy={plans.loading}>
        {plans.loading && !plans.data ? (
          <div className="portal-card">
            <Skeleton width="50%" />
            <Skeleton shape="pill" width="100%" />
          </div>
        ) : null}
        {plans.data?.plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} heading="h2">
            {paymentsOpen ? (
              <Button
                fullWidth
                loading={choosing === plan.id}
                disabled={!verified || choosing !== undefined}
                onClick={() => void choose(plan.id)}
              >
                {mn.gift.choose}
              </Button>
            ) : null}
          </PlanCard>
        ))}
        {plans.data && plans.data.plans.length === 0 ? <p>{mn.plans.empty}</p> : null}
      </div>

      <section className="portal-section" aria-labelledby="gift-how">
        <h2 id="gift-how">{mn.gift.howTitle}</h2>
        <ol className="portal-list">
          {mn.gift.how.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <p>
        <Link to="/gifts">{mn.gift.myTitle}</Link>
      </p>
    </div>
  );
}
