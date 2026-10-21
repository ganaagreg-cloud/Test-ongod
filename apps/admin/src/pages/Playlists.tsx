import { useQuery } from '@tanstack/react-query';
import type { AdminPlaylistDto } from '@ongod/shared';
import { Badge, Button, EmptyState, Skeleton, useToast } from '@ongod/ui-web';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { playlistsQuery, usePlaylistActions } from '../api/queries';
import { LoadError, PageHeader } from '../components/bits';
import { ConfirmDialog, errorText } from '../components/Modal';
import { SortableList } from '../components/SortableList';
import { mn } from '../i18n/mn';

export function PlaylistsPage() {
  const t = mn.playlists;
  const navigate = useNavigate();
  const toast = useToast();
  const list = useQuery(playlistsQuery());
  const { remove, reorderHome } = usePlaylistActions(undefined);
  const [deleting, setDeleting] = useState<AdminPlaylistDto>();

  const playlists = list.data?.playlists ?? [];
  // Онцлох is always first on the home page, so only the others can be ordered.
  const homeOrdered = playlists
    .filter((playlist) => playlist.showOnHome && !playlist.isFeatured)
    .sort((a, b) => a.homeOrder - b.homeOrder);
  const create = () => void navigate('/playlists/new');

  return (
    <>
      <PageHeader title={t.title}>
        <Button onClick={create}>{t.new}</Button>
      </PageHeader>
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && playlists.length === 0 ? (
        <EmptyState title={t.empty} action={<Button onClick={create}>{t.new}</Button>} />
      ) : null}
      {playlists.length > 0 ? (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="ui-visually-hidden">{t.title}</caption>
            <thead>
              <tr>
                <th scope="col">{t.columns.title}</th>
                <th scope="col">{t.columns.slug}</th>
                <th scope="col">{t.columns.episodes}</th>
                <th scope="col">{t.columns.home}</th>
                <th scope="col">{t.columns.actions}</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((playlist) => (
                <tr key={playlist.id}>
                  <td>
                    <span className="admin-episode-cell">
                      <strong>{playlist.title}</strong>
                      {playlist.isFeatured ? <Badge tone="info">{t.featured}</Badge> : null}
                    </span>
                  </td>
                  <td>
                    <code className="admin-code">{playlist.slug}</code>
                  </td>
                  <td>{playlist.episodeCount}</td>
                  <td>{playlist.showOnHome ? t.onHome : t.notOnHome}</td>
                  <td>
                    <span className="admin-row-actions">
                      <Button
                        variant="secondary"
                        onClick={() => void navigate(`/playlists/${playlist.id}`)}
                      >
                        {mn.common.edit}
                      </Button>
                      <Button variant="secondary" onClick={() => setDeleting(playlist)}>
                        {mn.common.delete}
                      </Button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {list.data ? (
        <section className="admin-card" aria-labelledby="home-order">
          <h2 id="home-order" className="admin-card__title">
            {t.home.title}
          </h2>
          <p className="admin-hint">{t.home.text}</p>
          {homeOrdered.length === 0 ? (
            <p className="admin-hint">{t.home.empty}</p>
          ) : (
            <SortableList
              items={homeOrdered}
              getId={(playlist) => playlist.id}
              getLabel={(playlist) => playlist.title}
              disabled={reorderHome.isPending}
              onReorder={(ids) =>
                reorderHome.mutate(ids, {
                  onSuccess: () => toast.show(t.home.reordered, { tone: 'success' }),
                  onError: (err) => toast.show(errorText(err), { tone: 'danger' }),
                })
              }
              render={(playlist) => <strong>{playlist.title}</strong>}
            />
          )}
        </section>
      ) : null}

      <ConfirmDialog
        open={deleting !== undefined}
        title={t.deleteTitle}
        text={deleting ? t.deleteText(deleting.title) : undefined}
        confirmLabel={mn.common.delete}
        tone="destructive"
        onClose={() => setDeleting(undefined)}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.show(t.deleted, { tone: 'success' });
          } catch (err) {
            // Онцлох cannot be deleted (409): the server's message goes to a toast.
            toast.show(errorText(err), { tone: 'danger' });
          }
        }}
      />
    </>
  );
}
