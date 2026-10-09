import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { Badge } from './Badge';
import { Cover } from './Cover';

export interface EpisodeCardProps {
  title: string;
  /** "32 мин" */
  durationLabel: string;
  coverUri?: string | null | undefined;
  onPress?: (() => void) | undefined;
  /** Card width; the cover is square. */
  width?: number;
}

/** Large card: the cover is the hero, the UI stays quiet. */
export function EpisodeCard({ title, durationLabel, coverUri, onPress, width }: EpisodeCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${durationLabel}`}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, width != null && { width }]}
    >
      <Cover uri={coverUri} />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      <Badge label={durationLabel} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  title: {
    color: colors.textPrimary,
    ...nativeTextStyle('body'),
    fontFamily: nativeTextStyle('h1').fontFamily,
  },
});
