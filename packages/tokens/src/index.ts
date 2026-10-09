// Single source of truth for design tokens (docs/DESIGN.md, docs/design/DESIGN-v2-aurora.md).
// React Native imports these values directly; web uses the generated css/tokens.css.
export * from './assets';

/** `#RRGGBB` + alpha 0..1 -> `rgba(r,g,b,a)`. For scrims, glass and borders derived from a theme color. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Status badge background: the status hue at 12% opacity (text uses the solid color). */
const badgeBg = (hex: string) => withAlpha(hex, 0.12);

/** Dark forest theme (mobile listening screens, portal). Docs/DESIGN.md "Colors". */
const dark = {
  bg: '#021512',
  surface: '#041F1A',
  surfaceRaised: '#062A24',
  surfaceSunken: '#021512',
  skeleton: '#062A24',
  skeletonShine: 'rgba(243,239,230,0.07)',
  brand: '#053931',
  heritage: '#0B4A3F',
  onHeritage: '#F3EFE6',
  hairline: 'rgba(243,239,230,0.08)',
  hairlineStrong: 'rgba(243,239,230,0.22)',
  textPrimary: '#F3EFE6',
  textSecondary: '#A9B8B2',
  textTertiary: '#7F918B',
  accent: '#D4AF6A',
  accentPressed: '#B8934F',
  accentSoft: 'rgba(212,175,106,0.1)',
  accentText: '#D4AF6A',
  onAccent: '#14110A',
  primary: '#D4AF6A',
  onPrimary: '#14110A',
  glow: '#2FA88A',
  success: '#46A758',
  danger: '#E5484D',
  warning: '#E0A43B',
  info: '#6EA8FE',
  successBg: badgeBg('#46A758'),
  dangerBg: badgeBg('#E5484D'),
  warningBg: badgeBg('#E0A43B'),
  infoBg: badgeBg('#6EA8FE'),
  focusRing: '#D4AF6A',
  overlay: 'rgba(1,10,8,0.66)',
};

export type ThemeColors = Record<keyof typeof dark, string>;
export type ThemeName = 'dark' | 'light' | 'cream';

/** Light theme: admin only. Contrast ratios are against white unless noted. */
const light: ThemeColors = {
  bg: '#F6F4EF',
  surface: '#FFFFFF',
  surfaceRaised: '#FFFFFF',
  surfaceSunken: '#EEEBE4', // table header, input bg
  skeleton: '#EEEBE4',
  skeletonShine: 'rgba(255,255,255,0.7)',
  brand: '#053931',
  heritage: '#1F3B2E',
  onHeritage: '#FFFFFF',
  hairline: 'rgba(20,26,23,0.10)',
  hairlineStrong: 'rgba(20,26,23,0.22)',
  textPrimary: '#141A17', // 17.6:1
  textSecondary: '#4F5A54', // 7.2:1
  textTertiary: '#5F6862', // 5.2:1 on bg, 4.8:1 on surfaceSunken
  accent: '#D4AF6A', // backgrounds/highlights only, never text on white
  accentPressed: '#B8934F',
  accentSoft: 'rgba(138,106,43,0.1)',
  accentText: '#8A6A2B', // links/gold text, 5.0:1
  onAccent: '#14110A',
  primary: '#1F3B2E', // admin primary button bg = heritage
  onPrimary: '#FFFFFF', // 12.2:1
  glow: '#2FA88A',
  success: '#2E7D43', // 5.1:1
  danger: '#C42B31', // 5.6:1
  warning: '#8F5B00', // 5.7:1
  info: '#2B5FA8', // 6.4:1
  successBg: badgeBg('#2E7D43'),
  dangerBg: badgeBg('#C42B31'),
  warningBg: badgeBg('#8F5B00'),
  infoBg: badgeBg('#2B5FA8'),
  focusRing: '#2B5FA8',
  overlay: 'rgba(20,26,23,0.40)',
};

/**
 * Cream theme: browsing screens in the app (ADR-0028). Same keys as dark. Gold stays a FILL
 * (accent), never text or a thin icon on this surface; ink (brand) is the text and link color.
 * Contrast (src/themes.test.ts): ink 10.9:1, ink 2 6.0:1, textTertiary >= 4.5:1 on paper/card/sunken.
 */
const cream: ThemeColors = {
  bg: '#F1ECE1', // paper
  surface: '#FBF8F2', // card
  surfaceRaised: '#FBF8F2',
  surfaceSunken: '#E9E3D6', // segmented track
  skeleton: '#E5DED0',
  skeletonShine: 'rgba(255,255,255,0.7)',
  brand: '#053931',
  heritage: '#053931', // selected chip pill
  onHeritage: '#F1ECE1',
  hairline: 'rgba(5,57,49,0.12)',
  hairlineStrong: 'rgba(5,57,49,0.22)',
  textPrimary: '#053931', // ink
  textSecondary: '#3F5F58', // ink 2
  textTertiary: '#4D6B64',
  accent: '#D4AF6A',
  accentPressed: '#B8934F',
  accentSoft: 'rgba(5,57,49,0.08)',
  accentText: '#053931',
  onAccent: '#14110A',
  primary: '#053931',
  onPrimary: '#F1ECE1',
  glow: '#2FA88A',
  success: '#2E7D43',
  danger: '#C42B31',
  warning: '#8F5B00',
  info: '#2B5FA8',
  successBg: badgeBg('#2E7D43'),
  dangerBg: badgeBg('#C42B31'),
  warningBg: badgeBg('#8F5B00'),
  infoBg: badgeBg('#2B5FA8'),
  focusRing: '#053931', // forest focus ring
  overlay: 'rgba(5,57,49,0.45)',
};

/** Same keys in every theme, so components work on any surface. Dark is the default. */
export const themes: Record<ThemeName, ThemeColors> = { dark, light, cream };

/** The two app surfaces (admin's `light` is not one of them). */
export type Surface = 'dark' | 'cream';

/** Dark theme colors (mobile and portal). */
export const colors = dark;

/** Typographic placeholder covers (and the podcaster's template): [top-left, middle, bottom-right]. */
export const coverFamilies = {
  forest: ['#0D5A4C', '#053931', '#03231E'],
  teal: ['#155463', '#0A3540', '#041A20'],
  bronze: ['#4A3818', '#2A1F0D', '#140E05'],
  moss: ['#3A5A2A', '#1F3A17', '#0D1A09'],
  plum: ['#5A3A4A', '#33202B', '#170D13'],
} as const satisfies Record<string, readonly [string, string, string]>;

export type CoverFamily = keyof typeof coverFamilies;

/** Colors that are not part of a theme: the aurora's base blob. Gold + glow come from the theme. */
export const aurora = { blob: '#0A5446' } as const;

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
  hero: { font: 'display', weight: 600, fontSize: 52, lineHeight: 58 },
  display: { font: 'display', weight: 600, fontSize: 32, lineHeight: 38 },
  /** Category card name (Home.dc.html). */
  cardTitle: { font: 'display', weight: 600, fontSize: 19, lineHeight: 24 },
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
  /** Mini player cover. */
  mini: 10,
  card: 12,
  /** List thumbnails and code boxes. */
  thumb: 14,
  /** Cards, tiles, the mini player. */
  cardLarge: 18,
  /** Wide category cards. */
  category: 20,
  /** Hero carousel and the player picture. */
  hero: 22,
  /** Top corners of sheets. */
  sheet: 26,
  pill: 999,
} as const;

/**
 * Motion (ADR-0027). Springs for everything the user touches; durations only for loops and
 * fades. `durationMs`/`easing` are the legacy CSS values the portal still uses.
 */
export const motion = {
  durationMs: 200,
  easing: 'ease-out',
  /** cubic-bezier equivalent of CSS ease-out, for RN Animated/Reanimated. */
  easingBezier: [0, 0, 0.58, 1],

  /** Reanimated `withSpring` configs. */
  spring: {
    /** Press, toggles, icon bounce, save pop. */
    snappy: { damping: 18, stiffness: 260, mass: 0.8 },
    /** Chip pill, segmented thumb, tab pill, carousel, cover zoom. */
    smooth: { damping: 26, stiffness: 180, mass: 1 },
    /** Sheets (player, sleep timer, no-access). */
    sheet: { damping: 28, stiffness: 220, mass: 1 },
  },
  /** Section mount: fade + rise, staggered, at most `maxStagger` items then the rest at once. */
  enter: {
    rise: 16,
    staggerMs: 60,
    maxStagger: 8,
    reducedFadeMs: 150,
    /** FadeInDown.springify().damping(20) from the mockups. */
    spring: { damping: 20, stiffness: 100, mass: 1 },
  },
  /** Every Pressable; round icon buttons press deeper. */
  pressScale: 0.96,
  /** Wide cards (category card) press less deep. */
  pressScaleCard: 0.97,
  pressScaleRound: 0.92,
  /** Active tab icon, save icon: 1 -> iconBounce -> 1. */
  iconBounce: 1.12,
  shimmerMs: 1200,
  /** Primary CTA sheen (Welcome only). */
  sheenMs: 3200,
  sheenDelayMs: 1000,
  carouselAutoMs: 4800,
  /** Ken Burns: the active hero slide eases from `kenBurnsFrom` to 1. */
  kenBurnsFrom: 1.14,
  kenBurnsMs: 6000,
  /** Slow zoom of the player picture while playing. */
  kenBurnsPlayerTo: 1.08,
  kenBurnsPlayerMs: 18000,
  /** Category card photo zoom on press, and how far its chevron nudges right (pt). */
  coverZoom: 1.08,
  chevronNudge: 4,
  /** Aurora blob drift loops (ms), 12-19 s. */
  ambientMs: [14000, 17000, 19000],
  /** Mountain line draws itself. */
  drawMs: 1800,
  drawDelayMs: 200,
  /** Sheet: dismiss when dragged past this share of its height, or flung faster than flingVelocity. */
  sheetDismissShare: 0.3,
  flingVelocity: 800,
  /** Toast stays this long. */
  toastMs: 4000,
  /** Skeleton shown after a filter change. */
  skeletonHoldMs: 650,
  /** Equalizer bars: loop length per bar, start delay per bar, lowest scaleY. */
  equalizerMs: [900, 700, 1000],
  equalizerDelayMs: [0, 150, 300],
  equalizerMin: 0.25,
  /** Caret blink, one full cycle. */
  caretMs: 1000,
  /** Success wave: delay between boxes. */
  waveStaggerMs: 50,
  shakeMs: 60,
} as const;

/** Allowed shadows (DESIGN.md "Elevation"). CSS box-shadow strings; Android also gets `androidElevation`. */
export const elevation = {
  floating: { boxShadow: '0px 16px 40px rgba(0,0,0,0.45)', androidElevation: 8 },
  goldGlow: { boxShadow: '0px 8px 24px rgba(212,175,106,0.35)', androidElevation: 0 },
} as const;

/** Glass surfaces: surfaceRaised at this opacity over a blur (iOS/web). Android: no blur, androidOpacity. */
export const glass = {
  tabBar: 0.78,
  /** Tab bar over a cream screen: brand green at this opacity (Library.dc.html). */
  tabBarOnCream: 0.94,
  miniPlayer: 0.82,
  header: 0.72,
  blurIntensity: 40,
  androidOpacity: 0.96,
} as const;

/** width / height */
export const aspect = {
  artwork: 16 / 9,
  thumbnail: 4 / 3,
} as const;

export const layout = {
  screenPadding: 20,
  touchTarget: 44,
  buttonHeight: 52,
  inputHeight: 52,
  chipHeight: 36,
  tabBarHeight: 68,
  tabBarInset: 16,
  /** Gap between the tab bar and the bottom safe-area edge. */
  tabBarGap: 8,
  tabBarPadding: 6,
  miniPlayerGap: 8,
  miniPlayerHeight: 60,
  miniPlayerCover: 40,
  miniPlayerProgress: 2,
  episodeRowCover: 64,
  /** 4:3 list thumbnail (112 x 84). */
  thumbWidth: 112,
  coverRadius: 12,
  focusRingWidth: 2,
  /** Hairline borders (surface + hairline). */
  borderWidth: 1,
  iconSize: 24,
  iconSizeSmall: 16,
  /** Tab bar icons. */
  tabIconSize: 22,
  badgeHeight: 24,
  progressBarHeight: 3,
  sheetHandleWidth: 40,
  sheetHandleHeight: 4,
  /** Mountain-line motif (empty states, auth screens, portal header). */
  motifWidth: 160,
  motifHeight: 48,
  /** Widest a toast or sheet grows on large screens. */
  overlayMaxWidth: 480,
  /** Hero carousel dots and their touch row. */
  dotSize: 6,
  dotActiveWidth: 22,
  /** Category card: fixed height, 3 pt accent strip on the left edge. */
  categoryCardHeight: 104,
  categoryAccentStrip: 3,
  /** The round gold play button. */
  playButton: 52,
  /** Code input boxes. */
  codeBoxHeight: 58,
  codeCaretWidth: 2,
  codeCaretHeight: 24,
  /** Equalizer bars. */
  eqBarWidth: 3,
  eqBarHeight: 14,
  eqGap: 2,
  /** Padding between a segmented control's track and its thumb. */
  segmentPadding: 3,
  /** Switch. */
  switchWidth: 52,
  switchHeight: 32,
  switchKnob: 26,
  /** Collapsing Home header after this much scroll. */
  headerCollapseAt: 70,
  headerHeight: 96,
  /** Size of the aurora blobs (largest, medium, small). */
  auroraLarge: 420,
  auroraMedium: 300,
  auroraSmall: 260,
  /** Skeleton text line / duration badge. */
  durationBadgeHeight: 22,
} as const;

export const tokens = {
  themes,
  colors,
  coverFamilies,
  aurora,
  fontFamily,
  fontWeights,
  nativeFontFamily,
  typeScale,
  spacing,
  radius,
  motion,
  elevation,
  glass,
  aspect,
  layout,
} as const;
export type Tokens = typeof tokens;
