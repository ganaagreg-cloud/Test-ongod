// Single source of truth for design tokens (docs/DESIGN.md).
// React Native imports these values directly; web uses the generated css/tokens.css.

export const colors = {
  bg: '#0A0E0C',
  surface: '#121815',
  surfaceRaised: '#1A221E',
  hairline: 'rgba(243,239,230,0.08)',
  textPrimary: '#F3EFE6',
  textSecondary: '#A7AFA9',
  textTertiary: '#6E7771',
  accent: '#D4AF6A',
  accentPressed: '#B8934F',
  onAccent: '#14110A',
  heritage: '#1F3B2E',
  success: '#46A758',
  danger: '#E5484D',
  overlay: 'rgba(10,14,12,0.72)',
} as const;

export const fontFamily = {
  display: 'Lora',
  ui: 'Inter',
} as const;

/** fontSize / lineHeight in pt (px on web). Never go below caption. */
export const typeScale = {
  display: { fontSize: 32, lineHeight: 38 },
  h1: { fontSize: 24, lineHeight: 30 },
  h2: { fontSize: 20, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const;

/** 4 pt grid. */
export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  huge: 56,
} as const;

export const radius = {
  small: 8,
  card: 12,
  sheet: 20,
  pill: 999,
} as const;

export const motion = {
  durationMs: 200,
  easing: 'ease-out',
  /** cubic-bezier equivalent of CSS ease-out, for RN Animated/Reanimated. */
  easingBezier: [0, 0, 0.58, 1],
} as const;

export const layout = {
  screenPadding: 20,
  touchTarget: 44,
  buttonHeight: 52,
  inputHeight: 52,
  chipHeight: 36,
  tabBarHeight: 64,
  tabBarInset: 16,
  tabBarBgOpacity: 0.92,
  miniPlayerGap: 8,
  miniPlayerCover: 40,
  episodeRowCover: 64,
  coverRadius: 12,
} as const;

export const tokens = { colors, fontFamily, typeScale, spacing, radius, motion, layout } as const;
export type Tokens = typeof tokens;
