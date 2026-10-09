import { useMutation, useQuery } from '@tanstack/react-query';
import type { AdminSubscriptionDto, SubscriptionStatus } from '@ongod/shared';
import { Button, Input, Skeleton, useToast } from '@ongod/ui-web';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  downloadPaymentsCsv,
  subscriptionHistoryQuery,
  subscriptionsQuery,
  useDecisions,
  useReceiptImage,
} from '../api/queries';
import {
  Fact,
  LoadError,
  PageHeader,
  Pager,
  SelectField,
  SubscriptionBadge,
  useDebounced,
  usePage,
} from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { ConfirmDialog, isModalOpen, Modal } from '../components/Modal';
import { formatDateTime, formatMnt, todayUlaanbaatar } from '../lib/format';
import { mn } from '../i18n/mn';

const STATUS_OPTIONS: SubscriptionStatus[] = [
  'PAYMENT_SUBMITTED',
  'ACTIVE',
  'REJECTED',
  'REVOKED',
  'PENDING_PAYMENT',
  'EXPIRED',
];

const fullName = (u: AdminSubscriptionDto['user']) => `${u.lastName} ${u.firstName}`.trim();

const col = columnsFor<AdminSubscriptionDto>();
const columns = [
  col.display({
    id: 'reference',
    header: mn.payments.columns.reference,
    cell: ({ row }) => <code className="admin-code">{row.original.referenceCode}</code>,
  }),
  col.display({
    id: 'user',
    header: mn.payments.columns.user,
    cell: ({ row }) => (
      <>
        <strong>{fullName(row.original.user)}</strong>
        <br />
        <small>@{row.original.user.username}</small>
      </>
    ),
  }),
  col.display({
    id: 'amount',
    header: mn.payments.columns.amount,
    cell: ({ row }) => formatMnt(row.original.amountMnt),
  }),
  col.display({
    id: 'submitted',
    header: mn.payments.columns.submitted,
    cell: ({ row }) =>
      row.original.submittedAt ? formatDateTime(row.original.submittedAt) : mn.common.none,
  }),
  col.display({
    id: 'status',
    header: mn.payments.columns.status,
    cell: ({ row }) => <SubscriptionBadge status={row.original.status} />,
  }),
];

type Dialog = 'approve' | 'reject' | 'export' | null;

/** True when the key press is meant for a text field or a control, not for a shortcut. */
function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PaymentsPage() {
  const toast = useToast();
  const [status, setStatus] = useState<SubscriptionStatus>('PAYMENT_SUBMITTED');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(`${status}|${q}`);
  const [selectedId, setSelectedId] = useState<string>();
  const [dialog, setDialog] = useState<Dialog>(null);

  const list = useQuery(subscriptionsQuery({ status, ...(q ? { q } : {}), page }));
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selected = items.find((item) => item.id === selectedId);
  const { approve, reject } = useDecisions();

  /** After a decision the next row in the queue is selected, so the admin can keep going. */
  function nextAfter(id: string): string | undefined {
    const index = items.findIndex((item) => item.id === id);
    return (items[index + 1] ?? items[index - 1])?.id;
  }

  // Keyboard: J/K (or arrows) move, A approves, R rejects, Esc closes the panel.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isModalOpen()) return;
    if (event.key === 'Escape') {
      setSelectedId(undefined);
      return;
    }
    if (typingTarget(event.target)) return;
    const index = items.findIndex((item) => item.id === selectedId);
    switch (event.key.toLowerCase()) {
      case 'j':
      case 'arrowdown':
        // Arrow keys only move the selection once there is one; before that they scroll the page.
        if (event.key !== 'ArrowDown' || index >= 0) {
          event.preventDefault();
          setSelectedId(items[Math.min(index + 1, items.length - 1)]?.id);
        }
        break;
      case 'k':
      case 'arrowup':
        if (event.key !== 'ArrowUp' || index >= 0) {
          event.preventDefault();
          setSelectedId(items[Math.max(index - 1, 0)]?.id);
        }
        break;
      case 'a':
        if (selected?.status === 'PAYMENT_SUBMITTED') setDialog('approve');
        break;
      case 'r':
        if (selected?.status === 'PAYMENT_SUBMITTED') setDialog('reject');
        break;
    }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <PageHeader title={mn.payments.title}>
        <Button variant="secondary" onClick={() => setDialog('export')}>
          {mn.payments.export.title}
        </Button>
      </PageHeader>

      <div className="admin-filters">
        <Input
          label={mn.payments.searchLabel}
          hint={mn.payments.searchHint}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={mn.payments.statusLabel}
          value={status}
          onChange={(value) => setStatus(value as SubscriptionStatus)}
          options={STATUS_OPTIONS.map((value) => ({
            value,
            label: value === 'PAYMENT_SUBMITTED' ? mn.payments.queue : mn.subscriptionStatus[value],
          }))}
        />
      </div>
      <p className="admin-hint">{mn.payments.shortcuts}</p>

      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}

      <div className={selected ? 'admin-split has-panel' : 'admin-split'}>
        <section aria-label={mn.payments.title}>
          <DataTable
            caption={mn.payments.title}
            columns={columns}
            data={items}
            getRowId={(row) => row.id}
            loading={list.isPending}
            selectedId={selectedId}
            onRowOpen={(row) => setSelectedId(row.id)}
            empty={status === 'PAYMENT_SUBMITTED' ? mn.payments.emptyQueue : mn.common.empty}
          />
          {list.data ? (
            <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          ) : null}
        </section>

        {selected ? (
          <PaymentPanel
            subscription={selected}
            onClose={() => setSelectedId(undefined)}
            onApprove={() => setDialog('approve')}
            onReject={() => setDialog('reject')}
          />
        ) : null}
      </div>

      <ConfirmDialog
        open={dialog === 'approve' && selected !== undefined}
        title={mn.payments.approveConfirmTitle}
        text={
          selected
            ? mn.payments.approveConfirmText(selected.referenceCode, fullName(selected.user))
            : undefined
        }
        confirmLabel={mn.payments.approve}
        onClose={() => setDialog(null)}
        onConfirm={async () => {
          if (!selected) return;
          const next = nextAfter(selected.id);
          await approve.mutateAsync(selected.id);
          toast.show(mn.payments.approved, { tone: 'success' });
          setSelectedId(next);
        }}
      />
      <ConfirmDialog
        open={dialog === 'reject' && selected !== undefined}
        title={mn.payments.rejectTitle}
        text={mn.payments.rejectText}
        reason={{ label: mn.payments.rejectReason }}
        confirmLabel={mn.payments.rejectSubmit}
        tone="destructive"
        onClose={() => setDialog(null)}
        onConfirm={async (reason) => {
          if (!selected) return;
          const next = nextAfter(selected.id);
          await reject.mutateAsync({ id: selected.id, reason });
          toast.show(mn.payments.rejected, { tone: 'success' });
          setSelectedId(next);
        }}
      />
      <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
    </>
  );
}

function PaymentPanel({
  subscription: s,
  onClose,
  onApprove,
  onReject,
}: {
  subscription: AdminSubscriptionDto;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const history = useQuery(subscriptionHistoryQuery(s.id));
  const decidable = s.status === 'PAYMENT_SUBMITTED';

  return (
    <aside className="admin-panel" aria-label={mn.payments.panel.title}>
      <div className="admin-panel__header">
        <h2 className="admin-panel__title">{mn.payments.panel.title}</h2>
        <SubscriptionBadge status={s.status} />
        <Button variant="ghost" onClick={onClose}>
          {mn.common.close}
        </Button>
      </div>

      <dl className="admin-facts">
        <Fact label={mn.payments.panel.reference}>
          <code className="admin-code admin-code--large">{s.referenceCode}</code>
        </Fact>
        <Fact label={mn.payments.panel.amount}>
          <strong>{formatMnt(s.amountMnt)}</strong> · {s.plan.name}
        </Fact>
        <Fact label={mn.payments.panel.user}>
          <Link to={`/users/${s.user.id}`}>
            {fullName(s.user)} (@{s.user.username})
          </Link>
        </Fact>
        <Fact label={mn.payments.panel.email}>{s.user.email}</Fact>
        <Fact label={mn.payments.panel.phone}>{s.user.phone}</Fact>
        <Fact label={mn.payments.panel.transferAt}>
          {s.transferAt ? formatDateTime(s.transferAt) : mn.common.none}
        </Fact>
        <Fact label={mn.payments.panel.submittedAt}>
          {s.submittedAt ? formatDateTime(s.submittedAt) : mn.common.none}
        </Fact>
        <Fact label={mn.payments.panel.payerNote}>{s.payerNote ?? mn.common.none}</Fact>
        {s.startsAt && s.endsAt ? (
          <Fact label={mn.payments.panel.period}>
            {formatDateTime(s.startsAt)} → {formatDateTime(s.endsAt)}
          </Fact>
        ) : null}
        {s.rejectReason ? (
          <Fact label={mn.payments.panel.rejectReason}>{s.rejectReason}</Fact>
        ) : null}
        {s.decidedBy ? (
          <Fact label={mn.payments.panel.decidedBy}>
            @{s.decidedBy.username}
            {s.decidedAt ? ` · ${formatDateTime(s.decidedAt)}` : ''}
          </Fact>
        ) : null}
      </dl>

      <section aria-labelledby={`receipt-${s.id}`}>
        <h3 id={`receipt-${s.id}`} className="admin-panel__subtitle">
          {mn.payments.panel.receipt}
        </h3>
        <Receipt subscription={s} />
      </section>

      {decidable ? (
        <div className="admin-panel__actions">
          <Button onClick={onApprove}>
            {mn.payments.approve} <kbd>A</kbd>
          </Button>
          <Button variant="destructive" onClick={onReject}>
            {mn.payments.reject} <kbd>R</kbd>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby={`history-${s.id}`}>
        <h3 id={`history-${s.id}`} className="admin-panel__subtitle">
          {mn.payments.panel.history}
        </h3>
        {history.isPending ? <Skeleton width="60%" /> : null}
        {history.error ? (
          <LoadError error={history.error} onRetry={() => void history.refetch()} />
        ) : null}
        {history.data && history.data.items.length === 0 ? (
          <p className="admin-hint">{mn.payments.panel.noHistory}</p>
        ) : null}
        <ul className="admin-history">
          {history.data?.items.map((entry) => (
            <li key={entry.id}>
              <time dateTime={entry.createdAt}>{formatDateTime(entry.createdAt)}</time>
              <span>
                @{entry.actor.username} · <code>{entry.action}</code>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

/** The receipt sits behind the login, so it is fetched with the token. Click to enlarge. */
function Receipt({ subscription }: { subscription: AdminSubscriptionDto }) {
  const image = useReceiptImage(subscription.id, subscription.hasReceipt);
  const [zoomed, setZoomed] = useState(false);

  if (!subscription.hasReceipt) return <p className="admin-hint">{mn.payments.panel.noReceipt}</p>;
  if (image.error) return <p className="admin-hint">{mn.payments.panel.receiptFailed}</p>;
  if (!image.data) return <Skeleton shape="cover" />;
  return (
    <button
      type="button"
      className="admin-receipt-button"
      aria-pressed={zoomed}
      aria-label={mn.payments.panel.receiptZoom}
      onClick={() => setZoomed((value) => !value)}
    >
      <img
        className={zoomed ? 'admin-receipt is-zoomed' : 'admin-receipt'}
        src={image.data}
        alt={mn.payments.panel.receiptAlt}
      />
    </button>
  );
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const download = useMutation({
    mutationFn: () => downloadPaymentsCsv({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    onSuccess: () => {
      toast.show(mn.payments.export.done, { tone: 'success' });
      onClose();
    },
  });
  return (
    <Modal open={open} title={mn.payments.export.title} onClose={onClose}>
      <form
        className="admin-modal__body"
        onSubmit={(event) => {
          event.preventDefault();
          download.mutate();
        }}
      >
        <Input
          label={mn.payments.export.from}
          type="date"
          value={from}
          max={to || todayUlaanbaatar()}
          onChange={(event) => setFrom(event.target.value)}
          hint={mn.payments.export.hint}
        />
        <Input
          label={mn.payments.export.to}
          type="date"
          value={to}
          min={from}
          max={todayUlaanbaatar()}
          onChange={(event) => setTo(event.target.value)}
        />
        <div className="admin-modal__actions">
          <Button variant="ghost" onClick={onClose}>
            {mn.common.cancel}
          </Button>
          <Button type="submit" loading={download.isPending}>
            {mn.payments.export.submit}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
