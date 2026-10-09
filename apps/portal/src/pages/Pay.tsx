import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { MAX_RECEIPT_BYTES } from '@ongod/shared';
import { Button, FileField, Notice, Skeleton, Textarea } from '@ongod/ui-web';
import { ApiError } from '../api/client';
import { getCurrentSubscription, submitPayment } from '../api/endpoints';
import { CopyRow } from '../components/CopyRow';
import { ErrorNotice } from '../components/ErrorNotice';
import { mn } from '../i18n/mn';
import { formatMnt, toLocalInputValue } from '../lib/format';
import { useAsync } from '../lib/useAsync';
import { usePage } from '../lib/usePage';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function Pay() {
  usePage({ title: mn.pay.metaTitle, noindex: true });
  const navigate = useNavigate();
  const current = useAsync((signal) => getCurrentSubscription(signal));

  const [transferAt, setTransferAt] = useState(() => toLocalInputValue(new Date()));
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState<string>();
  const [dateError, setDateError] = useState<string>();
  const [error, setError] = useState<unknown>();
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  if (current.loading && !current.data) {
    return (
      <div className="portal-page" role="status" aria-busy="true" aria-label={mn.common.loading}>
        <Skeleton width="60%" />
        <Skeleton shape="pill" width="100%" />
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
  if (subscription?.status === 'PAYMENT_SUBMITTED') return <Navigate to="/status" replace />;
  if (!subscription || subscription.status !== 'PENDING_PAYMENT') {
    return <Navigate to="/plans" replace />;
  }
  const bank = current.data?.bank;

  const pickFile = (picked: File | undefined) => {
    setFile(picked);
    if (!picked) return setFileError(undefined);
    if (!ALLOWED_TYPES.includes(picked.type)) return setFileError(mn.pay.fileType);
    if (picked.size > MAX_RECEIPT_BYTES) return setFileError(mn.pay.fileTooBig);
    setFileError(undefined);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    const when = new Date(transferAt);
    if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 60 * 60_000) {
      setDateError(mn.pay.futureDate);
      return;
    }
    setDateError(undefined);
    if (fileError) return;

    setBusy(true);
    try {
      await submitPayment(
        subscription.id,
        { transferAt: when.toISOString(), ...(note.trim() ? { payerNote: note.trim() } : {}) },
        file,
      );
      navigate('/status', { replace: true });
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'SUBSCRIPTION_EXPIRED' || err.code === 'SUBSCRIPTION_STATE')
      ) {
        setExpired(true);
      } else {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="portal-page portal-pay">
      <h1>{mn.pay.title}</h1>
      <p className="portal-lead">{mn.pay.lead(subscription.plan.name)}</p>

      <section aria-labelledby="bank-title" className="portal-card">
        <h2 id="bank-title">{mn.pay.bankTitle}</h2>
        {bank ? (
          <dl className="portal-copylist">
            <CopyRow label={mn.pay.bank} value={bank.bankName} />
            <CopyRow label={mn.pay.account} value={bank.accountNumber} />
            <CopyRow label={mn.pay.holder} value={bank.accountHolder} />
            <CopyRow
              label={mn.pay.amount}
              value={formatMnt(subscription.amountMnt)}
              copyValue={String(subscription.amountMnt)}
            />
            <CopyRow label={mn.pay.reference} value={subscription.referenceCode} big />
          </dl>
        ) : (
          <Notice tone="danger">{mn.common.errorGeneric}</Notice>
        )}
        <p className="portal-muted">{mn.pay.referenceNote}</p>
      </section>

      <section aria-labelledby="steps-title" className="portal-section">
        <h2 id="steps-title">{mn.pay.stepsTitle}</h2>
        <ol className="portal-steps">
          {mn.pay.steps.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="paid-title" className="portal-card">
        <h2 id="paid-title">{mn.pay.formTitle}</h2>
        {expired ? (
          <Notice tone="warning" title={mn.pay.expiredTitle}>
            {mn.pay.expiredText} <Link to="/plans">{mn.pay.newRequest}</Link>
          </Notice>
        ) : (
          <form className="portal-form" onSubmit={(e) => void onSubmit(e)} noValidate>
            <div className="ui-field">
              <label className="ui-field__label" htmlFor="transfer-at">
                {mn.pay.transferAt}
              </label>
              <input
                id="transfer-at"
                type="datetime-local"
                className="ui-field__input"
                value={transferAt}
                max={toLocalInputValue(new Date())}
                onChange={(e) => setTransferAt(e.target.value)}
                aria-invalid={dateError ? true : undefined}
                aria-describedby={dateError ? 'transfer-at-error' : undefined}
                required
              />
              {dateError ? (
                <p id="transfer-at-error" className="ui-field__message is-error">
                  {dateError}
                </p>
              ) : null}
            </div>
            <Textarea
              label={mn.pay.note}
              hint={mn.pay.noteHint}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <FileField
              label={mn.pay.receipt}
              hint={mn.pay.receiptHint}
              error={fileError}
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <ErrorNotice error={error} />
            <Button type="submit" fullWidth loading={busy} disabled={Boolean(fileError)}>
              {mn.pay.submit}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
