import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { layout, radius, spacing, type CoverFamily } from '@ongod/tokens';
import { Artwork, useAmbientActive } from '../ui';

// Welcome.dc.html: three rows of cover tiles drifting sideways, the whole block tilted -8 degrees.
// The tiles are typographic placeholders (episode number on a cover family): the mockup's sample
// episode titles are not real content, so none are shipped.
type Row = {
  numbers: readonly number[];
  families: readonly CoverFamily[];
  /** One full loop, in ms. */
  ms: number;
  /** Moves right instead of left. */
  reverse: boolean;
  /** Shift of the row start (shares of one tile). */
  shift: number;
  /** The top row is faint so the rows seem to rise out of the dark (the mockup masks them). */
  opacity: number;
};

const ROWS: readonly Row[] = [
  {
    numbers: [1, 14, 22, 31, 40, 52],
    families: ['forest', 'bronze', 'teal', 'moss', 'plum', 'forest'],
    ms: 48000,
    reverse: false,
    shift: 0,
    opacity: 0.4,
  },
  {
    numbers: [8, 17, 26, 33, 45, 58],
    families: ['teal', 'bronze', 'forest', 'plum', 'moss', 'teal'],
    ms: 56000,
    reverse: true,
    shift: -0.36,
    opacity: 0.85,
  },
  {
    numbers: [3, 19, 27, 36, 49, 61],
    families: ['moss', 'forest', 'bronze', 'teal', 'plum', 'forest'],
    ms: 64000,
    reverse: false,
    shift: -0.8,
    opacity: 1,
  },
];

const TILE = layout.marqueeTile;
const STEP = TILE + spacing.sm;

function MarqueeRow({ row }: { row: Row }) {
  const active = useAmbientActive();
  const half = row.numbers.length * STEP;
  const x = useSharedValue(row.reverse ? -half : 0);

  useEffect(() => {
    if (!active) {
      cancelAnimation(x);
      return;
    }
    x.value = row.reverse ? -half : 0;
    x.value = withRepeat(
      withTiming(row.reverse ? 0 : -half, {
        duration: row.ms,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
    );
    return () => cancelAnimation(x);
  }, [active, half, row.ms, row.reverse, x]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <Animated.View
      style={[
        styles.row,
        { width: half * 2, marginLeft: row.shift * TILE, opacity: row.opacity },
        style,
      ]}
    >
      {[0, 1].flatMap((copy) =>
        row.numbers.map((n, i) => (
          <View key={`${copy}-${n}`} style={styles.tile}>
            <Artwork number={`№ ${String(n).padStart(3, '0')}`} family={row.families[i]!} />
          </View>
        )),
      )}
    </Animated.View>
  );
}

/** Decorative, hidden from screen readers. */
export function CoverMarquee() {
  return (
    <View pointerEvents="none" style={styles.block} aria-hidden>
      {ROWS.map((row, i) => (
        <MarqueeRow key={i} row={row} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    position: 'absolute',
    top: layout.marqueeTop,
    left: -layout.marqueeBleed,
    right: -layout.marqueeBleed,
    gap: spacing.sm,
    transform: [{ rotate: '-8deg' }],
  },
  row: { flexDirection: 'row', gap: spacing.sm },
  tile: { width: TILE, height: TILE, borderRadius: radius.thumb, overflow: 'hidden' },
});
