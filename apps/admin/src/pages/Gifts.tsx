import { useQuery } from '@tanstack/react-query';
import {
  GIFT_ISSUE_MAX,
  GIFT_VALID_DAYS,
  giftStatusSchema,
  type AdminGiftDto,
  type GiftStatus,
} from '@ongod/shared';
import { Badge, Button, Icon, Input, useToast } from '@ongod/ui-web';
import { useMemo, useState, type FormEvent } from 'react';
import { adminPlansQuery, giftsQuery, useIssueGifts, useVoidGift } from '../api/queries';
import {
  LoadError,
  PageHeader,
  Pager,
  SelectField,
  useDebounced,
  usePage,
} from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { errorText, Modal } from '../components/Modal';
import { formatDate, formatDateTime, formatMnt } from '../lib/format';
import { mn } from '../i18n/mn';

const STATUS_OPTIONS = giftStatusSchema.options;
const fullName = (u: { lastName: string; firstName: string }) =>
  `${u.lastName} ${u.firstName}`.trim();

/**
 * Бэлэг (SPEC J, ADR-0060): gifts members bought for others, with Void for a paid, unredeemed
 * one, and "Бэлгийн код үүсгэх": free one-time codes an admin makes (ADR-0091).
 */
export function GiftsPage() {
  const t = mn.gifts;
  const [status, setStatus] = useState<GiftStatus>('PAID');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(`${status}|${q}`);
  const [voiding, setVoiding] = useState<AdminGiftDto>();
  const [creating, setCreating] = useState(false);
  const list = useQuery(giftsQuery({ status, ...(q ? { q } : {}), page }));
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const col = columnsFor<AdminGiftDto>();
  const columns = [
    col.display({
      id: 'code',
      header: t.columns.code,
      cell: ({ row }) =>
        row.original.code ? (
          <code className="admin-code">{row.original.code}</code>
        ) : (
          mn.common.none
        ),
    }),
    col.display({
      id: 'buyer',
      header: t.columns.buyer,
      cell: ({ row }) => (
        <>
          <strong>{fullName(row.original.buyer)}</strong>{' '}
          {row.original.adminIssued ? <Badge tone="info">{t.adminIssued}</Badge> : null}
          <br />
          <small>{row.original.note ?? `@${row.original.buyer.username}`}</small>
        </>
      ),
    }),
    col.display({ id: 'plan', header: t.columns.plan, cell: ({ row }) => row.original.plan.name }),
    col.display({
      id: 'amount',
      header: t.columns.amount,
      cell: ({ row }) => formatMnt(row.original.amountMnt),
    }),
    col.display({
      id: 'paid',
      header: t.columns.paid,
      cell: ({ row }) =>
        row.original.paidAt ? formatDateTime(row.original.paidAt) : mn.common.none,
    }),
    col.display({
      id: 'recipient',
      header: t.columns.recipient,
      cell: ({ row }) =>
        row.original.redeemedBy ? `@${row.original.redeemedBy.username}` : mn.common.none,
    }),
    col.display({
      id: 'status',
      header: t.columns.status,
      cell: ({ row }) => (
        <Badge tone={row.original.status === 'PAID' ? 'active' : 'neutral'}>
          {t.statuses[row.original.status]}
        </Badge>
      ),
    }),
    col.display({
      id: 'actions',
      header: t.columns.actions,
      cell: ({ row }) =>
        row.original.status === 'PAID' ? (
          <Button variant="secondary" onClick={() => setVoiding(row.original)}>
            {t.void}
          </Button>
        ) : null,
    }),
  ];

  return (
    <>
      <PageHeader title={t.title} subtitle={t.lead}>
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" size="small" />
          {t.create}
        </Button>
      </PageHeader>
      <div className="admin-filters">
        <Input
          label={t.searchLabel}
          hint={t.searchHint}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={t.statusLabel}
          value={status}
          onChange={(value) => setStatus(value as GiftStatus)}
          options={STATUS_OPTIONS.map((value) => ({ value, label: t.statuses[value] }))}
        />
      </div>
      {list.data ? (
        <p className="admin-hint">{t.unredeemed(formatMnt(list.data.unredeemedMnt))}</p>
      ) : null}
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      <DataTable
        caption={t.title}
        columns={columns}
        data={items}
        getRowId={(row) => row.id}
        loading={list.isPending}
        empty={mn.common.empty}
      />
      {list.data ? (
        <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
      ) : null}

      <Modal open={creating} title={t.createTitle} onClose={() => setCreating(false)}>
        {creating ? <IssueForm onClose={() => setCreating(false)} /> : null}
      </Modal>

      <Modal open={voiding !== undefined} title={t.voidTitle} onClose={() => setVoiding(undefined)}>
        {voiding ? <VoidForm gift={voiding} onClose={() => setVoiding(undefined)} /> : null}
      </Modal>
    </>
  );
}

function VoidForm({ gift, onClose }: { gift: AdminGiftDto; onClose: () => void }) {
  const t = mn.gifts;
  const toast = useToast();
  const voidGift = useVoidGift();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    try {
      await voidGift.mutateAsync({ id: gift.id, reason: reason.trim() });
      toast.show(t.voided, { tone: 'success' });
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="admin-modal__body" onSubmit={(event) => void submit(event)} noValidate>
      <p>{t.voidText}</p>
      <Input
        label={t.reason}
        value={reason}
        maxLength={500}
        onChange={(event) => setReason(event.target.value)}
        required
        autoFocus
        {...(error ? { error } : {})}
      />
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={voidGift.isPending}>
          {mn.common.cancel}
        </Button>
        <Button
          type="submit"
          variant="destructive"
          loading={voidGift.isPending}
          disabled={reason.trim() === ''}
        >
          {t.void}
        </Button>
      </div>
    </form>
  );
}

/** A whole number from a text field; undefined when it is empty or not a whole number. */
const wholeNumber = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : undefined);

/**
 * "Бэлгийн код үүсгэх" (ADR-0091): plan, optional days, how many, a note. After creating, the
 * dialog shows the codes with one "copy all" button. One request key per opened form, so a
 * double click or a retry after a timeout cannot make a second batch.
 */
function IssueForm({ onClose }: { onClose: () => void }) {
  const t = mn.gifts;
  const toast = useToast();
  const plans = useQuery(adminPlansQuery());
  const issue = useIssueGifts();
  const [requestId] = useState(() => crypto.randomUUID());
  const [planId, setPlanId] = useState('');
  const [days, setDays] = useState('');
  const [count, setCount] = useState('1');
  const [note, setNote] = useState('');
  const [validDays, setValidDays] = useState('');
  const [error, setError] = useState<string>();
  const [made, setMade] = useState<AdminGiftDto[]>();

  const options = plans.data?.plans ?? [];
  const chosen = planId || options.find((plan) => plan.active)?.id || options[0]?.id || '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const n = wholeNumber(count);
    const d = days.trim() === '' ? undefined : wholeNumber(days);
    const v = validDays.trim() === '' ? undefined : wholeNumber(validDays);
    const bad =
      !chosen ||
      n === undefined ||
      n < 1 ||
      n > GIFT_ISSUE_MAX ||
      note.trim() === '' ||
      (days.trim() !== '' && (d === undefined || d < 1)) ||
      (validDays.trim() !== '' && (v === undefined || v < 1));
    if (bad) {
      setError(t.invalid);
      return;
    }
    try {
      const res = await issue.mutateAsync({
        planId: chosen,
        count: n,
        note: note.trim(),
        requestId,
        ...(d !== undefined ? { days: d } : {}),
        ...(v !== undefined ? { validDays: v } : {}),
      });
      setMade(res.gifts);
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (made) {
    const codes = made.flatMap((gift) => (gift.code ? [gift.code] : []));
    const expires = made[0]?.expiresAt;
    return (
      <div className="admin-modal__body">
        <p>
          <strong>{t.created(codes.length)}</strong>
        </p>
        <p className="admin-hint">{t.createdText}</p>
        <ul className="admin-code-list" aria-label={t.columns.code}>
          {codes.map((code) => (
            <li key={code}>
              <code className="admin-code">{code}</code>
            </li>
          ))}
        </ul>
        {expires ? (
          <p className="admin-hint">
            {t.expires}: {formatDate(expires)}
          </p>
        ) : null}
        <div className="admin-modal__actions">
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(codes.join('\n')).then(
                () => toast.show(t.copied, { tone: 'success' }),
                () => toast.show(t.copyFailed, { tone: 'danger' }),
              )
            }
          >
            {t.copyAll}
          </Button>
          <Button onClick={onClose}>{t.done}</Button>
        </div>
      </div>
    );
  }

  return (
    <form className="admin-modal__body" onSubmit={(event) => void submit(event)} noValidate>
      <p className="admin-hint">{t.createText}</p>
      {plans.error ? <LoadError error={plans.error} onRetry={() => void plans.refetch()} /> : null}
      {plans.data && options.length === 0 ? <p role="alert">{t.noPlans}</p> : null}
      <SelectField
        label={t.plan}
        value={chosen}
        onChange={setPlanId}
        options={options.map((plan) => ({
          value: plan.id,
          label: `${plan.name} · ${mn.plans.days(plan.durationDays)}${plan.active ? '' : t.planOff}`,
        }))}
      />
      <Input
        label={t.count}
        hint={t.countHint(GIFT_ISSUE_MAX)}
        value={count}
        inputMode="numeric"
        onChange={(event) => setCount(event.target.value)}
        required
      />
      <Input
        label={t.note}
        hint={t.noteHint}
        value={note}
        maxLength={200}
        onChange={(event) => setNote(event.target.value)}
        required
        autoFocus
      />
      <Input
        label={t.days}
        hint={t.daysHint}
        value={days}
        inputMode="numeric"
        onChange={(event) => setDays(event.target.value)}
      />
      <Input
        label={t.validDays}
        hint={t.validDaysHint(GIFT_VALID_DAYS)}
        value={validDays}
        inputMode="numeric"
        onChange={(event) => setValidDays(event.target.value)}
        {...(error ? { error } : {})}
      />
      <div className="admin-modal__actions">
        <Button variant="ghost" onClick={onClose} disabled={issue.isPending}>
          {mn.common.cancel}
        </Button>
        <Button type="submit" loading={issue.isPending} disabled={!chosen}>
          {t.submit}
        </Button>
      </div>
    </form>
  );
}
