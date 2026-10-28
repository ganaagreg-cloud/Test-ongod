import { useMutation, useQuery } from '@tanstack/react-query';
import {
  adminStatusFilterSchema,
  type AdminStatusFilter,
  type AdminSubscriptionDto,
} from '@ongod/shared';
import { Button, Input, Skeleton, useToast } from '@ongod/ui-web';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { downloadPaymentsCsv, subscriptionHistoryQuery, subscriptionsQuery } from '../api/queries';
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
import { isModalOpen, Modal } from '../components/Modal';
import { formatDateTime, formatMnt, todayUlaanbaatar } from '../lib/format';
import { mn } from '../i18n/mn';

/** PAYMENT_SUBMITTED and REJECTED belonged to the removed bank-transfer path (ADR-0046). */
const STATUS_OPTIONS: AdminStatusFilter[] = ['ACTIVE', 'REVOKED', 'PENDING_PAYMENT', 'EXPIRED'];

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
    id: 'method',
    header: mn.payments.columns.method,
    cell: ({ row }) => mn.payments.methods[row.original.paymentProvider],
  }),
  col.display({
    id: 'created',
    header: mn.payments.columns.created,
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  }),
  col.display({
    id: 'status',
    header: mn.payments.columns.status,
    cell: ({ row }) => <SubscriptionBadge status={row.original.status} />,
  }),
];

/** Every payment request (newest first) with search, a status filter and the CSV export. */
export function PaymentsPage() {
  // ?status= sets the first filter (the dashboard links to the waiting requests, ADR-0056).
  const [params] = useSearchParams();
  const [status, setStatus] = useState<AdminStatusFilter>(
    () => adminStatusFilterSchema.safeParse(params.get('status')).data ?? 'ACTIVE',
  );
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(`${status}|${q}`);
  const [selectedId, setSelectedId] = useState<string>();
  const [exporting, setExporting] = useState(false);

  const list = useQuery(subscriptionsQuery({ status, ...(q ? { q } : {}), page }));
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const selected = items.find((item) => item.id === selectedId);

  // Esc closes the panel.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isModalOpen()) return;
    if (event.key === 'Escape') setSelectedId(undefined);
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <PageHeader title={mn.payments.title}>
        <Button variant="secondary" onClick={() => setExporting(true)}>
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
          onChange={(value) => setStatus(value as AdminStatusFilter)}
          options={STATUS_OPTIONS.map((value) => ({ value, label: mn.subscriptionStatus[value] }))}
        />
      </div>
      <p className="admin-hint">{mn.payments.listHint}</p>

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
            empty={mn.common.empty}
          />
          {list.data ? (
            <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          ) : null}
        </section>

        {selected ? (
          <PaymentPanel subscription={selected} onClose={() => setSelectedId(undefined)} />
        ) : null}
      </div>

      <ExportDialog open={exporting} onClose={() => setExporting(false)} />
    </>
  );
}

function PaymentPanel({
  subscription: s,
  onClose,
}: {
  subscription: AdminSubscriptionDto;
  onClose: () => void;
}) {
  const history = useQuery(subscriptionHistoryQuery(s.id));

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
        <Fact label={mn.payments.panel.method}>{mn.payments.methods[s.paymentProvider]}</Fact>
        <Fact label={mn.payments.panel.user}>
          <Link to={`/users/${s.user.id}`}>
            {fullName(s.user)} (@{s.user.username})
          </Link>
        </Fact>
        <Fact label={mn.payments.panel.email}>{s.user.email}</Fact>
        <Fact label={mn.payments.panel.phone}>{s.user.phone}</Fact>
        {s.startsAt && s.endsAt ? (
          <Fact label={mn.payments.panel.period}>
            {formatDateTime(s.startsAt)} → {formatDateTime(s.endsAt)}
          </Fact>
        ) : null}
        {s.decidedBy ? (
          <Fact label={mn.payments.panel.decidedBy}>
            @{s.decidedBy.username}
            {s.decidedAt ? ` · ${formatDateTime(s.decidedAt)}` : ''}
          </Fact>
        ) : null}
      </dl>

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
