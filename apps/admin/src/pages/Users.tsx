import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import type { adminUserSchema } from '@ongod/shared';
import { Input } from '@ongod/ui-web';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { usersQuery } from '../api/queries';
import {
  LoadError,
  PageHeader,
  Pager,
  useDebounced,
  usePage,
  UserStatusBadge,
} from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { formatDate } from '../lib/format';
import { mn } from '../i18n/mn';

type Row = z.infer<typeof adminUserSchema>;

export const hasAccess = (accessUntil: string | null) =>
  accessUntil !== null && new Date(accessUntil).getTime() > Date.now();

const col = columnsFor<Row>();
const columns = [
  col.display({
    id: 'name',
    header: mn.users.columns.name,
    cell: ({ row }) => (
      <strong>{`${row.original.lastName} ${row.original.firstName}`.trim()}</strong>
    ),
  }),
  col.display({
    id: 'username',
    header: mn.users.columns.username,
    cell: ({ row }) => `@${row.original.username}`,
  }),
  col.display({
    id: 'email',
    header: mn.users.columns.email,
    cell: ({ row }) => row.original.email,
  }),
  col.display({
    id: 'phone',
    header: mn.users.columns.phone,
    cell: ({ row }) => row.original.phone,
  }),
  col.display({
    id: 'status',
    header: mn.users.columns.status,
    cell: ({ row }) => <UserStatusBadge status={row.original.status} />,
  }),
  col.display({
    id: 'access',
    header: mn.users.columns.access,
    cell: ({ row }) =>
      hasAccess(row.original.accessUntil)
        ? formatDate(row.original.accessUntil!)
        : mn.users.noAccess,
  }),
  col.display({
    id: 'registered',
    header: mn.users.columns.registered,
    cell: ({ row }) => formatDate(row.original.createdAt),
  }),
];

export function UsersPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [page, setPage] = usePage(q);

  const list = useQuery(usersQuery({ ...(q ? { q } : {}), page }));

  return (
    <>
      <PageHeader title={mn.users.title} />
      <div className="admin-filters">
        <Input
          label={mn.users.searchLabel}
          hint={mn.users.searchHint}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      <DataTable
        caption={mn.users.title}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(row) => row.id}
        loading={list.isPending}
        onRowOpen={(row) => void navigate(`/users/${row.id}`)}
      />
      {list.data ? (
        <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
      ) : null}
    </>
  );
}
