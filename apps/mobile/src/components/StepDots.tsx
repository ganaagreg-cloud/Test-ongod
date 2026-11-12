import { StyleSheet, Text, View } from 'react-native';
import { layout, nativeTextStyle, radius, spacing, type ThemeColors } from '@ongod/tokens';
import { useThemedStyles } from '../ui';

/** "Алхам 2/3" and one dot per step, the current one wide (the intro pages' dots, ADR-0088). */
export function StepDots({ step, total, label }: { step: number; total: number; label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 1, max: total, now: step }}
    >
      <View style={styles.dots}>
        {Array.from({ length: total }, (_, i) => (
          <View
            key={i}
            style={[styles.dot, i + 1 === step && styles.current, i + 1 < step && styles.done]}
          />
        ))}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    dots: { flexDirection: 'row', gap: spacing.xs },
    dot: {
      width: layout.dotSize,
      height: layout.dotSize,
      borderRadius: radius.pill,
      backgroundColor: c.hairlineStrong,
    },
    current: { width: layout.dotActiveWidth, backgroundColor: c.accent },
    done: { backgroundColor: c.accent },
    label: { color: c.textSecondary, ...nativeTextStyle('caption') },
  });
