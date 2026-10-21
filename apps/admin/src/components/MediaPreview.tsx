import type { MediaKind } from '@ongod/shared';
import { Button, Notice } from '@ongod/ui-web';
import { useEpisodeActions } from '../api/queries';
import { mn } from '../i18n/mn';
import { errorText } from './Modal';

interface MediaPreviewProps {
  episodeId: string;
  kind: MediaKind;
}

/**
 * Plays the episode's file before it is published, through a short-lived signed link. There is no
 * HLS player in the admin: a video (HLS) plays in a native <video>, which Safari does natively and
 * other browsers may not, so the screen says so.
 */
export function MediaPreview({ episodeId, kind }: MediaPreviewProps) {
  const t = mn.episodes.preview;
  const { preview } = useEpisodeActions(episodeId);
  const url = preview.data?.url;

  return (
    <div className="admin-preview">
      <div>
        <Button variant="secondary" loading={preview.isPending} onClick={() => preview.mutate()}>
          {t.button}
        </Button>
      </div>
      {kind === 'VIDEO' ? <p className="admin-hint">{t.videoNote}</p> : null}
      {preview.error ? <Notice tone="danger">{errorText(preview.error)}</Notice> : null}
      {url && kind === 'AUDIO' ? (
        <audio className="admin-preview__media" controls preload="metadata" src={url} />
      ) : null}
      {url && kind === 'VIDEO' ? (
        <video className="admin-preview__media" controls preload="metadata" src={url} />
      ) : null}
      {url ? <p className="admin-hint">{t.expires}</p> : null}
    </div>
  );
}
