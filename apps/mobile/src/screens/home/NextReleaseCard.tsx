import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { NextRelease } from '@ongod/shared';
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
import { countdown, dayTile } from '../../lib/episode';
import { useSurface, useThemedStyles } from '../../ui';

/**
 * "Энэ 7 хоногт": the next scheduled episode with a live countdown (Home.dc.html). The "Сануулах"
 * bell waits for push notifications (ADR-0039).
 */
export function NextReleaseCard({ release }: { release: NextRelease }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const due = Date.parse(release.scheduledFor);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const tile = dayTile(release.scheduledFor);
  const left = countdown(due - now);
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`${release.title}. ${mn.home.opensIn(left)}`}
    >
      <LinearGradient
        colors={[colors.brand, colors.surfaceRaised]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.tile}>
        <Text style={styles.weekday}>{tile.weekday}</Text>
        <Text style={styles.day}>{tile.day}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {release.title}
        </Text>
        <Text style={styles.meta}>{release.category.name}</Text>
        <Text style={styles.countdown}>{mn.home.opensIn(left)}</Text>
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
      borderColor: withAlpha(c.accent, 0.18),
      overflow: 'hidden',
    },
    tile: {
      width: layout.dayTileWidth,
      height: layout.dayTileHeight,
      borderRadius: radius.thumb,
      backgroundColor: withAlpha(c.bg, 0.5),
      alignItems: 'center',
      justifyContent: 'center',
    },
    weekday: {
      color: c.accent,
      ...nativeTextStyle('caption'),
      fontFamily: nativeFontFamily.ui[600],
    },
    day: {
      color: c.textPrimary,
      ...nativeTextStyle('h1'),
      fontFamily: nativeFontFamily.display[600],
    },
    body: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('caption') },
    countdown: {
      color: c.textSecondary,
      ...nativeTextStyle('small'),
      fontVariant: ['tabular-nums'],
    },
  });
