// Design assets drawn once and used by mobile (react-native-svg) and web (inline <svg>), so
// both platforms show the same shapes. Icons are 24x24, drawn with a 1.75 stroke.

export const iconViewBox = 24;
export const iconStrokeWidth = 1.75;

export type IconName =
  | 'bookmark'
  | 'bookmarkFilled'
  | 'chevronRight'
  | 'close'
  | 'check'
  | 'alert'
  | 'info'
  | 'play'
  | 'pause'
  | 'copy';

/** Path data per icon; `filled` icons are painted solid instead of stroked. */
export const iconPaths: Record<IconName, { paths: readonly string[]; filled?: true }> = {
  bookmark: { paths: ['M6.5 4h11a1 1 0 0 1 1 1v15.5L12 16.6 5.5 20.5V5a1 1 0 0 1 1-1z'] },
  bookmarkFilled: {
    paths: ['M6.5 4h11a1 1 0 0 1 1 1v15.5L12 16.6 5.5 20.5V5a1 1 0 0 1 1-1z'],
    filled: true,
  },
  chevronRight: { paths: ['M9.5 5l7 7-7 7'] },
  close: { paths: ['M6 6l12 12', 'M18 6L6 18'] },
  check: { paths: ['M5 12.5l4.5 4.5L19 7.5'] },
  alert: { paths: ['M12 3.8l9.2 16H2.8z', 'M12 10v4.4', 'M12 17.4v.01'] },
  info: { paths: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 11v5.5', 'M12 7.6v.01'] },
  play: { paths: ['M8 5.5v13l11-6.5z'], filled: true },
  pause: { paths: ['M8 5h2.6v14H8z', 'M13.4 5H16v14h-2.6z'], filled: true },
  copy: { paths: ['M9.5 9.5h10v10.5h-10z', 'M5 14.5V4.5h10'] },
};

/**
 * The single thin mountain-line motif (DESIGN.md "Motif"): empty states, auth screens and the
 * portal header only. One stroke, no fill. viewBox matches layout.motifWidth x motifHeight.
 */
export const mountainLine = {
  viewBox: '0 0 160 48',
  strokeWidth: 1.5,
  path: 'M2 42 L26 27 L38 34 L66 7 L86 30 L100 21 L124 38 L138 30 L158 43',
} as const;
