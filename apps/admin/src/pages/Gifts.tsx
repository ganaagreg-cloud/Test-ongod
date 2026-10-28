import { useQuery } from '@tanstack/react-query';
import { giftStatusSchema, type AdminGiftDto, type GiftStatus } from '@ongod/shared';
import { Badge, Button, Input, useToast } from '@ongod/ui-web';
import { useMemo, useState, type FormEvent } from 'react';
import { giftsQuery, useVoidGift } from '../api/queries';
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
import { formatDateTime, formatMnt } from '../lib/format';
import { mn } from '../i18n/mn';

const STATUS_OPTIONS = giftStatusSchema.options;
const fullName = (u: { lastName: string; firstName: string }) =>
  `${u.lastName} ${u.firstName}`.trim();

/** Бэлэг (SPEC J, ADR-0060): gifts members bought for others, with Void for a paid, unredeemed one. */
export function GiftsPage() {
  const t = mn.gifts;
  const [status, setStatus] = useState<GiftStatus>('PAID');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(`${status}|${q}`);
  const [voiding, setVoiding] = useState<AdminGiftDto>();
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
          <strong>{fullName(row.original.buyer)}</strong>
          <br />
          <small>@{row.original.buyer.username}</small>
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
      <PageHeader title={t.title} subtitle={t.lead} />
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
