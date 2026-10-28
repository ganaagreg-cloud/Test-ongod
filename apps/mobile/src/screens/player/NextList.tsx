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

/**
 * "Дараагийн": the one item that comes next, 16:9 picture, tap plays it; "Бүгд" opens the full list
 * (DESIGN "Player", ADR-0049). `ofSeries`: it is the next part of the series ("Дараагийн хэсэг").
 */
export function NextList({
  item,
  ofSeries,
  onOpen,
  onAll,
  locked,
}: {
  item: EpisodeItem;
  ofSeries: boolean;
  onOpen: (item: EpisodeItem) => void;
  onAll: () => void;
  /** Paid item without access: its picture is blurred. */
  locked: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <SectionHeader
        title={ofSeries ? mn.player.nextInSeries : mn.player.next}
        action={{ label: mn.home.all, onPress: onAll }}
      />
      <PressableScale
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
          locked={locked}
        />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.meta}>{episodeMeta(item)}</Text>
        </View>
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: { gap: spacing.xxs },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    text: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('caption') },
  });
