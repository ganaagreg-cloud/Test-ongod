import { cx } from './cx';
import { Cover } from './Cover';

/** Loading placeholder (lists never show spinners). Decorative, so hidden from screen readers. */
export function Skeleton({
  shape = 'text',
  width,
  className,
}: {
  shape?: 'text' | 'cover' | 'pill';
  /** Any CSS width, e.g. "60%". Height comes from the shape. */
  width?: string;
  className?: string;
}) {
  return (
    <span
      className={cx('ui-skeleton', `ui-skeleton--${shape}`, className)}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

/** Placeholder with the same layout as <EpisodeRow>. Mark the list `aria-busy` while loading. */
export function EpisodeRowSkeleton() {
  return (
    <div className="ui-episode-row ui-episode-row--skeleton" aria-hidden="true">
      <div className="ui-episode-row__main">
        <Cover className="ui-skeleton ui-episode-row__cover" />
        <span className="ui-episode-row__text">
          <Skeleton width="85%" />
          <Skeleton width="55%" />
        </span>
      </div>
    </div>
  );
}
