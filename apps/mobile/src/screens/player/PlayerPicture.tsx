import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  aspect,
  layout,
  motion,
  radius,
  withAlpha,
  type CoverFamily,
  type ThemeColors,
} from '@ongod/tokens';
import { mn } from '../../i18n/mn';
import {
  Artwork,
  LockedBlur,
  Icon,
  PressableScale,
  useAmbientActive,
  useSurface,
  useThemedStyles,
} from '../../ui';
import { VideoSurface } from '../../video/VideoSurface';

/** Ken Burns while playing: 1.04 -> 1.14 and back, 18 s each way (Player.dc.html). */
const KB_FROM = 1.04;
const KB_TO = 1.14;
const KB_MS = 18_000;

/**
 * The top of the Player: the 16:9 picture (slow Ken Burns while playing, a play button over it
 * when paused) or, for a loaded video episode, the video itself (DESIGN "Player").
 */
export function PlayerPicture({
  uri,
  title,
  family,
  playing,
  video,
  locked,
  onPlay,
}: {
  uri: string | null;
  title: string;
  family: CoverFamily;
  playing: boolean;
  video: boolean;
  /** Paid item without access: the picture is blurred. */
  locked?: boolean;
  onPlay: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const ambient = useAmbientActive();
  const zoom = useSharedValue(KB_FROM);

  useEffect(() => {
    if (playing && ambient) {
      zoom.value = withRepeat(
        withTiming(KB_TO, {
          duration: KB_MS,
          easing: Easing.inOut(Easing.ease),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        true,
      );
    } else {
      cancelAnimation(zoom);
    }
  }, [playing, ambient, zoom]);

  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));

  if (video) {
    return (
      <View style={styles.frame}>
        <VideoSurface />
      </View>
    );
  }
  return (
    <View style={[styles.frame, styles.clip]}>
      <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
        <Artwork uri={uri} title={title} family={family} size="large" />
        {locked ? <LockedBlur /> : null}
      </Animated.View>
      <LinearGradient
        colors={[withAlpha(colors.bg, 0.35), withAlpha(colors.bg, 0), withAlpha(colors.bg, 0.6)]}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {playing ? null : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={mn.episode.play}
          onPress={onPlay}
          scale={motion.pressScaleRound}
          style={styles.overlay}
        >
          <Icon name="play" size="large" color={colors.textPrimary} />
        </PressableScale>
      )}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    frame: { width: '100%', aspectRatio: aspect.artwork, borderRadius: radius.hero },
    clip: { overflow: 'hidden', backgroundColor: c.brand },
    overlay: {
      position: 'absolute',
      alignSelf: 'center',
      top: '50%',
      marginTop: -layout.playerOverlayButton / 2,
      width: layout.playerOverlayButton,
      height: layout.playerOverlayButton,
      borderRadius: radius.pill,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      backgroundColor: withAlpha(c.bg, 0.55),
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
