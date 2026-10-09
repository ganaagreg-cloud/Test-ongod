import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  motion,
  nativeTextStyle,
  spacing,
  type IconName,
  type ThemeColors,
} from '@ongod/tokens';
import { Icon } from './Icon';
import { useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

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
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
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
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={value != null ? `${title}, ${value}` : title}
      onPress={onPress}
      scale={motion.pressScale}
      style={styles.row}
    >
      {content}
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: layout.touchTarget + spacing.xs,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    title: { flex: 1, ...nativeTextStyle('body') },
    value: { color: c.textSecondary, ...nativeTextStyle('small') },
  });
