import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, Notice, Skeleton } from '@ongod/ui-web';
import { getMyGifts, mockGiftPayment } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatMnt } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/** The stand-in for the QPay checkout of a gift while there are no Wire keys (like MockCheckout). */
export default function MockGiftCheckout() {
  usePage({ title: mn.gift.mockMetaTitle, noindex: true });
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const gifts = useAsync((signal) => getMyGifts(signal));
  const [busy, setBusy] = useState<'success' | 'cancel'>();
  const [error, setError] = useState<unknown>();

  if (gifts.loading && !gifts.data) {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
      </div>
    );
  }
  const gift = gifts.data?.gifts.find((g) => g.id === id);
  if (!gift || gift.status !== 'PENDING_PAYMENT') return <Navigate to="/gifts" replace />;

  const decide = async (outcome: 'success' | 'cancel') => {
    setBusy(outcome);
    setError(undefined);
    try {
      await mockGiftPayment(id, outcome);
      navigate(outcome === 'success' ? '/gifts' : '/gift?canceled=1', { replace: true });
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
      <p className="portal-plan__price">{formatMnt(gift.amountMnt)}</p>
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
