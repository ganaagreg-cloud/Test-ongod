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
import { SKIP_BACK_SEC, SKIP_FORWARD_SEC } from '../../audio/controller';
import { rateLabel } from '../../audio/rates';
import { mn } from '../../i18n/mn';
import { goldGlowShadow, Icon, PressableScale, useSurface, useThemedStyles } from '../../ui';

/**
 * One row (Player.dc.html): speed chip (1x / 1.25x / 1.5x / 2x), -15, the gold play / pause, +30,
 * sleep timer. Skips and speed only act on the loaded episode.
 */
export function PlayerControls({
  playing,
  rate,
  sleepOn,
  canSeek,
  onToggle,
  onBack,
  onForward,
  onRate,
  onSleep,
}: {
  playing: boolean;
  rate: number;
  sleepOn: boolean;
  canSeek: boolean;
  onToggle: () => void;
  onBack: () => void;
  onForward: () => void;
  onRate: () => void;
  onSleep: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  return (
    <View style={styles.row}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.player.speed(rateLabel(rate))}
        onPress={onRate}
        disabled={!canSeek}
        scale={motion.pressScaleRound}
        accessibilityState={{ selected: rate !== 1 }}
        style={[styles.chip, rate !== 1 && styles.chipOn, !canSeek && styles.off]}
      >
        <Text style={[styles.chipText, rate !== 1 && styles.chipTextOn]}>{rateLabel(rate)}</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.player.back15}
        onPress={onBack}
        disabled={!canSeek}
        scale={motion.pressScaleRound}
        style={[styles.skip, !canSeek && styles.off]}
      >
        <Icon name="skipBack" size="large" color={colors.textPrimary} />
        <Text style={styles.skipText}>{SKIP_BACK_SEC}</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={playing ? mn.episode.pause : mn.episode.play}
        onPress={onToggle}
        scale={motion.pressScaleRound}
        style={[styles.play, goldGlowShadow]}
      >
        <Icon name={playing ? 'pause' : 'play'} size="large" color={colors.onAccent} />
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.player.forward30}
        onPress={onForward}
        disabled={!canSeek}
        scale={motion.pressScaleRound}
        style={[styles.skip, !canSeek && styles.off]}
      >
        <Icon name="skipForward" size="large" color={colors.textPrimary} />
        <Text style={styles.skipText}>{SKIP_FORWARD_SEC}</Text>
      </PressableScale>

      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={mn.player.sleep}
        accessibilityState={{ selected: sleepOn }}
        onPress={onSleep}
        disabled={!canSeek}
        scale={motion.pressScaleRound}
        style={[styles.chip, sleepOn && styles.chipOn, !canSeek && styles.off]}
      >
        <Icon name="moon" size="small" color={sleepOn ? colors.accent : colors.textPrimary} />
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    chip: {
      width: layout.playerControl,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { backgroundColor: c.accentSoft, borderColor: c.accent },
    /** Before the episode is loaded only play works. */
    off: { opacity: 0.4 },
    chipText: {
      color: c.textPrimary,
      ...nativeTextStyle('small'),
      fontFamily: nativeFontFamily.ui[600],
    },
    chipTextOn: { color: c.accentText },
    skip: {
      width: layout.playerControl,
      height: layout.playerControl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skipText: {
      position: 'absolute',
      color: c.textPrimary,
      ...nativeTextStyle('caption'),
      fontFamily: nativeFontFamily.ui[600],
      paddingTop: spacing.xxs,
    },
    play: {
      width: layout.playerPlayButton,
      height: layout.playerPlayButton,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
