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
  | 'chevronDown'
  | 'mail'
  | 'moon'
  | 'skipBack'
  | 'skipForward'
  | 'settings'
  | 'device'
  | 'doc'
  | 'logout'
  | 'audio'
  | 'video'
  | 'plus'
  | 'more'
  | 'filter'
  | 'trash'
  | 'edit'
  | 'eye';

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
    paths: [
      'M12 4.7a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6z',
      'M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4',
    ],
  },
  bell: { paths: ['M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0'] },
  search: { paths: ['M11 4.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z', 'M16 16l4 4'] },
  chevronLeft: { paths: ['M15 5l-7 7 7 7'] },
  // Player.dc.html: close the player, sleep timer, -15 / +30 (the number is drawn on top).
  chevronDown: { paths: ['M6 9l6 6 6-6'] },
  moon: { paths: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'] },
  skipBack: { paths: ['M4 12a8 8 0 1 0 2.6-5.9', 'M4 3.5v4h4'] },
  skipForward: { paths: ['M20 12a8 8 0 1 1-2.6-5.9', 'M20 3.5v4h-4'] },
  // Profile menu.
  settings: { paths: ['M4 7h9', 'M17 7h3', 'M15 5v4', 'M4 17h3', 'M11 17h9', 'M9 15v4'] },
  device: {
    paths: [
      'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 8 3z',
      'M11 18h2',
    ],
  },
  doc: { paths: ['M7 3h7l4 4v14H7z', 'M14 3v4h4', 'M9.5 12h5', 'M9.5 15.5h5'] },
  logout: { paths: ['M10 5H5v14h5', 'M14 8l4 4-4 4', 'M18 12H9'] },
  audio: { paths: ['M4 14v-2a8 8 0 0 1 16 0v2', 'M4 14h3.5v5.5H4z', 'M16.5 14H20v5.5h-3.5z'] },
  video: { paths: ['M3.5 6.5h12v11h-12z', 'M15.5 10.5l5-3v9l-5-3'] },
  plus: { paths: ['M12 5v14', 'M5 12h14'] },
  more: {
    paths: [
      'M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
      'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
      'M19 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
    ],
    filled: true,
  },
  filter: { paths: ['M4 6h16', 'M7 12h10', 'M10 18h4'] },
  trash: { paths: ['M5 7h14', 'M10 7V4.5h4V7', 'M6.5 7l1 13h9l1-13'] },
  edit: { paths: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'] },
  eye: {
    paths: [
      'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z',
      'M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
    ],
  },
  mail: {
    paths: [
      'M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z',
      'M4 7l8 6 8-6',
    ],
  },
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
