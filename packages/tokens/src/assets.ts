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
  | 'copy'
  | 'home'
  | 'library'
  | 'profile'
  | 'bell'
  | 'search'
  | 'chevronLeft'
  | 'mail';

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
  home: { paths: ['M4 10.5L12 4l8 6.5V20h-5v-6h-6v6H4z'] },
  library: { paths: ['M4 4h4v16H4z', 'M10 4h4v16h-4z', 'M15 5l3.5-1 3 15.5-3.5 1z'] },
  profile: {
    paths: ['M12 4.7a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z', 'M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4'],
  },
  bell: { paths: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'] },
  search: { paths: ['M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'M16 16l4 4'] },
  chevronLeft: { paths: ['M15 5l-7 7 7 7'] },
  mail: { paths: ['M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z', 'M4 7l8 6 8-6'] },
};

/**
 * The single thin mountain-line motif (DESIGN.md "Motif"): empty states, auth screens and the
 * portal header only. One stroke, no fill. viewBox matches layout.motifWidth x motifHeight.
 */
export const mountainLine = {
  viewBox: '0 0 160 48',
  strokeWidth: 1.6,
  /** Welcome mockup ridge (Main.dc.html). */
  path: 'M2 44 L30 22 L44 30 L70 6 L94 28 L110 18 L132 36 L158 44',
  /** Approximate path length, for the stroke-draw animation (dash = length, offset length -> 0). */
  length: 200,
} as const;
