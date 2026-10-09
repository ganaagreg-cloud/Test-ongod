import type { ReactNode } from 'react';
import { cx } from './cx';
import { MountainLine } from './MountainLine';

export interface EmptyStateProps {
  title: string;
  text?: string | undefined;
  /** Usually one <Button>. */
  action?: ReactNode;
  className?: string;
}

/** Mountain-line motif + text + one action. For empty lists and calm error states. */
export function EmptyState({ title, text, action, className }: EmptyStateProps) {
  return (
    <div className={cx('ui-empty', className)}>
      <MountainLine />
      <h2 className="ui-empty__title">{title}</h2>
      {text && <p className="ui-empty__text">{text}</p>}
      {action}
    </div>
  );
}
