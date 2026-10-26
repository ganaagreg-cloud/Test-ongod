import type { AdminEpisodeDto } from '@ongod/shared';
import { IconButton, useToast } from '@ongod/ui-web';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useEpisodeActions, useUnarchive } from '../api/queries';
import { mn } from '../i18n/mn';
import { MediaPreview } from './MediaPreview';
import { Menu, MenuItem } from './Menu';
import { ConfirmDialog, Modal } from './Modal';

const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

/**
 * The icons at the right end of a list row: edit, preview and a ⋯ menu (duplicate, archive).
 * Nothing here reaches the row itself, so a click never also opens the edit page.
 */
export function EpisodeRowTools({ episode }: { episode: AdminEpisodeDto }) {
  const t = mn.episodes.row;
  const navigate = useNavigate();
  const toast = useToast();
  const { duplicate, transition } = useEpisodeActions(episode.id);
  const unarchive = useUnarchive();
  const [previewing, setPreviewing] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const canPreview = episode.media?.status === 'READY';
  // The server archives published items only.
  const canArchive = episode.status === 'PUBLISHED';

  return (
    <span className="admin-row-tools" onClick={stop} onKeyDown={stop}>
      <IconButton
        icon="edit"
        label={`${t.edit}: ${episode.title}`}
        title={t.edit}
        onClick={() => void navigate(`/episodes/${episode.id}`)}
      />
      <IconButton
        icon="eye"
        label={`${t.preview}: ${episode.title}`}
        title={canPreview ? t.preview : t.noPreview}
        disabled={!canPreview}
        onClick={() => setPreviewing(true)}
      />
      <Menu label={`${t.more}: ${episode.title}`}>
        {(close) => (
          <>
            <MenuItem
              disabled={duplicate.isPending}
              onClick={() => {
                close();
                duplicate.mutate(undefined, {
                  onSuccess: () => toast.show(mn.episodes.duplicate.done, { tone: 'success' }),
                });
              }}
            >
              {t.duplicate}
            </MenuItem>
            <MenuItem
              tone="danger"
              disabled={!canArchive}
              onClick={() => {
                close();
                setArchiving(true);
              }}
            >
              {t.archive}
            </MenuItem>
          </>
        )}
      </Menu>

      <Modal open={previewing} title={t.previewTitle} onClose={() => setPreviewing(false)}>
        {episode.media ? <MediaPreview episodeId={episode.id} kind={episode.media.kind} /> : null}
      </Modal>
      <ConfirmDialog
        open={archiving}
        title={mn.episodes.publish.archiveConfirmTitle}
        text={mn.episodes.publish.archiveConfirmText}
        confirmLabel={t.archive}
        tone="destructive"
        onConfirm={async () => {
          await transition.mutateAsync('archive');
          toast.show(mn.episodes.publish.archived, {
            tone: 'success',
            action: {
              label: mn.episodes.undo,
              onClick: () =>
                unarchive.mutate([episode.id], {
                  onSuccess: () => toast.show(mn.episodes.undone, { tone: 'success' }),
                }),
            },
          });
        }}
        onClose={() => setArchiving(false)}
      />
    </span>
  );
}
