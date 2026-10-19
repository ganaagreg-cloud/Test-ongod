import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { formatDate } from '../../lib/format';
import type { AccessState } from '../../lib/episode';
import { useSurface, useThemedStyles } from '../../ui';

/**
 * The access card (DESIGN "Профайл"): a ring of the days left and "Идэвхтэй · 2027.10.08 хүртэл"
 * or "Идэвхгүй". Nothing about how to get access: that is the portal's job (ADR-0006).
 */
export function AccessCard({ access, until }: { access: AccessState; until: string | null }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const size = layout.accessRing;
  const stroke = layout.accessRingStroke;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <View style={styles.card}>
      <View style={styles.ring} aria-hidden>
        {/* The ring starts at 12 o'clock: the drawing is turned, not the SVG (web has no
            rotation props on SVG elements). */}
        <Svg width={size} height={size} style={styles.turn}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={withAlpha(colors.textPrimary, 0.12)}
            strokeWidth={stroke}
            fill="none"
          />
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={colors.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - access.fraction)}
          />
        </Svg>
        <Text style={styles.days}>{access.active ? access.daysLeft : '–'}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>{mn.profile.access}</Text>
        <Text style={[styles.state, !access.active && styles.inactive]}>
          {access.active && until
            ? mn.profile.accessActive(formatDate(until))
            : mn.profile.accessInactive}
        </Text>
        {access.active ? (
          <Text style={styles.left}>{mn.profile.daysLeft(access.daysLeft)}</Text>
        ) : null}
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: withAlpha(c.accent, 0.22),
      backgroundColor: c.brand,
    },
    ring: {
      width: layout.accessRing,
      height: layout.accessRing,
      alignItems: 'center',
      justifyContent: 'center',
    },
    turn: { transform: [{ rotate: '-90deg' }] },
    days: {
      position: 'absolute',
      color: c.textPrimary,
      ...nativeTextStyle('h2'),
      fontFamily: nativeFontFamily.display[600],
    },
    body: { flex: 1, gap: spacing.xxs },
    label: { color: c.accent, ...nativeTextStyle('caption'), fontFamily: nativeFontFamily.ui[600] },
    state: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    inactive: { color: c.textSecondary },
    left: { color: c.textSecondary, ...nativeTextStyle('small') },
  });
