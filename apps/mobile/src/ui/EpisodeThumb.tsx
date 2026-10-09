import { StyleSheet, Text, View, type DimensionValue } from 'react-native';
import {
  aspect,
  layout,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type CoverFamily,
} from '@ongod/tokens';
import { Artwork } from './Artwork';

export interface EpisodeThumbProps {
  /** `thumbnail` = 4:3 list crop (112 wide); `artwork` = the full 16:9 picture. */
  variant?: 'thumbnail' | 'artwork';
  uri?: string | null | undefined;
  /** Placeholder text when there is no picture. */
  title?: string | undefined;
  number?: string | undefined;
  family?: CoverFamily;
  /** "36:00" */
  durationLabel?: string | undefined;
  /** Started episodes: 0..1, drawn as a line along the bottom. */
  progress?: number | undefined;
  width?: DimensionValue;
}

/**
 * Episode picture with the duration badge (bottom right) and a progress line (bottom) for started
 * episodes. Always dark-on-picture colors, whatever the surface.
 */
export function EpisodeThumb({
  variant = 'thumbnail',
  uri,
  title,
  number,
  family,
  durationLabel,
  progress,
  width,
}: EpisodeThumbProps) {
  const isThumb = variant === 'thumbnail';
  const dark = themes.dark;
  const percent = progress != null ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : 0;
  return (
    <View
      style={[
        styles.frame,
        {
          width: width ?? (isThumb ? layout.thumbWidth : '100%'),
          aspectRatio: isThumb ? aspect.thumbnail : aspect.artwork,
          borderRadius: isThumb ? radius.thumb : radius.hero,
        },
      ]}
      aria-hidden
    >
      <Artwork
        uri={uri}
        title={title}
        number={number}
        size={isThumb ? 'small' : 'large'}
        {...(family && { family })}
      />
      {durationLabel ? (
        <View style={[styles.badge, { backgroundColor: withAlpha(dark.bg, 0.72) }]}>
          <Text style={[styles.badgeText, { color: dark.textPrimary }]}>{durationLabel}</Text>
        </View>
      ) : null}
      {progress != null && percent > 0 ? (
        <View style={[styles.track, { backgroundColor: withAlpha(dark.textPrimary, 0.25) }]}>
          <View style={[styles.bar, { width: `${percent}%`, backgroundColor: dark.accent }]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  badge: {
    position: 'absolute',
    right: spacing.xxs,
    bottom: spacing.xxs,
    height: layout.durationBadgeHeight,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.small,
    justifyContent: 'center',
  },
  badgeText: { ...nativeTextStyle('caption'), fontVariant: ['tabular-nums'] },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: layout.progressBarHeight },
  bar: { height: '100%' },
});
