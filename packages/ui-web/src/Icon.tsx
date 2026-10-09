import { iconPaths, iconStrokeWidth, iconViewBox, type IconName } from '@ongod/tokens';
import { cx } from './cx';

export interface IconProps {
  name: IconName;
  size?: 'regular' | 'small';
  className?: string;
}

/** Decorative icon (aria-hidden). Put the accessible name on the button around it. */
export function Icon({ name, size = 'regular', className }: IconProps) {
  const { paths, filled } = iconPaths[name];
  return (
    <svg
      className={cx('ui-icon', `ui-icon--${size}`, className)}
      viewBox={`0 0 ${iconViewBox} ${iconViewBox}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={iconStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
