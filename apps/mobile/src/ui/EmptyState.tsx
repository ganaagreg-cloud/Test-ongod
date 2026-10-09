import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { layout, nativeTextStyle, spacing, type ThemeColors } from '@ongod/tokens';
import { MountainLine } from './Icon';
import { useEnterStyle } from './motion';
import { useThemedStyles } from './surface';

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
  const styles = useThemedStyles(makeStyles);
  const enter = useEnterStyle(0);
  return (
    <Animated.View style={[styles.box, enter]}>
      <MountainLine draw />
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {action}
    </Animated.View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: {
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.huge,
      paddingHorizontal: layout.screenPadding,
    },
    title: { color: c.textPrimary, textAlign: 'center', ...nativeTextStyle('h2') },
    text: {
      maxWidth: layout.overlayMaxWidth,
      color: c.textSecondary,
      textAlign: 'center',
      ...nativeTextStyle('body'),
    },
  });
