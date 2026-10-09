import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, spacing } from '@ongod/tokens';
import { MountainLine } from './Icon';

/** Mountain-line motif + text + one action. For empty lists and calm error states. */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string | undefined;
  /** Usually one <Button>. */
  action?: ReactNode;
}) {
  return (
    <View style={styles.box}>
      <MountainLine />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.huge,
    paddingHorizontal: layout.screenPadding,
  },
  title: { color: colors.textPrimary, textAlign: 'center', ...nativeTextStyle('h2') },
  text: {
    maxWidth: layout.overlayMaxWidth,
    color: colors.textSecondary,
    textAlign: 'center',
    ...nativeTextStyle('body'),
  },
});
