import type { MediaKind } from '@ongod/shared';
import { Button, Notice } from '@ongod/ui-web';
import { useRef, useState } from 'react';
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
  // A signed link that has expired fails to play: ask for a new one once per click, then say so.
  const retried = useRef(false);
  const [playFailed, setPlayFailed] = useState(false);
  const start = () => {
    retried.current = false;
    setPlayFailed(false);
    preview.mutate();
  };
  const onError = () => {
    if (retried.current) {
      setPlayFailed(true);
      return;
    }
    retried.current = true;
    preview.mutate();
  };

  return (
    <div className="admin-preview">
      <div>
        <Button variant="secondary" loading={preview.isPending} onClick={start}>
          {t.button}
        </Button>
      </div>
      {kind === 'VIDEO' ? <p className="admin-hint">{t.videoNote}</p> : null}
      {playFailed ? <Notice tone="danger">{t.playFailed}</Notice> : null}
      {preview.error ? <Notice tone="danger">{errorText(preview.error)}</Notice> : null}
      {url && kind === 'AUDIO' ? (
        <audio
          className="admin-preview__media"
          controls
          preload="metadata"
          src={url}
          onError={onError}
        />
      ) : null}
      {url && kind === 'VIDEO' ? (
        <video
          className="admin-preview__media"
          controls
          preload="metadata"
          src={url}
          onError={onError}
        />
      ) : null}
      {url ? <p className="admin-hint">{t.expires}</p> : null}
    </div>
  );
}
