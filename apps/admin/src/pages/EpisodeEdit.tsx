import { useQuery } from '@tanstack/react-query';
import { MAX_COVER_BYTES, type AdminEpisodeDto } from '@ongod/shared';
import { Button, FileField, Input, Notice, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { categoriesQuery, episodeQuery, useEpisodeActions } from '../api/queries';
import { EpisodeBadge, Fact, LoadError, PageHeader, SelectField, useNow } from '../components/bits';
import { ConfirmDialog } from '../components/Modal';
import {
  formatDateTime,
  toUlaanbaatarInputValue,
  toUlaanbaatarIso,
  ulaanbaatarInputToDate,
} from '../lib/format';
import { mn } from '../i18n/mn';
import { AudioUploader } from '../upload/AudioUploader';

const t = mn.episodes;

export function EpisodeEditPage() {
  const { id } = useParams();
  if (!id) return <EpisodeCreate />;
  return <EpisodeEdit id={id} />;
}

// ---------------------------------------------------------------- create

function EpisodeCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const { create } = useEpisodeActions(undefined);

  return (
    <>
      <Link className="admin-back" to="/episodes">
        ← {mn.episodes.title}
      </Link>
      <PageHeader title={t.form.createTitle} />
      <section className="admin-card">
        <DetailsForm
          submitLabel={t.form.create}
          pending={create.isPending}
          onSubmit={async (values) => {
            const { episode } = await create.mutateAsync(values);
            toast.show(t.created, { tone: 'success' });
            void navigate(`/episodes/${episode.id}`, { replace: true });
          }}
        />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- edit

function EpisodeEdit({ id }: { id: string }) {
  const query = useQuery(episodeQuery(id));

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <>
        <Link className="admin-back" to="/episodes">
          ← {mn.episodes.title}
        </Link>
        <Notice tone="warning">{t.notFound}</Notice>
      </>
    );
  }
  if (query.error) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) {
    return (
      <>
        <Skeleton width="40%" />
        <Skeleton width="70%" />
      </>
    );
  }
  return <EpisodeScreen episode={query.data.episode} refetch={() => void query.refetch()} />;
}

function EpisodeScreen({ episode, refetch }: { episode: AdminEpisodeDto; refetch: () => void }) {
  const toast = useToast();
  const { update } = useEpisodeActions(episode.id);

  return (
    <>
      <Link className="admin-back" to="/episodes">
        ← {mn.episodes.title}
      </Link>
      <PageHeader title={episode.title}>
        <EpisodeBadge status={episode.status} />
      </PageHeader>

      <div className="admin-columns">
        <section className="admin-card" aria-labelledby="ep-details">
          <h2 id="ep-details" className="admin-card__title">
            {t.form.editTitle}
          </h2>
          <DetailsForm
            key={episode.id}
            initial={episode}
            submitLabel={mn.common.save}
            pending={update.isPending}
            onSubmit={async (values) => {
              await update.mutateAsync(values);
              toast.show(mn.common.saved, { tone: 'success' });
            }}
          />
        </section>

        <section className="admin-card" aria-labelledby="ep-cover">
          <h2 id="ep-cover" className="admin-card__title">
            {t.cover.title}
          </h2>
          <CoverSection episode={episode} refetch={refetch} />
        </section>
      </div>

      <section className="admin-card" aria-labelledby="ep-audio">
        <h2 id="ep-audio" className="admin-card__title">
          {t.audio.title}
        </h2>
        <AudioUploader episode={episode} />
      </section>

      <section className="admin-card" aria-labelledby="ep-publish">
        <h2 id="ep-publish" className="admin-card__title">
          {t.publish.title}
        </h2>
        <PublishSection episode={episode} />
      </section>

      <DeleteSection episode={episode} />
    </>
  );
}

// ---------------------------------------------------------------- details

function DetailsForm({
  initial,
  submitLabel,
  pending,
  onSubmit,
}: {
  initial?: AdminEpisodeDto;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: {
    title: string;
    description: string;
    categoryId: string;
  }) => Promise<unknown>;
}) {
  const categories = useQuery(categoriesQuery());
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.category.id ?? '');
  const [error, setError] = useState<string>();

  const list = categories.data?.categories ?? [];
  const valid = title.trim() !== '' && categoryId !== '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setError(undefined);
    try {
      await onSubmit({ title: title.trim(), description: description.trim(), categoryId });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : mn.common.errorGeneric);
    }
  }

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
      <Input
        label={t.form.title}
        value={title}
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
        required
        autoFocus={!initial}
      />
      <Textarea
        label={t.form.description}
        value={description}
        maxLength={5000}
        rows={6}
        onChange={(event) => setDescription(event.target.value)}
      />
      {categories.data && list.length === 0 ? (
        <Notice tone="warning">
          {t.form.noCategories} <Link to="/categories">{mn.nav.categories}</Link>
        </Notice>
      ) : (
        <SelectField
          label={t.form.category}
          value={categoryId}
          onChange={setCategoryId}
          options={[
            ...(categoryId === '' ? [{ value: '', label: t.form.pickCategory }] : []),
            ...list.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      )}
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" loading={pending} disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- cover

const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function CoverSection({ episode, refetch }: { episode: AdminEpisodeDto; refetch: () => void }) {
  const toast = useToast();
  const { uploadCover } = useEpisodeActions(episode.id);
  const [error, setError] = useState<string>();
  const [pickerKey, setPickerKey] = useState(0);
  // The server resizes the cover in the background; look again every 2 s for a short while.
  const [waiting, setWaiting] = useState(false);
  const lastThumb = useRef(episode.thumbUrl);

  useEffect(() => {
    if (!waiting) return;
    const poll = setInterval(refetch, 2000);
    const stop = setTimeout(() => setWaiting(false), 30_000);
    return () => {
      clearInterval(poll);
      clearTimeout(stop);
    };
  }, [waiting, refetch]);

  useEffect(() => {
    if (episode.thumbUrl !== lastThumb.current) {
      lastThumb.current = episode.thumbUrl;
      setWaiting(false);
    }
  }, [episode.thumbUrl]);

  function choose(file: File) {
    setError(undefined);
    if (!COVER_TYPES.includes(file.type) || file.size > MAX_COVER_BYTES) {
      setError(mn.episodes.cover.hint);
      return;
    }
    uploadCover.mutate(file, {
      onSuccess: () => {
        setWaiting(true);
        setPickerKey((key) => key + 1);
        toast.show(t.cover.uploaded, { tone: 'success' });
      },
    });
  }

  return (
    <div className="admin-cover">
      {episode.coverUrl ? (
        <img className="admin-cover__image" src={episode.coverUrl} alt={t.cover.alt} />
      ) : (
        <p className="admin-hint">{t.cover.none}</p>
      )}
      {waiting ? <Notice tone="info">{t.cover.processing}</Notice> : null}
      <FileField
        key={pickerKey}
        label={t.cover.choose}
        hint={t.cover.hint}
        accept={COVER_TYPES.join(',')}
        disabled={uploadCover.isPending}
        {...(error ? { error } : {})}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) choose(file);
        }}
      />
      {uploadCover.isPending ? <p aria-live="polite">{t.cover.uploading}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------- publishing

type Confirm = 'publish' | 'unschedule' | 'archive' | null;

function PublishSection({ episode }: { episode: AdminEpisodeDto }) {
  const toast = useToast();
  const { transition, schedule } = useEpisodeActions(episode.id);
  const p = t.publish;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [when, setWhen] = useState(
    episode.scheduledFor ? toUlaanbaatarInputValue(new Date(episode.scheduledFor)) : '',
  );

  const picked = when ? ulaanbaatarInputToDate(when) : undefined;
  const now = useNow();
  const inFuture = picked !== undefined && picked.getTime() > now;
  const canPublish = episode.missing.length === 0;
  const open = episode.status === 'DRAFT' || episode.status === 'SCHEDULED';

  const run = (action: 'publish' | 'unschedule' | 'archive' | 'restore', message: string) =>
    transition.mutateAsync(action).then(() => toast.show(message, { tone: 'success' }));

  return (
    <div className="admin-publish">
      <dl className="admin-facts">
        <Fact label={t.columns.status}>
          <EpisodeBadge status={episode.status} />
        </Fact>
        {episode.scheduledFor ? (
          <Fact label={p.scheduleLabel}>{formatDateTime(episode.scheduledFor)}</Fact>
        ) : null}
        {episode.publishedAt ? (
          <Fact label={t.columns.when}>{t.publishedAt(formatDateTime(episode.publishedAt))}</Fact>
        ) : null}
      </dl>

      {open && !canPublish ? (
        <Notice tone="warning">
          {t.missing.text(episode.missing.map((m) => t.missing[m]).join(', '))}
        </Notice>
      ) : null}

      {open ? (
        <>
          <div className="admin-publish__row">
            <Button disabled={!canPublish} onClick={() => setConfirm('publish')}>
              {p.now}
            </Button>
          </div>
          <form
            className="admin-publish__row"
            onSubmit={(event) => {
              event.preventDefault();
              if (!picked || !inFuture) return;
              schedule.mutate(toUlaanbaatarIso(picked), {
                onSuccess: () => toast.show(p.scheduled, { tone: 'success' }),
              });
            }}
          >
            <Input
              label={`${p.scheduleLabel} · ${mn.common.ulaanbaatarTime}`}
              type="datetime-local"
              value={when}
              min={toUlaanbaatarInputValue(new Date(now))}
              onChange={(event) => setWhen(event.target.value)}
              hint={
                picked && inFuture
                  ? p.schedulePreview(formatDateTime(picked.toISOString()))
                  : picked
                    ? undefined
                    : p.scheduleHint
              }
              {...(picked && !inFuture ? { error: p.schedulePast } : {})}
            />
            <Button
              type="submit"
              variant="secondary"
              loading={schedule.isPending}
              disabled={!canPublish || !inFuture}
            >
              {p.schedule}
            </Button>
          </form>
          {episode.status === 'SCHEDULED' ? (
            <div className="admin-publish__row">
              <Button variant="secondary" onClick={() => setConfirm('unschedule')}>
                {p.unschedule}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {episode.status === 'PUBLISHED' ? (
        <div className="admin-publish__row">
          <Button variant="secondary" onClick={() => setConfirm('archive')}>
            {p.archive}
          </Button>
        </div>
      ) : null}
      {episode.status === 'ARCHIVED' ? (
        <div className="admin-publish__row">
          <Button
            variant="secondary"
            loading={transition.isPending}
            onClick={() => void run('restore', p.restored).catch(() => undefined)}
          >
            {p.restore}
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirm === 'publish'}
        title={p.nowConfirmTitle}
        text={p.nowConfirmText}
        confirmLabel={p.now}
        onClose={() => setConfirm(null)}
        onConfirm={() => run('publish', p.published)}
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
