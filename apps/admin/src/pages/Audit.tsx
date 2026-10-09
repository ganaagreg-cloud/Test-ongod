import { useQuery } from '@tanstack/react-query';
import type { AuditEntryDto } from '@ongod/shared';
import { Input } from '@ongod/ui-web';
import { useState } from 'react';
import { auditQuery } from '../api/queries';
import { LoadError, PageHeader, Pager, useDebounced, usePage } from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { formatDateTime } from '../lib/format';
import { mn } from '../i18n/mn';

const col = columnsFor<AuditEntryDto>();
const columns = [
  col.display({
    id: 'when',
    header: mn.audit.columns.when,
    cell: ({ row }) => formatDateTime(row.original.createdAt),
  }),
  col.display({
    id: 'actor',
    header: mn.audit.columns.actor,
    cell: ({ row }) => `@${row.original.actor.username}`,
  }),
  col.display({
    id: 'action',
    header: mn.audit.columns.action,
    cell: ({ row }) => <code className="admin-code">{row.original.action}</code>,
  }),
  col.display({
    id: 'target',
    header: mn.audit.columns.target,
    cell: ({ row }) => (
      <>
        {row.original.targetType}
        <br />
        <small>{row.original.targetId}</small>
      </>
    ),
  }),
  col.display({
    id: 'data',
    header: mn.audit.columns.data,
    cell: ({ row }) =>
      row.original.data === null || row.original.data === undefined ? (
        mn.common.none
      ) : (
        <details>
          <summary>{mn.audit.showData}</summary>
          <pre className="admin-json">{JSON.stringify(row.original.data, null, 2)}</pre>
        </details>
      ),
  }),
];

export function AuditPage() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const debouncedAction = useDebounced(action.trim());
  const debouncedTarget = useDebounced(targetType.trim());
  const [page, setPage] = usePage(`${debouncedAction}|${debouncedTarget}`);

  const list = useQuery(
    auditQuery({
      ...(debouncedAction ? { action: debouncedAction } : {}),
      ...(debouncedTarget ? { targetType: debouncedTarget } : {}),
      page,
    }),
  );

  return (
    <>
      <PageHeader title={mn.audit.title} />
      <div className="admin-filters">
        <Input
          label={mn.audit.actionLabel}
          value={action}
          onChange={(event) => setAction(event.target.value)}
          spellCheck={false}
        />
        <Input
          label={mn.audit.targetLabel}
          value={targetType}
          onChange={(event) => setTargetType(event.target.value)}
          spellCheck={false}
        />
      </div>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      <DataTable
        caption={mn.audit.title}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(row) => row.id}
        loading={list.isPending}
        empty={mn.audit.empty}
      />
      {list.data ? (
        <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
      ) : null}
    </>
  );
}
