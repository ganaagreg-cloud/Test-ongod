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
 * "Дараагийн": the item that comes next, then a few more of the category (ADR-0067), as rows
 * with a 16:9 picture; the title sits beside the picture, so the typographic cover does not repeat
 * it in the small tile. Tap plays one; "Бүгд" opens the full list (DESIGN "Player", ADR-0049).
 * `ofSeries`: the first row is the next part of the series ("Дараагийн хэсэг").
 */
export function NextList({
  items,
  ofSeries,
  onOpen,
  onAll,
  lockedOf,
}: {
  items: readonly EpisodeItem[];
  ofSeries: boolean;
  onOpen: (item: EpisodeItem) => void;
  onAll: () => void;
  /** Paid item without access: its picture is blurred. */
  lockedOf: (item: EpisodeItem) => boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <SectionHeader
        title={ofSeries ? mn.player.nextInSeries : mn.player.next}
        action={{ label: mn.home.all, onPress: onAll }}
      />
      {items.map((item) => (
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
            family={coverFamilyFor(item.id)}
            durationLabel={durationBadge(item)}
            progress={progressFraction(item)}
            locked={lockedOf(item)}
          />
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.meta}>{episodeMeta(item)}</Text>
          </View>
        </PressableScale>
      ))}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    section: { gap: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    text: { flex: 1, gap: spacing.xxs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('body'),
      fontFamily: nativeFontFamily.ui[600],
    },
    meta: { color: c.textSecondary, ...nativeTextStyle('caption') },
  });
