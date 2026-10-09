import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { layout, motion, radius } from '@ongod/tokens';
import { springs, useAmbientActive } from './motion';
import { useSurface } from './surface';

function Bar({ index, playing }: { index: number; playing: boolean }) {
  const { colors } = useSurface();
  const active = useAmbientActive();
  const scale = useSharedValue<number>(motion.equalizerMin);

  useEffect(() => {
    if (!playing || !active) {
      cancelAnimation(scale);
      scale.value = withSpring(motion.equalizerMin, springs.snappy);
      return;
    }
    scale.value = withDelay(
      motion.equalizerDelayMs[index]!,
      withRepeat(
        withTiming(1, {
          duration: motion.equalizerMs[index]! / 2,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        true,
      ),
    );
    return () => cancelAnimation(scale);
  }, [playing, active, index, scale]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: scale.value }] }));
  return <Animated.View style={[styles.bar, { backgroundColor: colors.accent }, style]} />;
}

/** Three gold bars that dance while audio plays and rest low when it is paused. Decorative. */
export function Equalizer({ playing }: { playing: boolean }) {
  return (
    <View style={styles.row} aria-hidden>
      {[0, 1, 2].map((i) => (
        <Bar key={i} index={i} playing={playing} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: layout.eqGap,
    height: layout.eqBarHeight,
  },
  bar: {
    width: layout.eqBarWidth,
    height: layout.eqBarHeight,
    borderRadius: radius.small,
    transformOrigin: 'bottom',
  },
});
