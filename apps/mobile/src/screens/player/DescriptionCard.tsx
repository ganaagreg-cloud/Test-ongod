import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { Icon, PressableScale, useSurface, useThemedStyles } from '../../ui';

/** Lines shown while collapsed. */
const COLLAPSED_LINES = 3;

/** Collapsible "Тайлбар" (Player.dc.html). */
export function DescriptionCard({ text }: { text: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const [open, setOpen] = useState(false);
  const toggle = () => setOpen((v) => !v);
  return (
    <View style={styles.card}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={toggle}
        scale={1}
        style={styles.header}
      >
        <Text style={styles.title}>{mn.player.description}</Text>
        <View style={open && styles.flip}>
          <Icon name="chevronDown" size="small" color={colors.textPrimary} />
        </View>
      </PressableScale>
      <Text style={styles.text} numberOfLines={open ? undefined : COLLAPSED_LINES}>
        {text}
      </Text>
      <PressableScale accessibilityRole="button" onPress={toggle} style={styles.more}>
        <Text style={styles.moreText}>{open ? mn.player.less : mn.player.more}</Text>
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      padding: spacing.md,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surfaceRaised,
      gap: spacing.xs,
    },
    header: {
      minHeight: layout.touchTarget,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    flip: { transform: [{ rotate: '180deg' }] },
    text: { color: c.textSecondary, ...nativeTextStyle('body') },
    more: { minHeight: layout.touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
    moreText: {
      color: c.accentText,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
  });
