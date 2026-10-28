import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Skeleton } from '@ongod/ui-web';
import type { GiftDto } from '@ongod/shared';
import { getMyGifts } from '../api/endpoints';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate, formatMnt } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

/** The member comes back from the checkout here: ask again for a while until the payment shows. */
const POLL_MS = 4000;
const POLL_TRIES = 20;

const tone = (status: GiftDto['status']) =>
  status === 'PAID' ? 'active' : status === 'REDEEMED' ? 'success' : 'neutral';

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={() => {
        void navigator.clipboard
          .writeText(code)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? mn.gift.copied : mn.gift.copy}
    </Button>
  );
}

/** Миний бэлгүүд (SPEC J): what I bought, and the code of a paid gift to pass on. */
export default function MyGifts() {
  usePage({ title: mn.gift.myMetaTitle, noindex: true });
  const gifts = useAsync((signal) => getMyGifts(signal));
  const data = gifts.data;
  const list = useMemo(() => data?.gifts ?? [], [data]);
  const waiting = list.some((g) => g.status === 'PENDING_PAYMENT');
  const tries = useRef(0);
  const reload = gifts.reload;

  useEffect(() => {
    if (!waiting || tries.current >= POLL_TRIES) return;
    const timer = setTimeout(() => {
      tries.current += 1;
      reload();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, list, reload]);

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.gift.myTitle}</h1>
      <div className="portal-actions">
        <Link to="/gift" className="portal-linkbutton">
          {mn.gift.buyAnother}
        </Link>
        <Link to="/redeem" className="portal-linkbutton portal-linkbutton--secondary">
          {mn.gift.redeemLink}
        </Link>
      </div>
      <ErrorNotice error={gifts.error} />
      {gifts.loading && !gifts.data ? <Skeleton width="70%" /> : null}
      {gifts.data && list.length === 0 ? <p className="portal-muted">{mn.gift.empty}</p> : null}

      <ul className="portal-gifts">
        {list.map((gift) => (
          <li key={gift.id} className="portal-card">
            <div className="portal-gift__head">
              <h2 className="portal-card__title">{gift.plan.name}</h2>
              <Badge tone={tone(gift.status)}>{mn.gift.statuses[gift.status]}</Badge>
            </div>
            <p className="portal-muted">
              {formatMnt(gift.amountMnt)} · {mn.plans.duration(gift.durationDays)}
              {gift.paidAt ? ` · ${mn.gift.paidOn(formatDate(gift.paidAt))}` : ''}
              {gift.redeemedAt ? ` · ${mn.gift.redeemedOn(formatDate(gift.redeemedAt))}` : ''}
            </p>
            {gift.code ? (
              <div className="portal-giftcode">
                <span className="portal-muted">{mn.gift.code}</span>
                <strong className="portal-giftcode__value">{gift.code}</strong>
                <CopyCode code={gift.code} />
                {gift.expiresAt ? (
                  <span className="portal-muted">
                    {mn.gift.codeHint(formatDate(gift.expiresAt))}
                  </span>
                ) : null}
              </div>
            ) : null}
            {gift.status === 'PENDING_PAYMENT' ? (
              <>
                <p className="portal-muted" role="status">
                  {mn.gift.waiting}
                </p>
                {gift.checkoutUrl ? (
                  <a href={gift.checkoutUrl} className="portal-linkbutton">
                    {mn.gift.pay}
                  </a>
                ) : null}
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
