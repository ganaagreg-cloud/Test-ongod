import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import {
  glass,
  layout,
  motion,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type CoverFamily,
} from '@ongod/tokens';
import { Artwork } from './Artwork';
import { Equalizer } from './Equalizer';
import { Glass, floatingShadow } from './Glass';
import { Icon } from './Icon';
import { SurfaceProvider } from './surface';
import { PressableScale } from './usePressScale';

export interface MiniPlayerProps {
  title: string;
  /** "№ 022 · Сэтгэл зүй" */
  subtitle: string;
  coverUri?: string | null | undefined;
  family?: CoverFamily;
  playing: boolean;
  /** 0..1 */
  progress: number;
  onOpen: () => void;
  onTogglePlay: () => void;
  /** Accessible names for the play/pause button. */
  playLabel: string;
  pauseLabel: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Docked 8 pt above the tab bar: glass, 40 pt cover, title, equalizer while playing, play/pause,
 * and a thin gold progress line along the bottom. Always dark.
 */
export function MiniPlayer({
  title,
  subtitle,
  coverUri,
  family,
  playing,
  progress,
  onOpen,
  onTogglePlay,
  playLabel,
  pauseLabel,
  style,
}: MiniPlayerProps) {
  const dark = themes.dark;
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <SurfaceProvider surface="dark">
      <Glass
        tone="dark"
        opacity={glass.miniPlayer}
        style={[styles.card, { borderColor: dark.hairline }, floatingShadow, style]}
      >
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${subtitle}`}
          onPress={onOpen}
          style={styles.main}
        >
          <View style={styles.cover}>
            <Artwork uri={coverUri} {...(family && { family })} />
          </View>
          <View style={styles.text}>
            <Text style={[styles.title, { color: dark.textPrimary }]} numberOfLines={1}>
              {title}
            </Text>
            <Text style={[styles.subtitle, { color: dark.textSecondary }]} numberOfLines={1}>
              {subtitle}
            </Text>
          </View>
        </PressableScale>
        <Equalizer playing={playing} />
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playing ? pauseLabel : playLabel}
          onPress={onTogglePlay}
          scale={motion.pressScaleRound}
          style={styles.toggle}
        >
          <Icon name={playing ? 'pause' : 'play'} color={dark.textPrimary} />
        </PressableScale>
        <View
          style={[styles.track, { backgroundColor: withAlpha(dark.textPrimary, 0.1) }]}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <View
            style={[styles.bar, { width: `${percent}%`, backgroundColor: dark.accent }]}
          />
        </View>
      </Glass>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  card: {
    height: layout.miniPlayerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.xs,
    paddingRight: spacing.xs,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cover: {
    width: layout.miniPlayerCover,
    height: layout.miniPlayerCover,
    borderRadius: radius.mini,
    overflow: 'hidden',
  },
  text: { flex: 1 },
  title: { ...nativeTextStyle('small'), fontFamily: nativeFontFamily.ui[600] },
  subtitle: { ...nativeTextStyle('caption') },
  toggle: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    bottom: 0,
    height: layout.miniPlayerProgress,
  },
  bar: { height: '100%', borderRadius: radius.pill },
});
