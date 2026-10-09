import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

/** Filter pill. 36 px tall, with a 44 px hit area. */
export function Chip({
  selected = false,
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      className={cx('ui-chip', selected && 'is-selected', className)}
      aria-pressed={selected}
      {...rest}
    >
      {children}
    </button>
  );
}
