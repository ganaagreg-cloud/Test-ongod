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

/** Web family names (Fontsource @font-face). */
export const fontFamily = {
  display: 'Lora',
  ui: 'Inter',
} as const;

export type FontRole = keyof typeof fontFamily;

/** Weights loaded per family. Web loads the same weights via Fontsource. */
export const fontWeights = {
  display: [400, 600],
  ui: [400, 500, 600],
} as const;

export type FontWeight<R extends FontRole = FontRole> = (typeof fontWeights)[R][number];

/**
 * Native family names, one per weight: Android does not synthesize weights from one family,
 * so React Native styles set fontFamily per weight and never set fontWeight.
 * Names match the keys loaded with expo-font from @expo-google-fonts.
 */
export const nativeFontFamily = {
  display: { 400: 'Lora_400Regular', 600: 'Lora_600SemiBold' },
  ui: { 400: 'Inter_400Regular', 500: 'Inter_500Medium', 600: 'Inter_600SemiBold' },
} as const satisfies { [R in FontRole]: Record<FontWeight<R>, string> };

/** fontSize / lineHeight in pt (px on web). Never go below caption. */
export const typeScale = {
  display: { font: 'display', weight: 600, fontSize: 32, lineHeight: 38 },
  h1: { font: 'ui', weight: 600, fontSize: 24, lineHeight: 30 },
  h2: { font: 'ui', weight: 600, fontSize: 20, lineHeight: 26 },
  body: { font: 'ui', weight: 400, fontSize: 16, lineHeight: 24 },
  small: { font: 'ui', weight: 400, fontSize: 14, lineHeight: 20 },
  caption: { font: 'ui', weight: 500, fontSize: 12, lineHeight: 16 },
} as const satisfies Record<
  string,
  { font: FontRole; weight: number; fontSize: number; lineHeight: number }
>;

export type TextStyleName = keyof typeof typeScale;

/** React Native text style for a type-scale entry (fontFamily per weight, no fontWeight). */
export function nativeTextStyle(name: TextStyleName) {
  const { font, weight, fontSize, lineHeight } = typeScale[name];
  const families: Record<number, string> = nativeFontFamily[font];
  return { fontFamily: families[weight]!, fontSize, lineHeight };
}

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

export const tokens = {
  colors,
  fontFamily,
  fontWeights,
  nativeFontFamily,
  typeScale,
  spacing,
  radius,
  motion,
  layout,
} as const;
export type Tokens = typeof tokens;
