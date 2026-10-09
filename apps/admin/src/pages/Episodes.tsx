import { useQuery } from '@tanstack/react-query';
import type { AdminEpisodeDto, EpisodeStatus } from '@ongod/shared';
import { Button, Input } from '@ongod/ui-web';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { categoriesQuery, episodesQuery } from '../api/queries';
import {
  EpisodeBadge,
  LoadError,
  MediaBadge,
  PageHeader,
  Pager,
  SelectField,
  useDebounced,
  usePage,
} from '../components/bits';
import { columnsFor, DataTable } from '../components/DataTable';
import { formatDateTime } from '../lib/format';
import { mn } from '../i18n/mn';

const STATUSES: EpisodeStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];

function when(episode: AdminEpisodeDto): string {
  if (episode.status === 'SCHEDULED' && episode.scheduledFor) {
    return mn.episodes.scheduledFor(formatDateTime(episode.scheduledFor));
  }
  if (episode.publishedAt) return mn.episodes.publishedAt(formatDateTime(episode.publishedAt));
  return mn.common.none;
}

const col = columnsFor<AdminEpisodeDto>();
const columns = [
  col.display({
    id: 'episode',
    header: mn.episodes.columns.episode,
    cell: ({ row }) => (
      <span className="admin-episode-cell">
        {row.original.thumbUrl ? (
          <img className="admin-thumb" src={row.original.thumbUrl} alt="" loading="lazy" />
        ) : (
          <span className="admin-thumb admin-thumb--empty" aria-hidden="true" />
        )}
        <strong>{row.original.title}</strong>
      </span>
    ),
  }),
  col.display({
    id: 'category',
    header: mn.episodes.columns.category,
    cell: ({ row }) => row.original.category.name,
  }),
  col.display({
    id: 'status',
    header: mn.episodes.columns.status,
    cell: ({ row }) => <EpisodeBadge status={row.original.status} />,
  }),
  col.display({
    id: 'audio',
    header: mn.episodes.columns.audio,
    cell: ({ row }) =>
      row.original.media ? (
        <MediaBadge status={row.original.media.status} />
      ) : (
        <span className="admin-hint">{mn.episodes.noAudio}</span>
      ),
  }),
  col.display({
    id: 'when',
    header: mn.episodes.columns.when,
    cell: ({ row }) => when(row.original),
  }),
];

export function EpisodesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = usePage(`${q}|${status}|${categoryId}`);

  const categories = useQuery(categoriesQuery());
  const list = useQuery(
    episodesQuery({
      ...(q ? { q } : {}),
      ...(status ? { status: status as EpisodeStatus } : {}),
      ...(categoryId ? { categoryId } : {}),
      page,
    }),
  );

  return (
    <>
      <PageHeader title={mn.episodes.title}>
        <Button onClick={() => void navigate('/episodes/new')}>{mn.episodes.new}</Button>
      </PageHeader>
      <div className="admin-filters">
        <Input
          label={mn.episodes.searchLabel}
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={mn.episodes.statusLabel}
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: mn.common.all },
            ...STATUSES.map((value) => ({ value, label: mn.episodes.status[value] })),
          ]}
        />
        <SelectField
          label={mn.episodes.categoryLabel}
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: '', label: mn.common.all },
            ...(categories.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </div>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      <DataTable
        caption={mn.episodes.title}
        columns={columns}
        data={list.data?.items ?? []}
        getRowId={(row) => row.id}
        loading={list.isPending}
        empty={mn.episodes.empty}
        onRowOpen={(row) => void navigate(`/episodes/${row.id}`)}
      />
      {list.data ? (
        <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
      ) : null}
    </>
  );
}
