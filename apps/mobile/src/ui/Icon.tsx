import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import {
  iconPaths,
  iconStrokeWidth,
  iconViewBox,
  layout,
  motion,
  mountainLine,
  type IconName,
} from '@ongod/tokens';
import { useSurface } from './surface';

// The SVG sits inside a View that is hidden from screen readers: View maps `aria-hidden` on both
// native and web, while react-native-svg would leak native-only props to the DOM on web.

/** Decorative icon: put the accessible name on the Pressable around it. */
export function Icon({
  name,
  size = 'regular',
  color,
}: {
  name: IconName;
  size?: 'regular' | 'small' | 'tab';
  color?: string;
}) {
  const { colors } = useSurface();
  const tint = color ?? colors.textPrimary;
  const { paths, filled } = iconPaths[name];
  const px =
    size === 'small' ? layout.iconSizeSmall : size === 'tab' ? layout.tabIconSize : layout.iconSize;
  return (
    <View aria-hidden>
      <Svg
        width={px}
        height={px}
        viewBox={`0 0 ${iconViewBox} ${iconViewBox}`}
        fill={filled ? tint : 'none'}
        stroke={filled ? 'none' : tint}
        strokeWidth={iconStrokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * The single thin mountain-line motif: empty states, auth screens. With `draw` it strokes itself
 * in (1.8 s, Welcome); reduce-motion shows it complete at once.
 */
export function MountainLine({ color, draw = false }: { color?: string; draw?: boolean }) {
  const { colors } = useSurface();
  const offset = useSharedValue(draw ? mountainLine.length : 0);

  useEffect(() => {
    if (!draw) return;
    offset.value = mountainLine.length;
    offset.value = withDelay(
      motion.drawDelayMs,
      withTiming(0, {
        duration: motion.drawMs,
        easing: Easing.bezier(0.65, 0, 0.35, 1),
        reduceMotion: ReduceMotion.System,
      }),
    );
    return () => cancelAnimation(offset);
  }, [draw, offset]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  return (
    <View aria-hidden>
      <Svg
        width={layout.motifWidth}
        height={layout.motifHeight}
        viewBox={mountainLine.viewBox}
        fill="none"
        stroke={color ?? colors.textTertiary}
        strokeWidth={mountainLine.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {draw ? (
          <AnimatedPath
            d={mountainLine.path}
            strokeDasharray={mountainLine.length}
            animatedProps={animatedProps}
          />
        ) : (
          <Path d={mountainLine.path} />
        )}
      </Svg>
    </View>
  );
}
