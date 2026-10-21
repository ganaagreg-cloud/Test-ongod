import { useQuery } from '@tanstack/react-query';
import type { AdminSeriesDetailDto } from '@ongod/shared';
import { Button, Input, Notice, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { seriesQuery, useSeriesActions } from '../api/queries';
import { EpisodeBadge, LoadError, PageHeader } from '../components/bits';
import { CoverCard } from '../components/CoverCard';
import { EpisodePicker } from '../components/EpisodePicker';
import { ConfirmDialog, errorText } from '../components/Modal';
import { SortableList } from '../components/SortableList';
import { suggestSlug } from '../lib/format';
import { mn } from '../i18n/mn';

const t = mn.series;

export function SeriesEditPage() {
  const { id } = useParams();
  if (!id) return <SeriesCreate />;
  return <SeriesEdit id={id} />;
}

// ---------------------------------------------------------------- create

function SeriesCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const { create } = useSeriesActions(undefined);

  return (
    <>
      <Link className="admin-back" to="/series">
        ← {t.title}
      </Link>
      <PageHeader title={t.createTitle} />
      <section className="admin-card">
        <DetailsForm
          submitLabel={t.form.create}
          pending={create.isPending}
          onSubmit={async (values) => {
            const { series } = await create.mutateAsync(values);
            toast.show(t.created, { tone: 'success' });
            void navigate(`/series/${series.id}`, { replace: true });
          }}
        />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- edit

function SeriesEdit({ id }: { id: string }) {
  const query = useQuery(seriesQuery(id));

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <>
        <Link className="admin-back" to="/series">
          ← {t.title}
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
  return <SeriesScreen series={query.data.series} refetch={() => void query.refetch()} />;
}

function SeriesScreen({ series, refetch }: { series: AdminSeriesDetailDto; refetch: () => void }) {
  const toast = useToast();
  const { update, reorder, addItems, removeItem, uploadCover } = useSeriesActions(series.id);
  const [error, setError] = useState<string>();
  const busy = reorder.isPending || addItems.isPending || removeItem.isPending;

  // Mutations here are fire-and-report: a failed one shows its message above the list.
  function run(promise: Promise<unknown>, message: string) {
    setError(undefined);
    promise.then(
      () => toast.show(message, { tone: 'success' }),
      (err: unknown) => setError(errorText(err)),
    );
  }

  return (
    <>
      <Link className="admin-back" to="/series">
        ← {t.title}
      </Link>
      <PageHeader title={series.title} />

      <div className="admin-columns">
        <section className="admin-card" aria-labelledby="series-details">
          <h2 id="series-details" className="admin-card__title">
            {t.editTitle}
          </h2>
          <DetailsForm
            key={series.id}
            initial={series}
            submitLabel={mn.common.save}
            pending={update.isPending}
            onSubmit={async (values) => {
              await update.mutateAsync(values);
              toast.show(mn.common.saved, { tone: 'success' });
            }}
          />
        </section>

        <section className="admin-card" aria-labelledby="series-cover">
          <h2 id="series-cover" className="admin-card__title">
            {t.cover.title}
          </h2>
          <CoverCard
            coverUrl={series.coverUrl}
            alt={t.cover.alt}
            upload={(file) => uploadCover.mutateAsync(file)}
            refetch={refetch}
          />
        </section>
      </div>

      <section className="admin-card" aria-labelledby="series-items">
        <h2 id="series-items" className="admin-card__title">
          {t.items.title}
        </h2>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {series.episodes.length === 0 ? (
          <p className="admin-hint">{t.items.empty}</p>
        ) : (
          <>
            <p className="admin-hint">{mn.sortable.dragHint}</p>
            <SortableList
              items={series.episodes}
              getId={(episode) => episode.id}
              getLabel={(episode) => episode.title}
              disabled={busy}
              onReorder={(ids) => run(reorder.mutateAsync(ids), t.items.reordered)}
              render={(episode) => (
                <>
                  <span className="admin-code">{t.items.part(episode.seriesPart)}</span>{' '}
                  <strong>{episode.title}</strong> <EpisodeBadge status={episode.status} />
                </>
              )}
              actions={(episode) => (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(removeItem.mutateAsync(episode.id), t.items.removed)}
                >
                  {t.items.remove}
                </Button>
              )}
            />
          </>
        )}
      </section>

      <section className="admin-card" aria-labelledby="series-picker">
        <h2 id="series-picker" className="admin-card__title">
          {mn.picker.title}
        </h2>
        <EpisodePicker
          excludeIds={series.episodes.map((episode) => episode.id)}
          disabled={busy}
          onAdd={(episodeId) => run(addItems.mutateAsync([episodeId]), t.items.added)}
        />
      </section>

      <DeleteSection series={series} />
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
  initial?: AdminSeriesDetailDto;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: { title: string; slug: string; description: string }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  // The slug follows the title until the admin edits it by hand.
  const [slugTouched, setSlugTouched] = useState(initial !== undefined);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string>();
  const valid = title.trim() !== '' && slug.length >= 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setError(undefined);
    try {
      await onSubmit({ title: title.trim(), slug, description: description.trim() });
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="admin-form" onSubmit={(event) => void submit(event)} noValidate>
      <Input
        label={t.form.title}
        value={title}
        maxLength={200}
        onChange={(event) => {
          setTitle(event.target.value);
          if (!slugTouched) setSlug(suggestSlug(event.target.value));
        }}
        required
        autoFocus={!initial}
      />
      <Input
        label={t.form.slug}
        hint={t.form.slugHint}
        value={slug}
        maxLength={60}
        autoCapitalize="none"
        spellCheck={false}
        onChange={(event) => {
          setSlugTouched(true);
          setSlug(event.target.value);
        }}
        required
      />
      <Textarea
        label={t.form.description}
        value={description}
        maxLength={5000}
        rows={6}
        onChange={(event) => setDescription(event.target.value)}
      />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" loading={pending} disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- delete

function DeleteSection({ series }: { series: AdminSeriesDetailDto }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { remove } = useSeriesActions(series.id);
  const [confirming, setConfirming] = useState(false);

  return (
    <section className="admin-card admin-card--danger" aria-label={t.deleteSeries}>
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        {t.deleteSeries}
      </Button>
      <ConfirmDialog
        open={confirming}
        title={t.deleteTitle}
        text={t.deleteText(series.title)}
        confirmLabel={mn.common.delete}
        tone="destructive"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          await remove.mutateAsync();
          toast.show(t.deleted, { tone: 'success' });
          void navigate('/series', { replace: true });
        }}
      />
    </section>
  );
}
