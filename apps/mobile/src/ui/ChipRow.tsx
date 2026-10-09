import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { layout, nativeTextStyle, radius, spacing, type ThemeColors } from '@ongod/tokens';
import { springs } from './motion';
import { useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export interface ChipItem {
  id: string;
  label: string;
}

/**
 * Filter pills in a horizontal row. The selected look is ONE pill that slides (and resizes) to
 * the chosen chip with spring.smooth. Each chip is 36 pt with a 44 pt touch area.
 */
export function ChipRow({
  items,
  value,
  onChange,
}: {
  items: readonly ChipItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const slop = (layout.touchTarget - layout.chipHeight) / 2;
  const [boxes, setBoxes] = useState<Record<string, { x: number; w: number }>>({});
  const x = useSharedValue(0);
  const w = useSharedValue(0);
  const placed = useRef(false);

  const box = boxes[value];
  useEffect(() => {
    if (!box) return;
    if (!placed.current) {
      // First measurement: put the pill there without a slide.
      x.value = box.x;
      w.value = box.w;
      placed.current = true;
      return;
    }
    x.value = withSpring(box.x, springs.smooth);
    w.value = withSpring(box.w, springs.smooth);
  }, [box, x, w]);

  const pill = useAnimatedStyle(() => ({
    opacity: w.value > 0 ? 1 : 0,
    width: w.value,
    transform: [{ translateX: x.value }],
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      accessibilityRole="tablist"
    >
      <View style={styles.row}>
        <Animated.View pointerEvents="none" style={[styles.pill, pill]} />
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <PressableScale
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              hitSlop={{ top: slop, bottom: slop }}
              onPress={() => onChange(item.id)}
              onLayout={(e) => {
                const { x: left, width } = e.nativeEvent.layout;
                setBoxes((prev) =>
                  prev[item.id]?.x === left && prev[item.id]?.w === width
                    ? prev
                    : { ...prev, [item.id]: { x: left, w: width } },
                );
              }}
              style={[styles.chip, !selected && styles.outline]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>{item.label}</Text>
            </PressableScale>
          );
        })}
      </View>
    </ScrollView>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    scroll: { paddingHorizontal: layout.screenPadding },
    row: { flexDirection: 'row', gap: spacing.xs },
    pill: {
      position: 'absolute',
      top: 0,
      left: 0,
      height: layout.chipHeight,
      borderRadius: radius.pill,
      backgroundColor: c.heritage,
    },
    chip: {
      height: layout.chipHeight,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outline: { borderWidth: layout.borderWidth, borderColor: c.hairlineStrong },
    label: { color: c.textSecondary, ...nativeTextStyle('small') },
    labelSelected: { color: c.onHeritage },
  });
