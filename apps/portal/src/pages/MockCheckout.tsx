import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, Notice, Skeleton } from '@ongod/ui-web';
import { mockPayment, getCurrentSubscription } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/**
 * A stand-in for the QPay checkout while there are no Wire keys (ADR-0041). The API refuses it in
 * production, so on the live site the buttons only show an error.
 */
export default function MockCheckout() {
  usePage({ title: mn.mock.metaTitle, noindex: true });
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { reloadUser } = useAuth();
  const current = useAsync((signal) => getCurrentSubscription(signal));
  const [busy, setBusy] = useState<'success' | 'cancel'>();
  const [error, setError] = useState<unknown>();

  if (current.loading && !current.data) {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
      </div>
    );
  }
  const subscription = current.data?.subscription;
  if (!subscription || subscription.id !== id || subscription.status !== 'PENDING_PAYMENT') {
    return <Navigate to="/pay" replace />;
  }

  const decide = async (outcome: 'success' | 'cancel') => {
    setBusy(outcome);
    setError(undefined);
    try {
      await mockPayment(id, outcome);
      if (outcome === 'success') {
        void reloadUser();
        navigate('/status', { replace: true });
      } else {
        navigate('/pay?canceled=1', { replace: true });
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.mock.title}</h1>
      <Notice tone="warning">{mn.mock.devOnly}</Notice>
      <p className="portal-plan__price">{formatMnt(subscription.amountMnt)}</p>
      <ErrorNotice error={error} />
      <Button fullWidth loading={busy === 'success'} onClick={() => void decide('success')}>
        {mn.mock.success}
      </Button>
      <Button
        fullWidth
        variant="secondary"
        loading={busy === 'cancel'}
        onClick={() => void decide('cancel')}
      >
        {mn.mock.cancel}
      </Button>
    </div>
  );
}
