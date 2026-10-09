import { cx } from './cx';
import { Cover } from './Cover';
import { Icon } from './Icon';

export interface EpisodeRowProps {
  title: string;
  /** "category · duration" */
  meta: string;
  coverUrl?: string | null | undefined;
  /** Shown only for episodes that were started: value 0..1. */
  progress?: { value: number; label: string } | undefined;
  /** The saved bookmark; `label` names the action ("Хадгалах" / "Хадгалснаас хасах"). */
  save?: { saved: boolean; label: string; onToggle: () => void } | undefined;
  onSelect?: (() => void) | undefined;
  className?: string;
}

export function EpisodeRow({
  title,
  meta,
  coverUrl,
  progress,
  save,
  onSelect,
  className,
}: EpisodeRowProps) {
  const percent = progress ? Math.round(Math.min(1, Math.max(0, progress.value)) * 100) : 0;
  const body = (
    <>
      <Cover url={coverUrl} className="ui-episode-row__cover" />
      <span className="ui-episode-row__text">
        <span className="ui-episode-row__title">{title}</span>
        <span className="ui-episode-row__meta">{meta}</span>
        {progress && (
          <span
            className="ui-progress"
            role="progressbar"
            aria-label={progress.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <span className="ui-progress__bar" style={{ width: `${percent}%` }} />
          </span>
        )}
      </span>
    </>
  );
  return (
    <div className={cx('ui-episode-row', className)}>
      {onSelect ? (
        <button type="button" className="ui-episode-row__main" onClick={onSelect}>
          {body}
        </button>
      ) : (
        <div className="ui-episode-row__main">{body}</div>
      )}
      {save && (
        <button
          type="button"
          className={cx('ui-icon-button', save.saved && 'is-on')}
          aria-label={save.label}
          aria-pressed={save.saved}
          onClick={save.onToggle}
        >
          <Icon name={save.saved ? 'bookmarkFilled' : 'bookmark'} />
        </button>
      )}
    </div>
  );
}
