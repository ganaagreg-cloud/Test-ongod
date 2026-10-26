import type { MediaKind } from '@ongod/shared';
import { Icon } from '@ongod/ui-web';
import { useState } from 'react';

/**
 * An episode picture. A missing or broken one shows a brand-green tile with the media icon, never
 * the browser's broken-image icon. Give it `key={src}` so a new URL gets a new chance to load.
 */
export function Thumb({ src, kind }: { src: string | null; kind: MediaKind | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="admin-thumb admin-thumb--empty" aria-hidden="true">
        <Icon name={kind === 'VIDEO' ? 'video' : 'audio'} />
      </span>
    );
  }
  return (
    <img className="admin-thumb" src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}
