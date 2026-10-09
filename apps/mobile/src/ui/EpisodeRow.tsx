import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { Cover } from './Cover';
import { Icon } from './Icon';

export interface EpisodeRowProps {
  title: string;
  /** "category · duration" */
  meta: string;
  coverUri?: string | null | undefined;
  /** Shown only for episodes that were started: value 0..1. */
  progress?: { value: number; label: string } | undefined;
  /** The saved bookmark; `label` names the action ("Хадгалах" / "Хадгалснаас хасах"). */
  save?: { saved: boolean; label: string; onToggle: () => void } | undefined;
  onPress?: (() => void) | undefined;
}

export function EpisodeRow({ title, meta, coverUri, progress, save, onPress }: EpisodeRowProps) {
  const percent = progress ? Math.round(Math.min(1, Math.max(0, progress.value)) * 100) : 0;
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${meta}`}
        onPress={onPress}
        disabled={!onPress}
        style={styles.main}
      >
        <Cover uri={coverUri} style={styles.cover} />
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.meta}>{meta}</Text>
          {progress ? (
            <View
              style={styles.track}
              accessibilityRole="progressbar"
              accessibilityLabel={progress.label}
              accessibilityValue={{ min: 0, max: 100, now: percent }}
            >
              <View style={[styles.bar, { width: `${percent}%` }]} />
            </View>
          ) : null}
        </View>
      </Pressable>
      {save ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={save.label}
          accessibilityState={{ selected: save.saved }}
          onPress={save.onToggle}
          style={styles.save}
        >
          <Icon
            name={save.saved ? 'bookmarkFilled' : 'bookmark'}
            color={save.saved ? colors.accent : colors.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  cover: { width: layout.episodeRowCover },
  text: { flex: 1, gap: spacing.xxs },
  title: {
    color: colors.textPrimary,
    ...nativeTextStyle('body'),
    fontFamily: nativeTextStyle('h1').fontFamily,
  },
  meta: { color: colors.textSecondary, ...nativeTextStyle('small') },
  track: {
    height: layout.progressBarHeight,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  bar: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.accent },
  save: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
