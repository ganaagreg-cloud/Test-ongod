import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Notice, Skeleton } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { createSubscription, getPlans } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { PlanCard } from '../components/PlanCard';
import { mn } from '../i18n/mn';
import { openCheckout } from '../lib/checkout';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

export default function Plans() {
  usePage({ title: mn.plans.metaTitle, description: mn.plans.metaDescription });
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const plans = useAsync(() => getPlans());
  // Off before launch (ADR-0072): the plans stay visible, without the buy buttons.
  const paymentsOpen = plans.data?.paymentsOpen ?? true;
  const [choosing, setChoosing] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [needsVerify, setNeedsVerify] = useState(false);

  const verified = user?.emailVerified ?? false;
  const hasAccess = user?.accessUntil ? new Date(user.accessUntil) > new Date() : false;

  const choose = async (planId: string) => {
    setChoosing(planId);
    setError(undefined);
    setNeedsVerify(false);
    try {
      const { subscription } = await createSubscription(planId);
      if (subscription.checkoutUrl) openCheckout(subscription.checkoutUrl, navigate);
      else navigate('/pay');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'OPEN_SUBSCRIPTION_EXISTS') {
        navigate('/pay');
      } else if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        setNeedsVerify(true);
      } else {
        setError(err);
      }
    } finally {
      setChoosing(undefined);
    }
  };

  return (
    <div className="portal-page">
      <h1>{mn.plans.title}</h1>
      <p className="portal-lead">{mn.plans.lead}</p>

      {status === 'authenticated' && !verified ? (
        <Notice tone="warning">
          {mn.plans.verifyFirst}{' '}
          <Link to="/verify" state={{ next: '/plans' }}>
            {mn.plans.verifyAction}
          </Link>
        </Notice>
      ) : null}
      {needsVerify ? (
        <Notice tone="warning">
          {mn.plans.verifyFirst}{' '}
          <Link to="/verify" state={{ next: '/plans' }}>
            {mn.plans.verifyAction}
          </Link>
        </Notice>
      ) : null}
      <ErrorNotice error={error ?? plans.error} />
      {paymentsOpen ? null : <Notice tone="info">{mn.landing.paymentsClosed}</Notice>}
      {hasAccess ? <Notice tone="info">{mn.plans.renewNote}</Notice> : null}

      <div className="portal-plans" aria-busy={plans.loading}>
        {plans.loading && !plans.data ? (
          <div className="portal-card">
            <Skeleton width="50%" />
            <Skeleton width="35%" />
            <Skeleton shape="pill" width="100%" />
          </div>
        ) : null}
        {plans.data?.plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} heading="h2">
            {!paymentsOpen ? null : status === 'authenticated' ? (
              <Button
                fullWidth
                loading={choosing === plan.id}
                disabled={!verified || choosing !== undefined}
                onClick={() => void choose(plan.id)}
              >
                {mn.plans.choose}
              </Button>
            ) : (
              <Link to="/register" className="portal-linkbutton portal-linkbutton--full">
                {mn.plans.registerToChoose}
              </Link>
            )}
          </PlanCard>
        ))}
        {plans.data && plans.data.plans.length === 0 ? <p>{mn.plans.empty}</p> : null}
      </div>
      {status === 'authenticated' && paymentsOpen ? (
        <p>
          <Link to="/gift">{mn.gift.giveLink}</Link>
        </p>
      ) : null}
    </div>
  );
}
