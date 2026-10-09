import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { layout, nativeTextStyle, radius, type ThemeColors } from '@ongod/tokens';
import { springs } from './motion';
import { useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export interface SegmentItem {
  id: string;
  label: string;
}

/** Equal-width options in a pill track; a thumb slides to the chosen one (spring.smooth). */
export function Segmented({
  items,
  value,
  onChange,
  label,
}: {
  items: readonly SegmentItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name of the group, e.g. "Эрэмбэ". */
  label: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const [trackWidth, setTrackWidth] = useState(0);
  const thumbWidth = items.length > 0 ? (trackWidth - 2 * layout.segmentPadding) / items.length : 0;
  const index = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );
  const x = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (thumbWidth <= 0) return;
    const target = index * thumbWidth;
    if (!placed.current) {
      x.value = target;
      placed.current = true;
    } else {
      x.value = withSpring(target, springs.smooth);
    }
  }, [index, thumbWidth, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      style={styles.track}
    >
      <Animated.View pointerEvents="none" style={[styles.thumb, { width: thumbWidth }, thumb]} />
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <PressableScale
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(item.id)}
            style={styles.option}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    track: {
      flexDirection: 'row',
      padding: layout.segmentPadding,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceSunken,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
    },
    thumb: {
      position: 'absolute',
      top: layout.segmentPadding,
      bottom: layout.segmentPadding,
      left: layout.segmentPadding,
      borderRadius: radius.pill,
      backgroundColor: c.textPrimary,
    },
    option: {
      flex: 1,
      minHeight: layout.touchTarget - 2 * layout.segmentPadding,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: c.textSecondary,
      ...nativeTextStyle('small'),
      fontFamily: nativeTextStyle('h1').fontFamily,
    },
    labelSelected: { color: c.bg },
  });
