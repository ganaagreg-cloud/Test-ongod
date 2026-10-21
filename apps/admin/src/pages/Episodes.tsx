import { useQuery } from '@tanstack/react-query';
import { BULK_MAX_IDS, type AdminEpisodeDto, type EpisodeStatus } from '@ongod/shared';
import { Button, Chip, Input } from '@ongod/ui-web';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  categoriesQuery,
  episodesQuery,
  playlistsQuery,
  seriesListQuery,
  tagsQuery,
  type EpisodesFilter,
} from '../api/queries';
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
import { BulkBar } from '../components/BulkBar';
import { ContentCalendar } from '../components/ContentCalendar';
import { columnsFor, DataTable } from '../components/DataTable';
import { formatDateTime, todayUlaanbaatar } from '../lib/format';
import { mn } from '../i18n/mn';

const STATUSES: EpisodeStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];
const MEDIA_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] as const;
const SORTS = ['created', 'published', 'scheduled'] as const;

function when(episode: AdminEpisodeDto): string {
  if (episode.status === 'SCHEDULED' && episode.scheduledFor) {
    return mn.episodes.scheduledFor(formatDateTime(episode.scheduledFor));
  }
  if (episode.publishedAt) return mn.episodes.publishedAt(formatDateTime(episode.publishedAt));
  return mn.common.none;
}

const NO_SELECTION: Record<string, string> = {};

const col = columnsFor<AdminEpisodeDto>();

/** A click on the checkbox must not open the row. */
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

function buildColumns(
  rows: AdminEpisodeDto[],
  selected: Readonly<Record<string, string>>,
  toggle: (episode: AdminEpisodeDto) => void,
  togglePage: (on: boolean) => void,
) {
  const allOnPage = rows.length > 0 && rows.every((row) => row.id in selected);
  return [
    col.display({
      id: 'select',
      header: () => (
        <label className="admin-check" onClick={stop}>
          <input
            type="checkbox"
            aria-label={mn.episodes.columns.selectPage}
            checked={allOnPage}
            onChange={(event) => togglePage(event.target.checked)}
          />
        </label>
      ),
      cell: ({ row }) => (
        <label className="admin-check" onClick={stop}>
          <input
            type="checkbox"
            aria-label={mn.episodes.columns.selectRow(row.original.title)}
            checked={row.original.id in selected}
            onChange={() => toggle(row.original)}
          />
        </label>
      ),
    }),
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
      id: 'series',
      header: mn.episodes.columns.series,
      cell: ({ row }) =>
        row.original.series ? (
          <span>
            {row.original.series.title}
            {row.original.seriesPart !== null ? ` · ${row.original.seriesPart}` : ''}
          </span>
        ) : (
          mn.common.none
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
          <span className="admin-media-cell">
            {mn.episodes.audio.kind[row.original.media.kind]}
            <MediaBadge status={row.original.media.status} />
          </span>
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
}

export function EpisodesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // The view and the month live in the URL: a link or a reload keeps them.
  const calendar = params.get('view') === 'calendar';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '')
    ? (params.get('month') as string)
    : todayUlaanbaatar().slice(0, 7);
  const setView = (view: 'list' | 'calendar') =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (view === 'calendar') next.set('view', 'calendar');
        else next.delete('view');
        return next;
      },
      { replace: true },
    );
  const setMonth = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('month', value);
        return next;
      },
      { replace: true },
    );

  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const [status, setStatus] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [seriesId, setSeriesId] = useState('');
  const [tagId, setTagId] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [mediaStatus, setMediaStatus] = useState('');
  const [sort, setSort] = useState('created');
  const filterKey = `${q}|${status}|${categoryId}|${seriesId}|${tagId}|${playlistId}|${mediaStatus}|${sort}`;
  const [page, setPage] = usePage(filterKey);
  /** id -> title of the selected rows (kept across pages; the titles name the refused ones). */
  // The selection belongs to one filter and one view: it is empty again after either changes.
  const selectionKey = `${filterKey}|${calendar}`;
  const [selection, setSelection] = useState<{ key: string; items: Record<string, string> }>({
    key: selectionKey,
    items: {},
  });
  const selected = selection.key === selectionKey ? selection.items : NO_SELECTION;
  const setSelected = (update: (current: Record<string, string>) => Record<string, string>) =>
    setSelection((state) => ({
      key: selectionKey,
      items: update(state.key === selectionKey ? state.items : NO_SELECTION),
    }));

  const categories = useQuery(categoriesQuery());
  const seriesList = useQuery(seriesListQuery());
  const tags = useQuery(tagsQuery());
  const playlists = useQuery(playlistsQuery());

  const filter: EpisodesFilter = {
    ...(q ? { q } : {}),
    ...(status ? { status: status as EpisodeStatus } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(seriesId ? { seriesId } : {}),
    ...(tagId ? { tagId } : {}),
    ...(playlistId ? { playlistId } : {}),
    ...(mediaStatus ? { mediaStatus: mediaStatus as (typeof MEDIA_STATUSES)[number] } : {}),
  };
  const list = useQuery({
    ...episodesQuery({ ...filter, sort: sort as (typeof SORTS)[number], page }),
    enabled: !calendar,
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

  const selectedIds = Object.keys(selected);
  const columns = useMemo(
    () =>
      buildColumns(
        items,
        selected,
        (episode) =>
          setSelected((current) => {
            if (episode.id in current) {
              const { [episode.id]: _removed, ...rest } = current;
              return rest;
            }
            if (Object.keys(current).length >= BULK_MAX_IDS) return current;
            return { ...current, [episode.id]: episode.title };
          }),
        (on) =>
          setSelected((current) => {
            const next = { ...current };
            for (const episode of items) {
              if (!on) delete next[episode.id];
              else if (Object.keys(next).length < BULK_MAX_IDS) next[episode.id] = episode.title;
            }
            return next;
          }),
      ),
    [items, selected],
  );

  return (
    <>
      <PageHeader title={mn.episodes.title}>
        <div role="group" aria-label={mn.episodes.view.label} className="admin-view-toggle">
          <Chip selected={!calendar} onClick={() => setView('list')}>
            {mn.episodes.view.list}
          </Chip>
          <Chip selected={calendar} onClick={() => setView('calendar')}>
            {mn.episodes.view.calendar}
          </Chip>
        </div>
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
        <SelectField
          label={mn.episodes.filters.series}
          value={seriesId}
          onChange={setSeriesId}
          options={[
            { value: '', label: mn.common.all },
            ...(seriesList.data?.series ?? []).map((s) => ({ value: s.id, label: s.title })),
          ]}
        />
        <SelectField
          label={mn.episodes.filters.tag}
          value={tagId}
          onChange={setTagId}
          options={[
            { value: '', label: mn.common.all },
            ...(tags.data?.tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
          ]}
        />
        <SelectField
          label={mn.episodes.filters.playlist}
          value={playlistId}
          onChange={setPlaylistId}
          options={[
            { value: '', label: mn.common.all },
            ...(playlists.data?.playlists ?? []).map((p) => ({ value: p.id, label: p.title })),
          ]}
        />
        <SelectField
          label={mn.episodes.filters.mediaStatus}
          value={mediaStatus}
          onChange={setMediaStatus}
          options={[
            { value: '', label: mn.common.all },
            { value: 'NONE', label: mn.episodes.filters.mediaNone },
            ...MEDIA_STATUSES.map((value) => ({
              value,
              label: mn.episodes.mediaStatus[value],
            })),
          ]}
        />
        {calendar ? null : (
          <SelectField
            label={mn.episodes.filters.sort}
            value={sort}
            onChange={setSort}
            options={SORTS.map((value) => ({
              value,
              label: mn.episodes.filters.sortOptions[value],
            }))}
          />
        )}
      </div>
      {calendar ? null : (
        <BulkBar
          selectedIds={selectedIds}
          titles={selected}
          onDone={() => setSelected(() => ({}))}
          onClear={() => setSelected(() => ({}))}
        />
      )}
      {calendar ? (
        <ContentCalendar month={month} filter={filter} onMonth={setMonth} />
      ) : (
        <>
          {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
          <DataTable
            caption={mn.episodes.title}
            columns={columns}
            data={items}
            getRowId={(row) => row.id}
            loading={list.isPending}
            empty={mn.episodes.empty}
            onRowOpen={(row) => void navigate(`/episodes/${row.id}`)}
          />
          {list.data ? (
            <Pager page={page} limit={list.data.limit} total={list.data.total} onPage={setPage} />
          ) : null}
        </>
      )}
    </>
  );
}
