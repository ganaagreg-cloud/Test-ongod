import { mountainLine } from '@ongod/tokens';
import { cx } from './cx';

/** The single thin mountain-line motif: empty states, auth screens, portal header only. */
export function MountainLine({ className }: { className?: string }) {
  return (
    <svg
      className={cx('ui-motif', className)}
      viewBox={mountainLine.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={mountainLine.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={mountainLine.path} />
    </svg>
  );
}
