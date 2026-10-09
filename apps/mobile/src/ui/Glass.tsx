import type { ReactNode } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { elevation, glass, themes, withAlpha, type Surface } from '@ongod/tokens';
import { useSurface } from './surface';

/** Floating shadow (tab bar, mini player): Android uses `elevation`, the rest a box shadow. */
export const floatingShadow: ViewStyle =
  Platform.OS === 'android'
    ? { elevation: elevation.floating.androidElevation }
    : { boxShadow: elevation.floating.boxShadow };

/** The gold glow under the main play button. */
export const goldGlowShadow: ViewStyle = { boxShadow: elevation.goldGlow.boxShadow };

/**
 * Glass surface: blur + surfaceRaised at `opacity`. Android has no blur (DESIGN.md "Glass"):
 * surfaceRaised at 96% instead. `tone` forces a surface (the tab bar is always dark).
 */
export function Glass({
  opacity,
  tone,
  base: baseOverride,
  style,
  children,
}: {
  opacity: number;
  tone?: Surface;
  /** Tint color (#RRGGBB) instead of the surface's surfaceRaised. */
  base?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const ctx = useSurface();
  const surface = tone ?? ctx.surface;
  const base = baseOverride ?? themes[surface].surfaceRaised;

  if (Platform.OS === 'android') {
    return (
      <View
        style={[
          style,
          styles.clip,
          { backgroundColor: withAlpha(base, Math.max(opacity, glass.androidOpacity)) },
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <View style={[style, styles.clip]}>
      <BlurView
        intensity={glass.blurIntensity}
        tint={surface === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(base, opacity) }]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({ clip: { overflow: 'hidden' } });
