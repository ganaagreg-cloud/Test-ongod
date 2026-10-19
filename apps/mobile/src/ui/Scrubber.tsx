import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { layout, radius, type ThemeColors } from '@ongod/tokens';
import { springs } from './motion';
import { useThemedStyles } from './surface';

/** How far one screen-reader swipe moves (seconds). */
const A11Y_STEP_SEC = 15;
/** The thumb grows while dragged (Player.dc.html: scale 1.5). */
const THUMB_ACTIVE_SCALE = 1.5;

/**
 * The player's position bar: tap or drag to seek; the gold fill and thumb follow the finger and
 * the seek happens on release. Screen readers get an adjustable control (±15 s per swipe).
 */
export function Scrubber({
  positionSec,
  durationSec,
  onSeek,
  disabled = false,
  label,
  valueText,
}: {
  positionSec: number;
  durationSec: number;
  onSeek: (positionSec: number) => void;
  disabled?: boolean;
  /** Accessible name, e.g. "Байрлал". */
  label: string;
  /** Spoken value, e.g. "12:04". */
  valueText: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const fraction = durationSec > 0 ? Math.min(1, Math.max(0, positionSec / durationSec)) : 0;
  const width = useSharedValue(0);
  const shown = useSharedValue(fraction);
  const dragging = useSharedValue(false);

  useEffect(() => {
    if (!dragging.get()) shown.set(fraction);
  }, [fraction, dragging, shown]);

  const seekToFraction = (f: number) => onSeek(f * durationSec);

  const pan = Gesture.Pan()
    .enabled(!disabled && durationSec > 0)
    .minDistance(0)
    .onBegin((e) => {
      const w = width.get();
      if (w <= 0) return;
      dragging.set(true);
      shown.set(Math.min(1, Math.max(0, e.x / w)));
    })
    .onUpdate((e) => {
      const w = width.get();
      if (w <= 0) return;
      shown.set(Math.min(1, Math.max(0, e.x / w)));
    })
    .onEnd(() => {
      scheduleOnRN(seekToFraction, shown.get());
    })
    .onFinalize(() => {
      dragging.set(false);
    });

  const fill = useAnimatedStyle(() => ({ transform: [{ scaleX: shown.value }] }));
  const thumb = useAnimatedStyle(() => ({
    transform: [
      { translateX: shown.value * width.value - layout.scrubberThumb / 2 },
      { scale: withSpring(dragging.value ? THUMB_ACTIVE_SCALE : 1, springs.snappy) },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          if (disabled || durationSec <= 0) return;
          const step = e.nativeEvent.actionName === 'increment' ? A11Y_STEP_SEC : -A11Y_STEP_SEC;
          onSeek(Math.min(durationSec, Math.max(0, positionSec + step)));
        }}
        style={styles.hit}
        onLayout={(e) => {
          width.set(e.nativeEvent.layout.width);
        }}
      >
        <View style={styles.track}>
          <Animated.View style={[styles.fill, fill]} />
        </View>
        <Animated.View style={[styles.thumb, disabled && styles.thumbOff, thumb]} />
      </View>
    </GestureDetector>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    hit: { height: layout.touchTarget, justifyContent: 'center' },
    track: {
      height: layout.scrubberTrack,
      borderRadius: radius.pill,
      backgroundColor: c.hairlineStrong,
      overflow: 'hidden',
    },
    fill: { ...StyleSheet.absoluteFill, backgroundColor: c.accent, transformOrigin: 'left' },
    thumb: {
      position: 'absolute',
      left: 0,
      width: layout.scrubberThumb,
      height: layout.scrubberThumb,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
    },
    thumbOff: { opacity: 0 },
  });
