import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ALLOWED_AUDIO_EXTENSIONS,
  ALLOWED_VIDEO_EXTENSIONS,
  MAX_COVER_BYTES,
  maxBytesOf,
  mediaKindOfFile,
  type AdminEpisodeDto,
  type CreateEpisodeRequest,
} from '@ongod/shared';
import { Button, Icon, Input, Notice, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { categoriesQuery, episodeQuery, seriesListQuery, useEpisodeActions } from '../api/queries';
import { EpisodeBadge, LoadError, PageHeader, SelectField, useNow } from '../components/bits';
import { DropZone } from '../components/DropZone';
import { LeaveGuard } from '../components/LeaveGuard';
import { MediaPreview } from '../components/MediaPreview';
import { ConfirmDialog, errorText } from '../components/Modal';
import { SchedulePicker } from '../components/SchedulePicker';
import { TagPicker } from '../components/TagPicker';
import {
  formatBytes,
  formatDateTime,
  toUlaanbaatarInputValue,
  toUlaanbaatarIso,
  ulaanbaatarInputToDate,
} from '../lib/format';
import { startingCategory, titleFromFileName } from '../lib/media';
import { mn } from '../i18n/mn';
import { MediaUploader } from '../upload/MediaUploader';

const t = mn.episodes;
const w = t.workspace;

// ---------------------------------------------------------------- the route

/**
 * /episodes/new and /episodes/:id are the same page. A new episode is made as a draft the first
 * time a file is picked (or on Save); the URL then changes to its id and the page stays mounted,
 * so the files already picked keep going.
 */
export function EpisodeEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routeId = id && id !== 'new' ? id : undefined;
  // The id of a draft made on this page: the URL moves to it without a fresh start.
  const [created, setCreated] = useState<string>();
  const query = useQuery({ ...episodeQuery(routeId ?? ''), enabled: routeId !== undefined });
  const stays = routeId === undefined || routeId === created;

  if (!stays && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <>
        <Link className="admin-back" to="/episodes">
          ← {t.title}
        </Link>
        <Notice tone="warning">{t.notFound}</Notice>
      </>
    );
  }
  if (!stays && query.error) {
    return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (!stays && !query.data) {
    return (
      <>
        <Skeleton width="40%" />
        <Skeleton width="70%" />
      </>
    );
  }

  return (
    <Workspace
      key={stays ? 'session' : routeId}
      episode={query.data?.episode}
      refetch={() => void query.refetch()}
      onCreated={(response) => {
        queryClient.setQueryData(episodeQuery(response.episode.id).queryKey, response);
        setCreated(response.episode.id);
        void navigate(`/episodes/${response.episode.id}`, { replace: true });
      }}
    />
  );
}

// ---------------------------------------------------------------- form values

interface Values {
  title: string;
  description: string;
  categoryId: string;
  seriesId: string;
  part: string;
  tagIds: string[];
  isFree: boolean;
  /** Push to the members when it goes out, and its text (saved with the rest, ADR-0068). */
  notify: boolean;
  pushText: string;
}

const valuesOf = (e?: AdminEpisodeDto): Values => ({
  title: e?.title ?? '',
  description: e?.description ?? '',
  categoryId: e?.category.id ?? '',
  seriesId: e?.series?.id ?? '',
  part: e?.seriesPart != null ? String(e.seriesPart) : '',
  tagIds: e?.tags.map((tag) => tag.id) ?? [],
  isFree: e?.isFree ?? false,
  notify: e?.notifyOnPublish ?? true,
  pushText: e?.pushText ?? '',
});

const validOf = (v: Values) => v.title.trim() !== '' && v.categoryId !== '';

/** The category the last new item was made in, on this browser (a convenience only). */
const LAST_CATEGORY_KEY = 'ongod:admin-last-category';
const lastCategory = {
  read(): string | null {
    try {
      return localStorage.getItem(LAST_CATEGORY_KEY);
    } catch {
      return null;
    }
  },
  write(id: string) {
    try {
      localStorage.setItem(LAST_CATEGORY_KEY, id);
    } catch {
      // Blocked storage: the admin picks the category each time.
    }
  },
};

const sameValues = (a: Values, b: Values) => JSON.stringify(a) === JSON.stringify(b);

function requestOf(values: Values, initial?: AdminEpisodeDto): CreateEpisodeRequest {
  const partChanged =
    values.seriesId !== (initial?.series?.id ?? '') ||
    values.part !== String(initial?.seriesPart ?? '');
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    categoryId: values.categoryId,
    seriesId: values.seriesId || null,
    // Empty part: the server takes the next free number. Unchanged part: leave it alone.
    ...(values.seriesId && values.part.trim() !== '' && partChanged
      ? { seriesPart: Number(values.part) }
      : {}),
    tagIds: values.tagIds,
    isFree: values.isFree,
    notifyOnPublish: values.notify,
    pushText: values.pushText.trim() || null,
  };
}

// ---------------------------------------------------------------- the page

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function Workspace({
  episode,
  refetch,
  onCreated,
}: {
  episode: AdminEpisodeDto | undefined;
  refetch: () => void;
  onCreated: (response: { episode: AdminEpisodeDto }) => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const { create } = useEpisodeActions(undefined);
  const { update, duplicate, uploadCover } = useEpisodeActions(episode?.id);

  const [values, setValues] = useState<Values>(() => valuesOf(episode));
  const set = (patch: Partial<Values>) => setValues((v) => ({ ...v, ...patch }));
  const [error, setError] = useState<string>();
  // The draft was just made on this page: take what the server filled in (the series part).
  const hadEpisode = useRef(episode !== undefined);
  useEffect(() => {
    if (episode && !hadEpisode.current) {
      hadEpisode.current = true;
      setValues(valuesOf(episode));
    }
  }, [episode]);
  // Fresh data from the server (a refetch, a bulk change made elsewhere) replaces the form only
  // while the admin has not edited it; edits in progress are kept.
  const synced = useRef(valuesOf(episode));
  useEffect(() => {
    if (!episode) return;
    const fresh = valuesOf(episode);
    const before = synced.current;
    setValues((current) => (sameValues(current, before) ? fresh : current));
    synced.current = fresh;
  }, [episode]);
  const valid = validOf(values);
  const categories = useQuery(categoriesQuery());
  const [uploading, setUploading] = useState(false);
  const dirty = episode ? !sameValues(values, valuesOf(episode)) : true;

  // Files picked before the draft exists wait here; they go up as soon as it does.
  const [stagedCover, setStagedCover] = useState<{ file: File; url: string }>();
  const [stagedMedia, setStagedMedia] = useState<File>();
  const [coverError, setCoverError] = useState<string>();
  const [mediaError, setMediaError] = useState<string>();
  // The server resizes the cover in the background; look again every 2 s for a short while.
  const [waiting, setWaiting] = useState(false);
  const lastThumb = useRef(episode?.thumbUrl ?? null);
  const sentCover = useRef<File>(undefined);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(refetch, 2000);
    const stop = setTimeout(() => setWaiting(false), 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, refetch]);
  const thumb = episode?.thumbUrl ?? null;
  useEffect(() => {
    if (thumb !== lastThumb.current) {
      lastThumb.current = thumb;
      setWaiting(false);
    }
  }, [thumb]);

  function sendCover(file: File) {
    uploadCover.mutate(file, {
      onSuccess: () => {
        setWaiting(true);
        toast.show(t.cover.uploaded, { tone: 'success' });
      },
      onError: (err) => setCoverError(errorText(err)),
    });
  }
  const sendStagedCover = useEffectEvent((file: File) => sendCover(file));
  useEffect(() => {
    if (episode && stagedCover && sentCover.current !== stagedCover.file) {
      sentCover.current = stagedCover.file;
      sendStagedCover(stagedCover.file);
    }
  }, [episode, stagedCover]);

  async function createDraft(from: Values = values) {
    setError(undefined);
    try {
      const response = await create.mutateAsync(requestOf(from));
      lastCategory.write(from.categoryId);
      toast.show(w.saved, { tone: 'success' });
      onCreated(response);
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (create.isPending || update.isPending) return;
    if (!valid) {
      setError(w.needDetails);
      return;
    }
    if (!episode) {
      await createDraft();
      return;
    }
    if (await saveIfDirty()) toast.show(mn.common.saved, { tone: 'success' });
  }

  /** Saves pending edits; publishing and scheduling call it first. False: not saved. */
  async function saveIfDirty(): Promise<boolean> {
    if (!episode) return false;
    if (!dirty) return true;
    if (!valid) {
      setError(w.needDetails);
      return false;
    }
    setError(undefined);
    try {
      await update.mutateAsync(requestOf(values, episode));
      return true;
    } catch (err) {
      setError(errorText(err));
      return false;
    }
  }

  /**
   * A file is waiting and the details are now enough: make the draft so the upload starts
   * (ADR-0068). Called when a category is picked and when the title field is left.
   */
  function commit(next: Values) {
    if (!episode && (stagedMedia || stagedCover) && validOf(next) && !create.isPending) {
      void createDraft(next);
    }
  }

  function pickCover(file: File) {
    setCoverError(undefined);
    if (!COVER_TYPES.includes(file.type) || file.size > MAX_COVER_BYTES) {
      setCoverError(t.cover.hint);
      return;
    }
    if (episode) {
      sendCover(file);
      return;
    }
    // Kept for the preview and not revoked: one small URL per picked picture.
    setStagedCover({ file, url: URL.createObjectURL(file) });
    if (valid && !create.isPending) void createDraft();
  }

  function pickMedia(file: File) {
    setMediaError(undefined);
    const kind = mediaKindOfFile(file.name);
    if (!kind) {
      setMediaError(t.audio.invalidType);
      return;
    }
    if (file.size > maxBytesOf(kind)) {
      setMediaError(t.audio.tooLarge(formatBytes(maxBytesOf(kind))));
      return;
    }
    setStagedMedia(file);
    // Like YouTube: the file name is the starting title, and the last category is kept, so the
    // upload can start at once (ADR-0068).
    const next: Values = {
      ...values,
      title: values.title.trim() === '' ? titleFromFileName(file.name) : values.title,
      categoryId:
        values.categoryId ||
        startingCategory(
          (categories.data?.categories ?? []).map((c) => c.id),
          lastCategory.read(),
        ),
    };
    setValues(next);
    if (validOf(next) && !create.isPending) void createDraft(next);
  }

  // A new page with something typed or picked counts as unsaved until the draft exists.
  const unsaved = episode
    ? dirty
    : values.title.trim() !== '' ||
      values.description.trim() !== '' ||
      stagedMedia !== undefined ||
      stagedCover !== undefined;

  const coverSrc = episode?.coverUrl ?? stagedCover?.url ?? null;

  return (
    <>
      <Link className="admin-back" to="/episodes">
        ← {t.title}
      </Link>
      <PageHeader title={episode ? episode.title : t.form.createTitle}>
        {episode ? <EpisodeBadge status={episode.status} /> : null}
        {episode ? (
          <Button
            variant="secondary"
            loading={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(undefined, {
                onSuccess: ({ episode: copy }) => {
                  toast.show(t.duplicate.done, { tone: 'success' });
                  void navigate(`/episodes/${copy.id}`);
                },
                onError: (err) => toast.show(errorText(err), { tone: 'danger' }),
              })
            }
          >
            {t.duplicate.button}
          </Button>
        ) : null}
        <Button
          type="submit"
          form="episode-form"
          loading={create.isPending || update.isPending}
          disabled={episode ? !dirty : !valid}
        >
          {episode ? mn.common.save : t.form.create}
        </Button>
      </PageHeader>

      <div className="admin-workspace">
        <div className="admin-workspace__main">
          <section className="admin-card" aria-labelledby="ep-media">
            <h2 id="ep-media" className="admin-card__title">
              {w.mediaTitle}
            </h2>
            <div className="admin-media-grid">
              <div className="admin-media-grid__item">
                <DropZone
                  className="admin-cover-pane"
                  label={t.cover.choose}
                  accept={COVER_TYPES.join(',')}
                  disabled={uploadCover.isPending}
                  onFile={pickCover}
                >
                  {coverSrc ? (
                    <>
                      <img className="admin-cover-pane__image" src={coverSrc} alt={t.cover.alt} />
                      <span className="admin-cover-pane__change">{w.coverChange}</span>
                    </>
                  ) : (
                    <>
                      <Icon name="library" />
                      <strong>{w.coverEmpty}</strong>
                      <span className="admin-drop__sub">{w.coverHint}</span>
                    </>
                  )}
                </DropZone>
                {waiting ? <Notice tone="info">{t.cover.processing}</Notice> : null}
                {uploadCover.isPending ? <p aria-live="polite">{t.cover.uploading}</p> : null}
                {coverError ? <Notice tone="danger">{coverError}</Notice> : null}
              </div>

              <div className="admin-media-grid__item">
                {episode ? (
                  <>
                    <MediaUploader
                      episode={episode}
                      onBusyChange={setUploading}
                      initialFile={stagedMedia}
                      onInitialStarted={() => setStagedMedia(undefined)}
                    />
                    {episode.media?.status === 'READY' ? (
                      <MediaPreview
                        key={episode.media.id}
                        episodeId={episode.id}
                        kind={episode.media.kind}
                      />
                    ) : null}
                  </>
                ) : stagedMedia ? (
                  <div className="admin-staged">
                    <Icon
                      name={mediaKindOfFile(stagedMedia.name) === 'VIDEO' ? 'video' : 'audio'}
                    />
                    <span className="admin-staged__text">
                      <strong>{stagedMedia.name}</strong>
                      <span className="admin-hint">
                        {formatBytes(stagedMedia.size)} ·{' '}
                        {values.title.trim() !== '' ? w.stagedNeedsCategory : w.stagedNote}
                      </span>
                    </span>
                    <Button variant="ghost" onClick={() => setStagedMedia(undefined)}>
                      {w.fileRemove}
                    </Button>
                  </div>
                ) : (
                  <DropZone label={t.audio.choose} accept={MEDIA_ACCEPT} onFile={pickMedia}>
                    <span className="admin-drop__icon">
                      <Icon name="audio" />
                    </span>
                    <strong>{w.fileEmpty}</strong>
                    <span className="admin-drop__sub">
                      {w.fileOr} <u>{w.filePick}</u>
                      <br />
                      {w.fileFormats}
                    </span>
                  </DropZone>
                )}
                {mediaError ? <Notice tone="danger">{mediaError}</Notice> : null}
              </div>
            </div>
          </section>

          <section className="admin-card" aria-labelledby="ep-details">
            <h2 id="ep-details" className="admin-card__title">
              {w.detailsTitle}
            </h2>
            <form
              id="episode-form"
              className="admin-form"
              onSubmit={(e) => void submit(e)}
              noValidate
            >
              <Fields values={values} set={set} autoFocus={!episode} onCommit={commit} />
              {error ? <Notice tone="danger">{error}</Notice> : null}
            </form>
          </section>

          {episode ? <DeleteSection episode={episode} /> : null}
        </div>

        <aside className="admin-workspace__side" aria-label={t.publish.title}>
          <PublishPanel episode={episode} values={values} set={set} saveIfDirty={saveIfDirty} />
        </aside>
      </div>
      <LeaveGuard uploading={uploading} unsaved={unsaved} />
    </>
  );
}

/** What the pickers offer: every audio and video type the API takes (ADR-0038). */
const MEDIA_ACCEPT = [...ALLOWED_AUDIO_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]
  .map((ext) => `.${ext}`)
  .join(',');

// ---------------------------------------------------------------- details fields

function Fields({
  values,
  set,
  autoFocus,
  onCommit,
}: {
  values: Values;
  set: (patch: Partial<Values>) => void;
  autoFocus: boolean;
  /** The details may now be enough to make the draft (a new page with a file waiting). */
  onCommit: (next: Values) => void;
}) {
  const categories = useQuery(categoriesQuery());
  const series = useQuery(seriesListQuery());
  const list = categories.data?.categories ?? [];

  return (
    <>
      <Input
        label={t.form.title}
        value={values.title}
        maxLength={200}
        onChange={(event) => set({ title: event.target.value })}
        onBlur={() => onCommit(values)}
        required
        autoFocus={autoFocus}
      />
      <Textarea
        label={t.form.description}
        value={values.description}
        maxLength={5000}
        rows={5}
        onChange={(event) => set({ description: event.target.value })}
      />
      <div className="admin-series-row">
        {categories.data && list.length === 0 ? (
          <Notice tone="warning">
            {t.form.noCategories} <Link to="/categories">{mn.nav.categories}</Link>
          </Notice>
        ) : (
          <SelectField
            label={t.form.category}
            value={values.categoryId}
            onChange={(categoryId) => {
              set({ categoryId });
              onCommit({ ...values, categoryId });
            }}
            options={[
              ...(values.categoryId === '' ? [{ value: '', label: t.form.pickCategory }] : []),
              ...list.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        )}
        <SelectField
          label={t.form.series}
          value={values.seriesId}
          onChange={(seriesId) =>
            set(seriesId !== values.seriesId ? { seriesId, part: '' } : { seriesId })
          }
          options={[
            { value: '', label: t.form.noSeries },
            ...(series.data?.series ?? []).map((s) => ({ value: s.id, label: s.title })),
          ]}
        />
        {values.seriesId ? (
          <Input
            label={t.form.part}
            type="number"
            inputMode="numeric"
            min={1}
            max={9999}
            step={1}
            value={values.part}
            hint={t.form.partHint}
            onChange={(event) => set({ part: event.target.value })}
          />
        ) : null}
      </div>
      <TagPicker value={values.tagIds} onChange={(tagIds) => set({ tagIds })} />
      <div>
        <label className="admin-check">
          <input
            type="checkbox"
            checked={values.isFree}
            onChange={(event) => set({ isFree: event.target.checked })}
          />
          <span>{t.free}</span>
        </label>
        <p className="admin-hint">{t.freeHint}</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- publishing

type Confirm = 'publish' | 'unschedule' | 'archive' | null;

/**
 * The side panel: what is still missing, whether members get a push, now or later, and the button
 * that publishes. Pending edits on the page are saved first (one save, ADR-0068).
 */
function PublishPanel({
  episode,
  values,
  set,
  saveIfDirty,
}: {
  episode: AdminEpisodeDto | undefined;
  values: Values;
  set: (patch: Partial<Values>) => void;
  saveIfDirty: () => Promise<boolean>;
}) {
  const toast = useToast();
  const { transition, schedule } = useEpisodeActions(episode?.id);
  const p = t.publish;
  const now = useNow();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [mode, setMode] = useState<'now' | 'later'>(
    episode?.status === 'SCHEDULED' ? 'later' : 'now',
  );
  const [when, setWhen] = useState(
    episode?.scheduledFor ? toUlaanbaatarInputValue(new Date(episode.scheduledFor)) : '',
  );

  const picked = when ? ulaanbaatarInputToDate(when) : undefined;
  const inFuture = picked !== undefined && picked.getTime() > now;
  const missing = episode?.missing ?? ['cover', 'media'];
  const canPublish = episode !== undefined && missing.length === 0;
  const open =
    episode === undefined || episode.status === 'DRAFT' || episode.status === 'SCHEDULED';

  const run = (action: 'publish' | 'unschedule' | 'archive' | 'restore', message: string) =>
    transition.mutateAsync(action).then(() => toast.show(message, { tone: 'success' }));

  const checks: Array<{ key: string; label: string; ok: boolean }> = [
    { key: 'details', label: w.checkDetails, ok: episode !== undefined },
    { key: 'cover', label: w.checkCover, ok: !missing.includes('cover') },
    { key: 'media', label: w.checkMedia, ok: !missing.includes('media') },
  ];

  return (
    <div className="admin-card admin-publish-panel">
      <h2 className="admin-card__title">{p.title}</h2>

      {episode ? (
        <div className="admin-publish-panel__status">
          <EpisodeBadge status={episode.status} />
          {episode.scheduledFor && episode.status === 'SCHEDULED' ? (
            <span>{w.scheduledAt(formatDateTime(episode.scheduledFor))}</span>
          ) : null}
          {episode.publishedAt ? (
            <span>{t.publishedAt(formatDateTime(episode.publishedAt))}</span>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <>
          <ul className="admin-checklist" aria-label={w.checklistTitle}>
            {checks.map((check) => (
              <li key={check.key} className={check.ok ? 'is-ok' : undefined}>
                <span className="admin-checklist__mark" aria-hidden="true">
                  {check.ok ? <Icon name="check" size="small" /> : null}
                </span>
                {check.label}
              </li>
            ))}
          </ul>

          {episode ? <NotifyFields values={values} set={set} /> : null}

          <div role="group" aria-label={p.title} className="admin-segmented admin-segmented--full">
            <button type="button" aria-pressed={mode === 'now'} onClick={() => setMode('now')}>
              {w.now}
            </button>
            <button type="button" aria-pressed={mode === 'later'} onClick={() => setMode('later')}>
              {w.later}
            </button>
          </div>

          {mode === 'later' ? (
            <>
              <SchedulePicker value={when} onChange={setWhen} now={now} />
              <p className={picked && !inFuture ? 'admin-hint admin-hint--error' : 'admin-hint'}>
                {picked && inFuture
                  ? `${p.schedulePreview(formatDateTime(picked.toISOString()))} · ${mn.common.ulaanbaatarTime}`
                  : picked
                    ? p.schedulePast
                    : p.scheduleHint}
              </p>
              <Button
                variant="secondary"
                loading={schedule.isPending}
                disabled={!canPublish || !inFuture}
                onClick={() => {
                  if (!picked) return;
                  void saveIfDirty().then((saved) => {
                    if (!saved) return;
                    schedule.mutate(toUlaanbaatarIso(picked), {
                      onSuccess: () => toast.show(p.scheduled, { tone: 'success' }),
                    });
                  });
                }}
              >
                {p.schedule}
              </Button>
            </>
          ) : (
            <Button disabled={!canPublish} onClick={() => setConfirm('publish')}>
              {p.now}
            </Button>
          )}
          {!canPublish ? <p className="admin-hint">{episode ? w.notReady : w.saveFirst}</p> : null}

          {episode?.status === 'SCHEDULED' ? (
            <Button variant="ghost" onClick={() => setConfirm('unschedule')}>
              {p.unschedule}
            </Button>
          ) : null}
        </>
      ) : null}

      {episode?.status === 'PUBLISHED' ? (
        <Button variant="secondary" onClick={() => setConfirm('archive')}>
          {p.archive}
        </Button>
      ) : null}
      {episode?.status === 'ARCHIVED' ? (
        <Button
          variant="secondary"
          loading={transition.isPending}
          onClick={() => void run('restore', p.restored).catch(() => undefined)}
        >
          {p.restore}
        </Button>
      ) : null}

      <ConfirmDialog
        open={confirm === 'publish'}
        title={p.nowConfirmTitle}
        text={
          values.notify
            ? p.nowConfirmNotify(values.pushText.trim() || values.title.trim())
            : p.nowConfirmQuiet
        }
        confirmLabel={p.now}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (await saveIfDirty()) await run('publish', p.published);
        }}
      />
      <ConfirmDialog
        open={confirm === 'unschedule'}
        title={p.unscheduleConfirmTitle}
        text={p.unscheduleConfirmText}
        confirmLabel={p.unschedule}
        tone="destructive"
        onClose={() => setConfirm(null)}
        onConfirm={() => run('unschedule', p.unscheduled)}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        title={p.archiveConfirmTitle}
        text={p.archiveConfirmText}
        confirmLabel={p.archive}
        tone="destructive"
        onClose={() => setConfirm(null)}
        onConfirm={() => run('archive', p.archived)}
      />
    </div>
  );
}

/** Whether to tell the members when this goes out, and with which words (saved with the page). */
function NotifyFields({ values, set }: { values: Values; set: (patch: Partial<Values>) => void }) {
  return (
    <div className="admin-form">
      <label className="admin-check">
        <input
          type="checkbox"
          checked={values.notify}
          onChange={(event) => set({ notify: event.target.checked })}
        />
        <span>{t.notify.switch}</span>
      </label>
      {values.notify ? (
        <Input
          label={t.notify.text}
          value={values.pushText}
          maxLength={180}
          hint={t.notify.textHint}
          onChange={(event) => set({ pushText: event.target.value })}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- delete

function DeleteSection({ episode }: { episode: AdminEpisodeDto }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { remove } = useEpisodeActions(episode.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="admin-card admin-card--danger" aria-label={t.deleteEpisode}>
      <Button
        variant="secondary"
        disabled={episode.status !== 'DRAFT'}
        onClick={() => setConfirming(true)}
      >
        {t.deleteEpisode}
      </Button>
      {episode.status !== 'DRAFT' ? <p className="admin-hint">{t.deleteOnlyDraft}</p> : null}
      <ConfirmDialog
        open={confirming}
        title={t.deleteConfirmTitle}
        text={t.deleteConfirmText(episode.title)}
        confirmLabel={mn.common.delete}
        tone="destructive"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await remove.mutateAsync();
          toast.show(t.deleted, { tone: 'success' });
          void navigate('/episodes', { replace: true });
        }}
      />
    </section>
  );
}
