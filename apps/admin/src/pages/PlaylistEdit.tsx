import { useQuery } from '@tanstack/react-query';
import type { AdminPlaylistDetailDto, CreatePlaylistRequest } from '@ongod/shared';
import { Button, Input, Notice, Skeleton, Textarea, useToast } from '@ongod/ui-web';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/client';
import { playlistQuery, usePlaylistActions } from '../api/queries';
import { EpisodeBadge, LoadError, PageHeader } from '../components/bits';
import { CoverCard } from '../components/CoverCard';
import { EpisodePicker } from '../components/EpisodePicker';
import { errorText } from '../components/Modal';
import { SortableList } from '../components/SortableList';
import { suggestSlug } from '../lib/format';
import { mn } from '../i18n/mn';

const t = mn.playlists;

export function PlaylistEditPage() {
  const { id } = useParams();
  if (!id) return <PlaylistCreate />;
  return <PlaylistEdit id={id} />;
}

// ---------------------------------------------------------------- create

function PlaylistCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const { create } = usePlaylistActions(undefined);

  return (
    <>
      <Link className="admin-back" to="/playlists">
        ← {t.title}
      </Link>
      <PageHeader title={t.createTitle} />
      <section className="admin-card">
        <DetailsForm
          submitLabel={t.form.create}
          pending={create.isPending}
          onSubmit={async (values) => {
            const { playlist } = await create.mutateAsync(values);
            toast.show(t.created, { tone: 'success' });
            void navigate(`/playlists/${playlist.id}`, { replace: true });
          }}
        />
      </section>
    </>
  );
}

// ---------------------------------------------------------------- edit

function PlaylistEdit({ id }: { id: string }) {
  const query = useQuery(playlistQuery(id));

  if (query.error instanceof ApiError && query.error.status === 404) {
    return (
      <>
        <Link className="admin-back" to="/playlists">
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
  return <PlaylistScreen playlist={query.data.playlist} refetch={() => void query.refetch()} />;
}

function PlaylistScreen({
  playlist,
  refetch,
}: {
  playlist: AdminPlaylistDetailDto;
  refetch: () => void;
}) {
  const toast = useToast();
  const { update, reorder, addItems, removeItem, uploadCover } = usePlaylistActions(playlist.id);
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
      <Link className="admin-back" to="/playlists">
        ← {t.title}
      </Link>
      <PageHeader title={playlist.title} />

      <div className="admin-columns">
        <section className="admin-card" aria-labelledby="playlist-details">
          <h2 id="playlist-details" className="admin-card__title">
            {t.editTitle}
          </h2>
          <DetailsForm
            key={playlist.id}
            initial={playlist}
            submitLabel={mn.common.save}
            pending={update.isPending}
            onSubmit={async (values) => {
              // Онцлох keeps its title and slug (the server answers 409 otherwise).
              const { title, slug, ...rest } = values;
              await update.mutateAsync(playlist.isFeatured ? rest : { title, slug, ...rest });
              toast.show(mn.common.saved, { tone: 'success' });
            }}
          />
        </section>

        <section className="admin-card" aria-labelledby="playlist-cover">
          <h2 id="playlist-cover" className="admin-card__title">
            {t.cover.title}
          </h2>
          <CoverCard
            coverUrl={playlist.coverUrl}
            alt={t.cover.alt}
            upload={(file) => uploadCover.mutateAsync(file)}
            refetch={refetch}
          />
        </section>
      </div>

      <section className="admin-card" aria-labelledby="playlist-items">
        <h2 id="playlist-items" className="admin-card__title">
          {t.items.title}
        </h2>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {playlist.episodes.length === 0 ? (
          <p className="admin-hint">{t.items.empty}</p>
        ) : (
          <>
            <p className="admin-hint">{mn.sortable.dragHint}</p>
            <SortableList
              items={playlist.episodes}
              getId={(episode) => episode.id}
              getLabel={(episode) => episode.title}
              disabled={busy}
              onReorder={(ids) => run(reorder.mutateAsync(ids), t.items.reordered)}
              render={(episode) => (
                <>
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

      <section className="admin-card" aria-labelledby="playlist-picker">
        <h2 id="playlist-picker" className="admin-card__title">
          {mn.picker.title}
        </h2>
        <EpisodePicker
          excludeIds={playlist.episodes.map((episode) => episode.id)}
          disabled={busy}
          onAdd={(episodeId) => run(addItems.mutateAsync([episodeId]), t.items.added)}
        />
      </section>
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
  initial?: AdminPlaylistDetailDto;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: Required<CreatePlaylistRequest>) => Promise<unknown>;
}) {
  const fixed = initial?.isFeatured === true;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  // The slug follows the title until the admin edits it by hand.
  const [slugTouched, setSlugTouched] = useState(initial !== undefined);
  const [description, setDescription] = useState(initial?.description ?? '');
  const [showOnHome, setShowOnHome] = useState(initial?.showOnHome ?? false);
  const [error, setError] = useState<string>();
  const valid = title.trim() !== '' && slug.length >= 2;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!valid || pending) return;
    setError(undefined);
    try {
      await onSubmit({ title: title.trim(), slug, description: description.trim(), showOnHome });
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
        disabled={fixed}
        onChange={(event) => {
          setTitle(event.target.value);
          if (!slugTouched) setSlug(suggestSlug(event.target.value));
        }}
        required
        autoFocus={!initial}
      />
      <Input
        label={t.form.slug}
        hint={fixed ? t.form.featuredFixed : t.form.slugHint}
        value={slug}
        maxLength={60}
        disabled={fixed}
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
      <label className="admin-check">
        <input
          type="checkbox"
          checked={showOnHome}
          onChange={(event) => setShowOnHome(event.target.checked)}
        />
        <span>{t.form.showOnHome}</span>
      </label>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <div>
        <Button type="submit" loading={pending} disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
