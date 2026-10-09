import { StyleSheet, Text } from 'react-native';
import { nativeFontFamily, nativeTextStyle, spacing, type CoverFamily, type ThemeColors } from '@ongod/tokens';
import { EpisodeThumb } from './EpisodeThumb';
import { useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

export interface EpisodeCardProps {
  title: string;
  /** "28:00" */
  durationLabel: string;
  coverUri?: string | null | undefined;
  number?: string | undefined;
  family?: CoverFamily;
  onPress?: (() => void) | undefined;
  /** Card width (horizontal lists); the picture is 16:9. */
  width?: number;
}

/** Card for horizontal lists ("Шинэ"): the 16:9 picture is the hero, the title sits under it. */
export function EpisodeCard({
  title,
  durationLabel,
  coverUri,
  number,
  family,
  onPress,
  width,
}: EpisodeCardProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${durationLabel}`}
      onPress={onPress}
      disabled={!onPress}
      style={[styles.card, width != null && { width }]}
    >
      <EpisodeThumb
        variant="artwork"
        uri={coverUri}
        title={title}
        number={number}
        durationLabel={durationLabel}
        {...(family && { family })}
      />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: { gap: spacing.xs },
    title: {
      color: c.textPrimary,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[500],
    },
  });
