import { useQuery } from '@tanstack/react-query';
import { Button, Input, Skeleton } from '@ongod/ui-web';
import { useState } from 'react';
import { episodesQuery } from '../api/queries';
import { mn } from '../i18n/mn';
import { EpisodeBadge, LoadError, useDebounced } from './bits';

interface EpisodePickerProps {
  /** Items already in the collection: shown as added, not addable. */
  excludeIds: readonly string[];
  disabled?: boolean;
  onAdd: (episodeId: string) => void;
}

/** Search existing content by title and add it to a series or a playlist. */
export function EpisodePicker({ excludeIds, disabled = false, onAdd }: EpisodePickerProps) {
  const t = mn.picker;
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const list = useQuery(episodesQuery({ ...(q ? { q } : {}), page: 1 }));
  const items = list.data?.items ?? [];

  return (
    <div className="admin-form">
      <Input
        label={t.searchLabel}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {list.error ? <LoadError error={list.error} onRetry={() => void list.refetch()} /> : null}
      {list.isPending ? <Skeleton width="70%" /> : null}
      {list.data && items.length === 0 ? <p className="admin-hint">{t.empty}</p> : null}
      {items.length > 0 ? (
        <ul className="admin-list">
          {items.map((episode) => {
            const added = excludeIds.includes(episode.id);
            return (
              <li key={episode.id} className="admin-list__row">
                <span className="admin-list__main">
                  <strong>{episode.title}</strong> <EpisodeBadge status={episode.status} />
                </span>
                <Button
                  variant="secondary"
                  disabled={added || disabled}
                  onClick={() => onAdd(episode.id)}
                >
                  {added ? t.added : t.add}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
