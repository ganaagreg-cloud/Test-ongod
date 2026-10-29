import { useQuery } from '@tanstack/react-query';
import { BULK_MAX_IDS, type AdminEpisodeDto, type EpisodeStatus } from '@ongod/shared';
import { Badge, Button, EmptyState, Icon, Input } from '@ongod/ui-web';
import { useCallback, useEffect, useEffectEvent, useMemo, useState } from 'react';
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
  useNow,
} from '../components/bits';
import { BulkBar } from '../components/BulkBar';
import { ContentCalendar } from '../components/ContentCalendar';
import { columnsFor, DataTable } from '../components/DataTable';
import { EpisodeRowTools } from '../components/EpisodeRowTools';
import { isModalOpen } from '../components/Modal';
import { Thumb } from '../components/Thumb';
import { formatDuration, todayUlaanbaatar } from '../lib/format';
import { isStuckUpload } from '../lib/media';
import { whenLabel } from '../lib/when';
import { mn } from '../i18n/mn';

const STATUSES: EpisodeStatus[] = ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED'];
const MEDIA_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'FAILED'] as const;
const SORTS = ['created', 'published', 'scheduled'] as const;
type MediaFilter = (typeof MEDIA_STATUSES)[number] | 'NONE';
type Sort = (typeof SORTS)[number];

/** Tabs, filters, sort and page live in the URL: a link or a reload keeps them. */
interface ListState {
  q: string;
  status: EpisodeStatus | '';
  categoryId: string;
  seriesId: string;
  tagId: string;
  playlistId: string;
  mediaStatus: MediaFilter | '';
  sort: Sort;
  page: number;
}

function readState(params: URLSearchParams): ListState {
  const status = params.get('status') as EpisodeStatus;
  const media = params.get('file') as MediaFilter;
  const sort = params.get('sort') as Sort;
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? '',
    status: STATUSES.includes(status) ? status : '',
    categoryId: params.get('category') ?? '',
    seriesId: params.get('series') ?? '',
    tagId: params.get('tag') ?? '',
    playlistId: params.get('playlist') ?? '',
    mediaStatus: media === 'NONE' || MEDIA_STATUSES.includes(media as never) ? media : '',
    sort: SORTS.includes(sort) ? sort : 'created',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

/** URL parameter for each list field; an empty value (or the default sort) removes it. */
const PARAM: Record<keyof ListState, string> = {
  q: 'q',
  status: 'status',
  categoryId: 'category',
  seriesId: 'series',
  tagId: 'tag',
  playlistId: 'playlist',
  mediaStatus: 'file',
  sort: 'sort',
  page: 'page',
};

const NO_SELECTION: Record<string, string> = {};
const col = columnsFor<AdminEpisodeDto>();

/** A click on the checkbox must not open the row. */
const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

const subtitleOf = (episode: AdminEpisodeDto) =>
  [
    episode.category.name,
    episode.series
      ? `${episode.series.title}${episode.seriesPart !== null ? ` · ${episode.seriesPart}` : ''}`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

function MediaCell({ episode, now }: { episode: AdminEpisodeDto; now: number }) {
  const navigate = useNavigate();
  const media = episode.media;
  if (!media) return <span className="admin-hint">{mn.episodes.noAudio}</span>;
  const stuck = isStuckUpload(media, now);
  return (
    <span className="admin-media-cell">
      <span role="img" aria-label={mn.episodes.audio.kind[media.kind]} className="admin-media-kind">
        <Icon name={media.kind === 'VIDEO' ? 'video' : 'audio'} size="small" />
      </span>
      <span className="admin-media-duration">
        {media.durationSec === null ? mn.common.none : formatDuration(media.durationSec)}
      </span>
      {stuck ? (
        <>
          <Badge tone="danger">{mn.episodes.row.stuckUpload}</Badge>
          <Button
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              // The edit page has the uploader: it resumes the upload or takes a new file.
              void navigate(`/episodes/${episode.id}`);
            }}
          >
            {mn.episodes.row.retryUpload}
          </Button>
        </>
      ) : (
        <MediaBadge status={media.status} />
      )}
    </span>
  );
}

function buildColumns(
  rows: AdminEpisodeDto[],
  selected: Readonly<Record<string, string>>,
  toggle: (episode: AdminEpisodeDto) => void,
  togglePage: (on: boolean) => void,
  now: number,
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
          <Thumb
            key={row.original.thumbUrl ?? ''}
            src={row.original.thumbUrl}
            kind={row.original.media?.kind ?? null}
          />
          <span className="admin-episode-cell__text">
            <strong className="admin-episode-cell__title">{row.original.title}</strong>
            <span className="admin-episode-cell__sub">{subtitleOf(row.original)}</span>
          </span>
        </span>
      ),
    }),
    col.display({
      id: 'status',
      header: mn.episodes.columns.status,
      cell: ({ row }) => (
        <span className="admin-media-cell">
          <EpisodeBadge status={row.original.status} />
          {row.original.isFree ? <Badge tone="info">{mn.episodes.free}</Badge> : null}
        </span>
      ),
    }),
    col.display({
      id: 'audio',
      header: mn.episodes.columns.audio,
      cell: ({ row }) => <MediaCell episode={row.original} now={now} />,
    }),
    col.display({
      id: 'when',
      header: mn.episodes.columns.when,
      cell: ({ row }) => {
        const e = row.original;
        const iso = e.status === 'SCHEDULED' && e.scheduledFor ? e.scheduledFor : e.publishedAt;
        if (!iso) return mn.common.none;
        const { text, title } = whenLabel(iso, now);
        return (
          <time dateTime={iso} title={title} className="admin-when">
            {text}
          </time>
        );
      },
    }),
    col.display({
      id: 'tools',
      header: () => <span className="ui-visually-hidden">{mn.episodes.columns.actions}</span>,
      cell: ({ row }) => <EpisodeRowTools episode={row.original} />,
    }),
  ];
}

export function EpisodesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const now = useNow();
  const state = readState(params);

  // The view and the month live in the URL too.
  const calendar = params.get('view') === 'calendar';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') ?? '')
    ? (params.get('month') as string)
    : todayUlaanbaatar().slice(0, 7);

  /** Changes URL fields; any change but the page itself goes back to page 1. */
  const patch = useCallback(
    (changes: Record<string, string>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value && !(key === 'sort' && value === 'created')) next.set(key, value);
            else next.delete(key);
          }
          if (!('page' in changes)) next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  const set = (field: keyof ListState, value: string) => patch({ [PARAM[field]]: value });

  // Search: the box is local (typing stays smooth), the URL follows after a short pause.
  const [search, setSearch] = useState(state.q);
  const debounced = useDebounced(search.trim());
  const syncSearch = useEffectEvent((value: string) => {
    if (value !== state.q) set('q', value);
  });
  useEffect(() => syncSearch(debounced), [debounced]);

  const [panelOpen, setPanelOpen] = useState(
    Boolean(
      state.seriesId || state.tagId || state.playlistId || state.mediaStatus || params.get('sort'),
    ),
  );

  const categories = useQuery(categoriesQuery());
  const seriesList = useQuery(seriesListQuery());
  const tags = useQuery(tagsQuery());
  const playlists = useQuery(playlistsQuery());

  // The selection belongs to one filter and one view: it is empty again after either changes.
  const selectionKey = `${state.q}|${state.status}|${state.categoryId}|${state.seriesId}|${state.tagId}|${state.playlistId}|${state.mediaStatus}|${state.sort}|${calendar}`;
  const [selection, setSelection] = useState<{ key: string; items: Record<string, string> }>({
    key: selectionKey,
    items: {},
  });
  const selected = selection.key === selectionKey ? selection.items : NO_SELECTION;
  const setSelected = useCallback(
    (update: (current: Record<string, string>) => Record<string, string>) =>
      setSelection((s) => ({
        key: selectionKey,
        items: update(s.key === selectionKey ? s.items : NO_SELECTION),
      })),
    [selectionKey],
  );

  const filter: EpisodesFilter = {
    ...(state.q ? { q: state.q } : {}),
    ...(state.status ? { status: state.status } : {}),
    ...(state.categoryId ? { categoryId: state.categoryId } : {}),
    ...(state.seriesId ? { seriesId: state.seriesId } : {}),
    ...(state.tagId ? { tagId: state.tagId } : {}),
    ...(state.playlistId ? { playlistId: state.playlistId } : {}),
    ...(state.mediaStatus ? { mediaStatus: state.mediaStatus } : {}),
  };
  const list = useQuery({
    ...episodesQuery({ ...filter, sort: state.sort, page: state.page }),
    enabled: !calendar,
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const counts = list.data?.counts;
  const countTotal = counts ? STATUSES.reduce((sum, s) => sum + counts[s], 0) : undefined;

  const selectedIds = Object.keys(selected);
  const columns = useMemo(
    () =>
      buildColumns(
        items,
        selected,
        (episode) =>
          setSelected((current) => {
            if (episode.id in current) {
              const rest = { ...current };
              delete rest[episode.id];
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
        now,
      ),
    [items, selected, setSelected, now],
  );

  // "/" jumps to the search box, "n" starts a new item. Quiet while typing or in a dialog.
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey || isModalOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === '/') {
      event.preventDefault();
      document.getElementById('episodes-search')?.focus();
    } else if (event.key === 'n') {
      event.preventDefault();
      void navigate('/episodes/new');
    }
  });
  useEffect(() => {
    const handler = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ---- active filters as removable chips ----
  const nameOf = <T,>(
    rows: T[] | undefined,
    id: string,
    pick: (row: T) => { id: string; label: string },
  ) => rows?.map(pick).find((row) => row.id === id)?.label;
  const chips: Array<{ key: string; label: string; clear: () => void }> = [];
  const addChip = (field: keyof ListState, label: string | undefined) => {
    if (label) chips.push({ key: field, label, clear: () => set(field, '') });
  };
  addChip(
    'categoryId',
    state.categoryId
      ? nameOf(categories.data?.categories, state.categoryId, (c) => ({ id: c.id, label: c.name }))
      : undefined,
  );
  addChip(
    'seriesId',
    state.seriesId
      ? nameOf(seriesList.data?.series, state.seriesId, (s) => ({ id: s.id, label: s.title }))
      : undefined,
  );
  addChip(
    'tagId',
    state.tagId
      ? nameOf(tags.data?.tags, state.tagId, (t) => ({ id: t.id, label: t.name }))
      : undefined,
  );
  addChip(
    'playlistId',
    state.playlistId
      ? nameOf(playlists.data?.playlists, state.playlistId, (p) => ({ id: p.id, label: p.title }))
      : undefined,
  );
  addChip(
    'mediaStatus',
    state.mediaStatus === 'NONE'
      ? mn.episodes.filters.mediaNone
      : state.mediaStatus
        ? mn.episodes.mediaStatus[state.mediaStatus]
        : undefined,
  );
  if (state.sort !== 'created') {
    chips.push({
      key: 'sort',
      label: mn.episodes.filterPanel.sortChip(mn.episodes.filters.sortOptions[state.sort]),
      clear: () => set('sort', ''),
    });
  }
  const hiddenActive =
    [state.seriesId, state.tagId, state.playlistId, state.mediaStatus].filter(Boolean).length +
    (state.sort !== 'created' ? 1 : 0);
  const anyFilter = chips.length > 0 || state.q !== '';
  const clearAll = () => {
    setSearch('');
    patch({
      q: '',
      category: '',
      series: '',
      tag: '',
      playlist: '',
      file: '',
      sort: '',
    });
  };

  const all = (label: string) => ({ value: '', label });

  return (
    <>
      <PageHeader
        title={mn.episodes.title}
        subtitle={
          counts && countTotal !== undefined
            ? mn.episodes.summary(countTotal, counts.SCHEDULED, counts.DRAFT)
            : undefined
        }
      >
        <div role="group" aria-label={mn.episodes.view.label} className="admin-segmented">
          <button
            type="button"
            aria-pressed={!calendar}
            onClick={() =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('view');
                  return next;
                },
                { replace: true },
              )
            }
          >
            {mn.episodes.view.list}
          </button>
          <button
            type="button"
            aria-pressed={calendar}
            onClick={() =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('view', 'calendar');
                  return next;
                },
                { replace: true },
              )
            }
          >
            {mn.episodes.view.calendar}
          </button>
        </div>
        <Button variant="secondary" onClick={() => void navigate('/episodes/upload')}>
          {mn.episodes.bulkUpload.button}
        </Button>
        <Button
          title={mn.episodes.shortcuts.newItem}
          onClick={() => void navigate('/episodes/new')}
        >
          <Icon name="plus" size="small" />
          {mn.episodes.new}
        </Button>
      </PageHeader>

      {calendar ? null : (
        <div role="tablist" aria-label={mn.episodes.tabs.label} className="admin-tabs">
          {(['', ...STATUSES] as const).map((value) => {
            const count = value === '' ? countTotal : counts?.[value];
            return (
              <button
                key={value || 'all'}
                type="button"
                role="tab"
                aria-selected={state.status === value}
                className="admin-tab"
                onClick={() => set('status', value)}
              >
                {value === '' ? mn.common.all : mn.episodes.status[value]}
                {count === undefined ? null : <span className="admin-tab__count">{count}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="admin-filters">
        <Input
          id="episodes-search"
          label={mn.episodes.searchLabel}
          type="search"
          title={mn.episodes.shortcuts.search}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SelectField
          label={mn.episodes.categoryLabel}
          value={state.categoryId}
          onChange={(value) => set('categoryId', value)}
          options={[
            all(mn.common.all),
            ...(categories.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
        <Button
          variant="secondary"
          className="admin-filters__toggle"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((open) => !open)}
        >
          <Icon name="filter" size="small" />
          {hiddenActive > 0
            ? mn.episodes.filterPanel.toggleActive(hiddenActive)
            : mn.episodes.filterPanel.toggle}
        </Button>
      </div>

      {panelOpen ? (
        <div className="admin-filters admin-filters--panel">
          <SelectField
            label={mn.episodes.filters.series}
            value={state.seriesId}
            onChange={(value) => set('seriesId', value)}
            options={[
              all(mn.common.all),
              ...(seriesList.data?.series ?? []).map((s) => ({ value: s.id, label: s.title })),
            ]}
          />
          <SelectField
            label={mn.episodes.filters.tag}
            value={state.tagId}
            onChange={(value) => set('tagId', value)}
            options={[
              all(mn.common.all),
              ...(tags.data?.tags ?? []).map((tag) => ({ value: tag.id, label: tag.name })),
            ]}
          />
          <SelectField
            label={mn.episodes.filters.playlist}
            value={state.playlistId}
            onChange={(value) => set('playlistId', value)}
            options={[
              all(mn.common.all),
              ...(playlists.data?.playlists ?? []).map((p) => ({ value: p.id, label: p.title })),
            ]}
          />
          <SelectField
            label={mn.episodes.filters.mediaStatus}
            value={state.mediaStatus}
            onChange={(value) => set('mediaStatus', value)}
            options={[
              all(mn.common.all),
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
              value={state.sort}
              onChange={(value) => set('sort', value)}
              options={SORTS.map((value) => ({
                value,
                label: mn.episodes.filters.sortOptions[value],
              }))}
            />
          )}
        </div>
      ) : null}

      {chips.length > 0 ? (
        <ul className="admin-chips" aria-label={mn.episodes.filterPanel.chipsLabel}>
          {chips.map((chip) => (
            <li key={chip.key}>
              <span className="admin-chip">
                {chip.label}
                <button
                  type="button"
                  className="admin-chip__remove"
                  aria-label={mn.episodes.filterPanel.remove(chip.label)}
                  onClick={chip.clear}
                >
                  <Icon name="close" size="small" />
                </button>
              </span>
            </li>
          ))}
          <li>
            <button type="button" className="admin-link-button" onClick={clearAll}>
              {mn.episodes.filterPanel.clearAll}
            </button>
          </li>
        </ul>
      ) : null}

      {calendar ? null : (
        <BulkBar
          selectedIds={selectedIds}
          titles={selected}
          onDone={() => setSelected(() => ({}))}
          onClear={() => setSelected(() => ({}))}
        />
      )}
      {calendar ? (
        <ContentCalendar
          month={month}
          filter={filter}
          onMonth={(value) =>
            setParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                next.set('month', value);
                return next;
              },
              { replace: true },
            )
          }
        />
      ) : (
        <>
          {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
          <DataTable
            caption={mn.episodes.title}
            columns={columns}
            data={items}
            getRowId={(row) => row.id}
            loading={list.isPending}
            empty={
              <EmptyState
                title={
                  anyFilter || state.status
                    ? mn.episodes.emptyFiltered.title
                    : mn.episodes.emptyNone.title
                }
                text={
                  anyFilter || state.status
                    ? mn.episodes.emptyFiltered.text
                    : mn.episodes.emptyNone.text
                }
                action={
                  anyFilter || state.status ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        clearAll();
                        set('status', '');
                      }}
                    >
                      {mn.episodes.emptyFiltered.action}
                    </Button>
                  ) : (
                    <Button onClick={() => void navigate('/episodes/new')}>
                      <Icon name="plus" size="small" />
                      {mn.episodes.new}
                    </Button>
                  )
                }
              />
            }
            onRowOpen={(row) => void navigate(`/episodes/${row.id}`)}
          />
          {list.data ? (
            <Pager
              page={state.page}
              limit={list.data.limit}
              total={list.data.total}
              onPage={(page) => patch({ page: String(page) })}
            />
          ) : null}
        </>
      )}
    </>
  );
}
