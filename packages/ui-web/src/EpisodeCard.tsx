import { Badge } from './Badge';
import { cx } from './cx';
import { Cover } from './Cover';

export interface EpisodeCardProps {
  title: string;
  /** "32 мин" */
  durationLabel: string;
  coverUrl?: string | null | undefined;
  onSelect?: (() => void) | undefined;
  className?: string;
}

/** Large card: the cover is the hero, the UI stays quiet. */
export function EpisodeCard({
  title,
  durationLabel,
  coverUrl,
  onSelect,
  className,
}: EpisodeCardProps) {
  const body = (
    <>
      <Cover url={coverUrl} className="ui-episode-card__cover" />
      <span className="ui-episode-card__title">{title}</span>
      <Badge>{durationLabel}</Badge>
    </>
  );
  return onSelect ? (
    <button type="button" className={cx('ui-episode-card', className)} onClick={onSelect}>
      {body}
    </button>
  ) : (
    <div className={cx('ui-episode-card', className)}>{body}</div>
  );
}
