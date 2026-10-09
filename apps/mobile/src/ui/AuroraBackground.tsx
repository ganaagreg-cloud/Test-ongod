import { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { aurora, layout, motion, themes } from '@ongod/tokens';
import { useAmbientActive } from './motion';

type Blob = {
  /** Diameter, x/y of its corner as shares of the screen, color, opacity, drift (shares of diameter), loop ms. */
  size: number;
  x: number;
  y: number;
  color: string;
  opacity: number;
  dx: number;
  dy: number;
  grow: number;
  ms: number;
};

const dark = themes.dark;

/** Blob layouts copied from Main.dc.html (welcome) and Code.dc.html / Home.dc.html (soft). */
const VARIANTS: Record<'welcome' | 'player' | 'soft', Blob[]> = {
  welcome: [
    { size: layout.auroraLarge, x:-0.3, y:-0.07, color: aurora.blob, opacity: 0.9, dx: 0.1, dy: 0.07, grow: 0.15, ms: motion.ambientMs[0] },
    { size: layout.auroraMedium, x:0.7, y:0.21, color: dark.glow, opacity: 0.28, dx: -0.17, dy: -0.07, grow: -0.1, ms: motion.ambientMs[1] },
    { size: layout.auroraSmall, x:0.1, y:0.43, color: dark.accent, opacity: 0.14, dx: 0.08, dy: -0.15, grow: 0, ms: motion.ambientMs[2] },
  ],
  player: [
    { size: layout.auroraLarge, x:-0.2, y:-0.12, color: aurora.blob, opacity: 0.6, dx: 0.08, dy: 0.06, grow: 0.12, ms: motion.ambientMs[0] },
    { size: layout.auroraSmall, x:0.6, y:0.12, color: dark.glow, opacity: 0.2, dx: -0.12, dy: 0.05, grow: -0.08, ms: motion.ambientMs[1] },
  ],
  soft: [
    { size: layout.auroraLarge, x:-0.3, y:-0.4, color: aurora.blob, opacity: 0.6, dx: 0, dy: 0, grow: 0, ms: 0 },
  ],
};

function BlobView({ blob, id, width, height }: { blob: Blob; id: string; width: number; height: number }) {
  const active = useAmbientActive();
  const t = useSharedValue(0);

  useEffect(() => {
    if (!active || blob.ms === 0) {
      cancelAnimation(t);
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withTiming(1, {
        duration: blob.ms / 2,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      true,
    );
    return () => cancelAnimation(t);
  }, [active, blob.ms, t]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: t.value * blob.dx * blob.size },
      { translateY: t.value * blob.dy * blob.size },
      { scale: 1 + t.value * blob.grow },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.blob,
        { left: blob.x * width, top: blob.y * height, width: blob.size, height: blob.size },
        style,
      ]}
    >
      <Svg width={blob.size} height={blob.size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity={blob.opacity} />
            <Stop offset="0.45" stopColor={blob.color} stopOpacity={blob.opacity * 0.65} />
            <Stop offset="1" stopColor={blob.color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={blob.size} height={blob.size} fill={`url(#${id})`} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Soft green light behind a screen: blurred-looking blobs (radial gradients) that drift slowly.
 * `welcome` and `player` drift (12-19 s loops, stopped by reduce-motion and in the background);
 * `soft` is a still glow in the top corner. Fills its parent; always dark.
 */
export function AuroraBackground({ variant = 'welcome' }: { variant?: 'welcome' | 'player' | 'soft' }) {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: dark.bg }]} aria-hidden>
      {VARIANTS[variant].map((blob, i) => (
        <BlobView key={`${variant}-${i}`} blob={blob} id={`aurora-${variant}-${i}`} width={width} height={height} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ blob: { position: 'absolute' } });
