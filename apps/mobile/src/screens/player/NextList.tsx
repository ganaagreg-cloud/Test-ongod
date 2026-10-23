import { StyleSheet, Text, View } from 'react-native';
import type { EpisodeItem } from '@ongod/shared';
import {
  layout,
  nativeFontFamily,
  nativeTextStyle,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { durationBadge, episodeMeta, progressFraction } from '../../lib/episode';
import { coverFamilyFor, EpisodeThumb, PressableScale, useThemedStyles } from '../../ui';
import { SectionHeader } from '../SectionHeader';

/** "Дараагийн": later episodes of the same category, 16:9 pictures (DESIGN "Player"). */
export function NextList({
  items,
  nextInSeries,
  onOpen,
  onAll,
  isItemLocked,
}: {
  items: readonly EpisodeItem[];
  /** The next part of the series this episode belongs to: shown first, before the list. */
  nextInSeries?: EpisodeItem | null | undefined;
  onOpen: (item: EpisodeItem) => void;
  onAll: () => void;
  /** Paid item without access: its picture is blurred. */
  isItemLocked?: (item: EpisodeItem) => boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  if (items.length === 0 && !nextInSeries) return null;
  const row = (item: EpisodeItem) => (
    <PressableScale
      key={item.id}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onOpen(item)}
      style={styles.row}
    >
      <EpisodeThumb
        variant="artwork"
        width={layout.nextThumbWidth}
        uri={item.coverUrl}
        title={item.title}
        family={coverFamilyFor(item.id)}
        durationLabel={durationBadge(item)}
        progress={progressFraction(item)}
        locked={isItemLocked?.(item) ?? false}
      />
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={styles.meta}>{episodeMeta(item)}</Text>
      </View>
    </PressableScale>
  );
  const later = items.filter((item) => item.id !== nextInSeries?.id);
  return (
    <View style={styles.section}>
      {nextInSeries ? (
        <>
          <SectionHeader title={mn.player.nextInSeries} />
          {row(nextInSeries)}
        </>
      ) : null}
      {later.length > 0 ? (
        <>
          <SectionHeader title={mn.player.next} action={{ label: mn.home.all, onPress: onAll }} />
          {later.map(row)}
        </>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: { gap: spacing.xs },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.xs,
    },
    text: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('caption') },
  });
