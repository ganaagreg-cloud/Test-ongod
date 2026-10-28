import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { PressableScale, useThemedStyles } from '../../ui';

/** Lines shown while collapsed. */
const COLLAPSED_LINES = 2;

/** "Тайлбар": plain text, two lines, "Цааш унших" opens it (ADR-0049). */
export function DescriptionText({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.root}>
      <Text style={styles.title} accessibilityRole="header">
        {mn.player.description}
      </Text>
      <Text style={styles.text} numberOfLines={open ? undefined : COLLAPSED_LINES}>
        {text}
      </Text>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.more}
      >
        <Text style={styles.moreText}>{open ? mn.player.less : mn.player.more}</Text>
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
    text: { color: c.textSecondary, ...nativeTextStyle('body') },
    more: { minHeight: layout.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
    moreText: {
      color: c.accentText,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
  });
