import { StyleSheet, Text, View } from 'react-native';
import { layout, nativeTextStyle, spacing, type ThemeColors } from '@ongod/tokens';
import { PressableScale, useThemedStyles } from '../ui';

/** A section title with an optional "Бүгд ›" link on the right (Home.dc.html). */
export function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void } | undefined;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {action ? (
        <PressableScale accessibilityRole="link" onPress={action.onPress} style={styles.link}>
          <Text style={styles.linkText}>{action.label} ›</Text>
        </PressableScale>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    title: { flex: 1, color: c.textPrimary, ...nativeTextStyle('h2') },
    link: { minHeight: layout.touchTarget, justifyContent: 'center' },
    linkText: { color: c.accentText, ...nativeTextStyle('small') },
  });
