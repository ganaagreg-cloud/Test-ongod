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
  onOpen,
  onAll,
}: {
  items: readonly EpisodeItem[];
  onOpen: (item: EpisodeItem) => void;
  onAll: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  if (items.length === 0) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={mn.player.next} action={{ label: mn.home.all, onPress: onAll }} />
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
            title={item.title}
            family={coverFamilyFor(item.id)}
            durationLabel={durationBadge(item)}
            progress={progressFraction(item)}
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
