import type { ButtonHTMLAttributes } from 'react';
import type { IconName } from '@ongod/tokens';
import { cx } from './cx';
import { Icon } from './Icon';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: IconName;
  /** Required: an icon alone has no name for screen readers. */
  label: string;
}

/** Icon-only button with a 44 px touch target. */
export function IconButton({ icon, label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={cx('ui-icon-button', className)} aria-label={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}
