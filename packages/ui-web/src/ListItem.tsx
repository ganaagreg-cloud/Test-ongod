import type { ReactNode } from 'react';
import type { IconName } from '@ongod/tokens';
import { cx } from './cx';
import { Icon } from './Icon';

export interface ListItemProps {
  title: string;
  /** Right-aligned value, e.g. the current username. */
  value?: ReactNode;
  icon?: IconName;
  tone?: 'default' | 'destructive';
  onSelect?: (() => void) | undefined;
  /** Renders a link instead of a button. */
  href?: string;
  className?: string;
}

/** Settings row. Navigable rows show a chevron. */
export function ListItem({
  title,
  value,
  icon,
  tone = 'default',
  onSelect,
  href,
  className,
}: ListItemProps) {
  const classes = cx('ui-list-item', tone === 'destructive' && 'is-destructive', className);
  const inner = (
    <>
      {icon && <Icon name={icon} />}
      <span className="ui-list-item__title">{title}</span>
      {value != null && <span className="ui-list-item__value">{value}</span>}
      {(onSelect || href) && tone !== 'destructive' && <Icon name="chevronRight" size="small" />}
    </>
  );
  if (href) {
    return (
      <a className={classes} href={href}>
        {inner}
      </a>
    );
  }
  if (onSelect) {
    return (
      <button type="button" className={classes} onClick={onSelect}>
        {inner}
      </button>
    );
  }
  return <div className={classes}>{inner}</div>;
}
