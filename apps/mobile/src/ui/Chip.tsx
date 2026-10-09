import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';

/** Filter pill: 36 pt tall with a 44 pt touch area (hitSlop). */
export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const slop = (layout.touchTarget - layout.chipHeight) / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={{ top: slop, bottom: slop }}
      style={[styles.chip, selected && styles.selected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.chipHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.heritage, borderColor: colors.heritage },
  label: { color: colors.textSecondary, ...nativeTextStyle('small') },
  labelSelected: { color: colors.textPrimary },
});
