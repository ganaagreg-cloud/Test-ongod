import { cx } from './cx';

/** Square 1:1 cover, radius 12. Decorative: the title is always next to it. */
export function Cover({ url, className }: { url?: string | null | undefined; className?: string }) {
  return (
    <span className={cx('ui-cover', className)}>
      {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : null}
    </span>
  );
}
