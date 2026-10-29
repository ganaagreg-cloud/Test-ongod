import { useQuery } from '@tanstack/react-query';
import {
  adminCommentFilterSchema,
  type AdminCommentDto,
  type AdminCommentFilter,
} from '@ongod/shared';
import { Badge, Button, Input, useToast } from '@ongod/ui-web';
import { useMemo, useState } from 'react';
import { commentsQuery, useCommentActions } from '../api/queries';
import {
  LoadError,
  PageHeader,
  Pager,
  SelectField,
  useDebounced,
  usePage,
} from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { ConfirmDialog, errorText } from '../components/Modal';
import { formatDateTime } from '../lib/format';
import { mn } from '../i18n/mn';

type Pending =
  | { kind: 'delete'; comment: AdminCommentDto }
  | { kind: 'mute'; comment: AdminCommentDto }
  | undefined;

/** Сэтгэгдэл (SPEC L, ADR-0061): the moderation list. Reported comments come first. */
export function CommentsPage() {
  const t = mn.comments;
  const toast = useToast();
  const [filter, setFilter] = useState<AdminCommentFilter>('REPORTED');
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(`${filter}|${q}`);
  const [pending, setPending] = useState<Pending>();
  const list = useQuery(commentsQuery({ filter, ...(q ? { q } : {}), page }));
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const { act, mute } = useCommentActions();

  async function run(work: Promise<unknown>) {
    try {
      await work;
      toast.show(t.done, { tone: 'success' });
    } catch (err) {
      toast.show(errorText(err), { tone: 'danger' });
    }
  }

  const col = columnsFor<AdminCommentDto>();
  const columns = [
    col.display({
      id: 'comment',
      header: t.columns.comment,
      cell: ({ row }) => (
        <>
          <span className="admin-comment-body">{row.original.body}</span>
          {row.original.edited ? <small> {t.edited}</small> : null}
          {row.original.hiddenBy ? (
            <>
              <br />
              <small>{t.hiddenBy[row.original.hiddenBy as 'reports' | 'admin'] ?? ''}</small>
            </>
          ) : null}
        </>
      ),
    }),
    col.display({
      id: 'episode',
      header: t.columns.episode,
      cell: ({ row }) => row.original.episode.title,
    }),
    col.display({
      id: 'author',
      header: t.columns.author,
      cell: ({ row }) => (
        <>
          <strong>{row.original.author.name}</strong>
          <br />
          <small>@{row.original.author.username}</small>{' '}
          {row.original.author.muted ? <Badge tone="warning">{t.muted}</Badge> : null}
        </>
      ),
    }),
    col.display({
      id: 'reports',
      header: t.columns.reports,
      cell: ({ row }) =>
        row.original.reportCount > 0 ? (
          <>
            <strong>{row.original.reportCount}</strong>
            <br />
            <small>{row.original.reasons.map((r) => t.reasons[r]).join(', ')}</small>
          </>
        ) : (
          mn.common.none
        ),
    }),
    col.display({
      id: 'created',
      header: t.columns.created,
      cell: ({ row }) => formatDateTime(row.original.createdAt),
    }),
    col.display({
      id: 'actions',
      header: t.columns.actions,
      cell: ({ row }) => {
        const c = row.original;
        const go = (action: 'hide' | 'restore' | 'dismiss') =>
          void run(act.mutateAsync({ id: c.id, action }));
        return (
          <span className="admin-row-actions">
            {c.status === 'VISIBLE' ? (
              <Button variant="secondary" onClick={() => go('hide')}>
                {t.hide}
              </Button>
            ) : null}
            {c.status === 'VISIBLE' && c.reportCount > 0 ? (
              <Button variant="secondary" onClick={() => go('dismiss')}>
                {t.dismiss}
              </Button>
            ) : null}
            {c.status === 'HIDDEN' && c.hiddenBy === 'reports' ? (
              <Button variant="secondary" onClick={() => go('hide')}>
                {t.keepHidden}
              </Button>
            ) : null}
            {c.status === 'HIDDEN' ? (
              <Button variant="secondary" onClick={() => go('restore')}>
                {t.restore}
              </Button>
            ) : null}
            {c.status !== 'DELETED' ? (
              <Button
                variant="secondary"
                onClick={() => setPending({ kind: 'delete', comment: c })}
              >
                {t.delete}
              </Button>
            ) : null}
            {c.author.muted ? (
              <Button
                variant="secondary"
                onClick={() => void run(mute.mutateAsync({ userId: c.author.id, muted: false }))}
              >
                {t.unmute}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setPending({ kind: 'mute', comment: c })}>
                {t.mute}
              </Button>
            )}
          </span>
        );
      },
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
          label={t.filterLabel}
          value={filter}
          onChange={(value) => setFilter(adminCommentFilterSchema.parse(value))}
          options={adminCommentFilterSchema.options.map((value) => ({
            value,
            label: t.filters[value],
          }))}
        />
      </div>
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

      <ConfirmDialog
        open={pending?.kind === 'delete'}
        title={t.deleteTitle}
        text={t.deleteText}
        confirmLabel={t.delete}
        tone="destructive"
        onClose={() => setPending(undefined)}
        onConfirm={async () => {
          if (pending?.kind !== 'delete') return;
          await act.mutateAsync({ id: pending.comment.id, action: 'delete' });
          toast.show(t.done, { tone: 'success' });
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'mute'}
        title={t.muteTitle}
        text={pending?.kind === 'mute' ? t.muteText(pending.comment.author.name) : undefined}
        confirmLabel={t.mute}
        tone="destructive"
        onClose={() => setPending(undefined)}
        onConfirm={async () => {
          if (pending?.kind !== 'mute') return;
          await mute.mutateAsync({ userId: pending.comment.author.id, muted: true });
          toast.show(t.done, { tone: 'success' });
        }}
      />
    </>
  );
}
