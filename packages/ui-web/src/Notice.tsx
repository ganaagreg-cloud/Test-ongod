import type { ReactNode } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';

const ICON = { info: 'info', success: 'check', warning: 'alert', danger: 'alert' } as const;

/**
 * Inline message inside a page or form (errors from the server, "no password yet", etc.).
 * Danger and warning are announced at once (role=alert); the others politely (role=status).
 */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: NoticeTone;
  title?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx('ui-notice', `ui-notice--${tone}`, className)}
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
    >
      <Icon name={ICON[tone]} />
      <div className="ui-notice__body">
        {title ? <p className="ui-notice__title">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}
