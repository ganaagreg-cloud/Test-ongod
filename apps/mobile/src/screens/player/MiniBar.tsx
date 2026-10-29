import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  motion,
  nativeFontFamily,
  nativeTextStyle,
  radius,
  spacing,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import { Icon, PressableScale, useSurface, useThemedStyles } from '../../ui';

/**
 * The slim player that stays pinned under the top bar once the member has scrolled past the big
 * controls (ADR-0067): play / pause, the title (or the autoplay countdown) and a progress line.
 */
export function MiniBar({
  title,
  playing,
  fraction,
  onToggle,
}: {
  title: string;
  playing: boolean;
  /** 0..1 of the episode played. */
  fraction: number;
  onToggle: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  return (
    <View style={styles.bar}>
      <View style={styles.row}>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={playing ? mn.episode.pause : mn.episode.play}
          onPress={onToggle}
          scale={motion.pressScaleRound}
          style={styles.play}
        >
          <Icon name={playing ? 'pause' : 'play'} size="small" color={colors.onAccent} />
        </PressableScale>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.track} aria-hidden>
        <View
          style={[
            styles.fill,
            { width: `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    bar: {
      backgroundColor: c.bg,
      borderBottomWidth: layout.borderWidth,
      borderBottomColor: c.hairline,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: layout.screenPadding,
      paddingVertical: spacing.xs,
    },
    play: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      color: c.textPrimary,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
    track: { height: spacing.xxs, backgroundColor: c.hairlineStrong },
    fill: { height: spacing.xxs, backgroundColor: c.accent },
  });
