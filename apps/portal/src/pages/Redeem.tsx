import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, Input, Notice } from '@ongod/ui-web';
import { normalizeGiftCode } from '@ongod/shared';
import { redeemGift } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatDate } from '../lib/format';
import { usePage } from '../lib/usePage';

/** Бэлгийн код ашиглах (SPEC J): the code from the link (?code=) or typed in. */
export default function Redeem() {
  usePage({ title: mn.gift.redeemMetaTitle, noindex: true });
  const { user, reloadUser } = useAuth();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('code') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [until, setUntil] = useState<string | null>();
  const [invalid, setInvalid] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const normalized = normalizeGiftCode(code);
    setInvalid(normalized.length !== 12);
    if (normalized.length !== 12) return;
    setBusy(true);
    try {
      const result = await redeemGift(normalized);
      setUntil(result.accessUntil);
      void reloadUser();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (until !== undefined) {
    return (
      <div className="portal-page portal-narrow">
        <h1>{mn.gift.redeemedTitle}</h1>
        {until ? <Notice tone="success">{mn.gift.redeemedText(formatDate(until))}</Notice> : null}
        <p>{mn.gift.redeemedNote}</p>
        <Link to="/account" className="portal-linkbutton">
          {mn.gift.toAccount}
        </Link>
      </div>
    );
  }

  return (
    <div className="portal-page portal-narrow">
      <h1>{mn.gift.redeemTitle}</h1>
      <p className="portal-lead">{mn.gift.redeemLead}</p>
      {user && !user.emailVerified ? (
        <Notice tone="warning">
          {mn.plans.verifyFirst}{' '}
          <Link to="/verify" state={{ next: '/redeem' }}>
            {mn.plans.verifyAction}
          </Link>
        </Notice>
      ) : null}
      <form className="portal-form" onSubmit={(event) => void submit(event)} noValidate>
        <Input
          label={mn.gift.redeemCode}
          hint={mn.gift.redeemCodeHint}
          name="code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          error={invalid ? mn.gift.redeemInvalid : undefined}
          required
        />
        <ErrorNotice error={error} />
        <Button type="submit" fullWidth loading={busy}>
          {mn.gift.redeemSubmit}
        </Button>
      </form>
      <p>
        <Link to="/gifts">{mn.gift.myTitle}</Link>
      </p>
    </div>
  );
}
