import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, spacing, type IconName } from '@ongod/tokens';
import { Icon } from './Icon';

export interface ListItemProps {
  title: string;
  /** Right-aligned value, e.g. the current username. */
  value?: string;
  icon?: IconName;
  tone?: 'default' | 'destructive';
  onPress?: (() => void) | undefined;
}

/** Settings row. Navigable rows show a chevron. */
export function ListItem({ title, value, icon, tone = 'default', onPress }: ListItemProps) {
  const destructive = tone === 'destructive';
  const color = destructive ? colors.danger : colors.textPrimary;
  const content = (
    <>
      {icon ? <Icon name={icon} color={color} /> : null}
      <Text style={[styles.title, { color }]}>{title}</Text>
      {value != null ? <Text style={styles.value}>{value}</Text> : null}
      {onPress && !destructive ? (
        <Icon name="chevronRight" size="small" color={colors.textTertiary} />
      ) : null}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value != null ? `${title}, ${value}` : title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.touchTarget + spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: layout.borderWidth,
    borderBottomColor: colors.hairline,
  },
  pressed: { backgroundColor: colors.surfaceRaised },
  title: { flex: 1, ...nativeTextStyle('body') },
  value: { color: colors.textSecondary, ...nativeTextStyle('small') },
});
