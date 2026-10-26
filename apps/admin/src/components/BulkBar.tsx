import { useQuery } from '@tanstack/react-query';
import { BULK_MAX_IDS, type BulkAction } from '@ongod/shared';
import { Button, Notice, useToast } from '@ongod/ui-web';
import { useState } from 'react';
import { ApiError } from '../api/client';
import {
  categoriesQuery,
  playlistsQuery,
  tagsQuery,
  useBulkEpisodes,
  useUnarchive,
} from '../api/queries';
import { mn } from '../i18n/mn';
import { SelectField } from './bits';
import { ConfirmDialog, errorText } from './Modal';

type BulkType = BulkAction['type'];
const TYPES: BulkType[] = [
  'setCategory',
  'addToPlaylist',
  'addTag',
  'removeTag',
  'publish',
  'archive',
];

interface BulkBarProps {
  selectedIds: string[];
  /** Titles of the selected items, to name the ones the server refused. */
  titles: Readonly<Record<string, string>>;
  /** Called after the action went through (the page clears its selection). */
  onDone: () => void;
  onClear: () => void;
}

const t = mn.episodes.bulk;

/** Appears while at least one row is selected: one action for all of them. */
export function BulkBar({ selectedIds, titles, onDone, onClear }: BulkBarProps) {
  const toast = useToast();
  const bulk = useBulkEpisodes();
  const unarchive = useUnarchive();
  const categories = useQuery(categoriesQuery());
  const playlists = useQuery(playlistsQuery());
  const tags = useQuery(tagsQuery());
  const [type, setType] = useState<BulkType | ''>('');
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState<'publish' | 'archive' | null>(null);
  const [failure, setFailure] = useState<{ message: string; ids: string[] }>();

  if (selectedIds.length === 0) return null;

  const tagOptions = (tags.data?.tags ?? []).map((tag) => ({ value: tag.id, label: tag.name }));
  const options: Partial<Record<BulkType, Array<{ value: string; label: string }>>> = {
    setCategory: (categories.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name })),
    addToPlaylist: (playlists.data?.playlists ?? []).map((p) => ({ value: p.id, label: p.title })),
    addTag: tagOptions,
    removeTag: tagOptions,
  };
  const choices = type ? options[type] : undefined;
  const targetLabel =
    type === 'setCategory' ? t.category : type === 'addToPlaylist' ? t.playlist : t.tag;

  function build(): BulkAction | undefined {
    switch (type) {
      case 'setCategory':
        return target ? { type, categoryId: target } : undefined;
      case 'addToPlaylist':
        return target ? { type, playlistId: target } : undefined;
      case 'addTag':
      case 'removeTag':
        return target ? { type, tagId: target } : undefined;
      case 'publish':
      case 'archive':
        return { type };
      default:
        return undefined;
    }
  }
  const action = build();

  /** Resolves in every case: a refusal is shown in the bar, with the item titles. */
  async function run(act: BulkAction) {
    setFailure(undefined);
    try {
      const { updated } = await bulk.mutateAsync({ ids: selectedIds, action: act });
      if (act.type === 'archive') {
        const ids = selectedIds;
        toast.show(mn.episodes.archivedMany(updated), {
          tone: 'success',
          action: {
            label: mn.episodes.undo,
            onClick: () =>
              unarchive.mutate(ids, {
                onSuccess: () => toast.show(mn.episodes.undone, { tone: 'success' }),
              }),
          },
        });
      } else {
        toast.show(t.done(updated), { tone: 'success' });
      }
      setType('');
      setTarget('');
      onDone();
    } catch (err) {
      const details =
        err instanceof ApiError ? (err.details as { ids?: unknown } | undefined) : undefined;
      const ids = Array.isArray(details?.ids)
        ? details.ids.filter((id): id is string => typeof id === 'string')
        : [];
      setFailure({ message: errorText(err), ids });
    }
  }

  function apply() {
    if (!action) return;
    if (action.type === 'publish' || action.type === 'archive') setConfirm(action.type);
    else void run(action);
  }

  return (
    <section className="admin-bulk" aria-label={t.region}>
      <div className="admin-bulk__row">
        <strong>{t.selected(selectedIds.length)}</strong>
        <SelectField
          label={t.action}
          value={type}
          onChange={(value) => {
            setType(value as BulkType | '');
            setTarget('');
            setFailure(undefined);
          }}
          options={[
            { value: '', label: t.choose },
            ...TYPES.map((value) => ({ value, label: t.types[value] })),
          ]}
        />
        {choices ? (
          <SelectField
            label={targetLabel}
            value={target}
            onChange={setTarget}
            options={[{ value: '', label: t.choose }, ...choices]}
          />
        ) : null}
        <Button loading={bulk.isPending} disabled={!action} onClick={apply}>
          {t.apply}
        </Button>
        <Button variant="ghost" onClick={onClear}>
          {t.clear}
        </Button>
      </div>
      {selectedIds.length >= BULK_MAX_IDS ? (
        <p className="admin-hint">{t.limit(BULK_MAX_IDS)}</p>
      ) : null}
      {failure ? (
        <Notice tone="danger">
          {failure.message}
          {failure.ids.length > 0 ? (
            <>
              {' '}
              {t.failedTitle}
              <ul className="admin-bulk__failed">
                {failure.ids.map((id) => (
                  <li key={id}>{titles[id] ?? t.unknownTitle}</li>
                ))}
              </ul>
            </>
          ) : null}
        </Notice>
      ) : null}
      <ConfirmDialog
        open={confirm === 'publish'}
        title={t.publishTitle(selectedIds.length)}
        text={t.publishText}
        confirmLabel={t.types.publish}
        onClose={() => setConfirm(null)}
        onConfirm={() => run({ type: 'publish' })}
      />
      <ConfirmDialog
        open={confirm === 'archive'}
        title={t.archiveTitle(selectedIds.length)}
        text={t.archiveText}
        confirmLabel={t.types.archive}
        tone="destructive"
        onClose={() => setConfirm(null)}
        onConfirm={() => run({ type: 'archive' })}
      />
    </section>
  );
}
