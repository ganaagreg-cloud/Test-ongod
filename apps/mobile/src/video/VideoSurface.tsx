// The picture area of a video episode (DESIGN Player: 16:9, radius hero, fullscreen button;
// fullscreen turns to landscape). It shows the one video player of the app (engine.ts); the
// sound keeps going when this view is gone, so the mini player and the lock screen still work.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { aspect, colors, radius } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { getVideoPlayer, onVideoPlayerCreated } from './engine';
import { videoModule } from './native';
import { allowFullscreenLandscape, lockPortrait } from './orientation';

export function VideoSurface() {
  const [player, setPlayer] = useState(getVideoPlayer);

  useEffect(() => onVideoPlayerCreated(() => setPlayer(getVideoPlayer())), []);
  // Leaving the screen while fullscreen must not leave the app in landscape.
  useEffect(
    () => () => {
      void lockPortrait();
    },
    [],
  );

  const VideoView = videoModule?.VideoView;
  if (!player || !VideoView) return null;
  return (
    <View style={styles.frame}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls
        fullscreenOptions={{ enable: true, orientation: 'landscape' }}
        allowsPictureInPicture={false}
        onFullscreenEnter={() => void allowFullscreenLandscape()}
        onFullscreenExit={() => void lockPortrait()}
        accessibilityLabel={mn.videoLabel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: aspect.artwork,
    borderRadius: radius.hero,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
  },
  video: { flex: 1 },
});
