import type { ReactNode } from 'react';
import { cx } from './cx';

/** `active` = the active-access badge (heritage); the others are status hues at 12% opacity. */
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'active';

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return <span className={cx('ui-badge', `ui-badge--${tone}`, className)}>{children}</span>;
}
