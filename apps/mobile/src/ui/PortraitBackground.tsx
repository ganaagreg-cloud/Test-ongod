import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { withAlpha } from '@ongod/tokens';
import portrait from '../../assets/login-portrait.jpg';
import { useSurface } from './surface';

/** How much of the screen height the painting covers, and where its fade into the page starts. */
const COVER_SHARE = 0.58;
const FADE_FROM = 0.5;

/**
 * Welcome and Login background: the painting at the top, fading into the page colour (white by
 * day, the dark forest by night) so the title and the buttons below sit on a plain page. It
 * only draws the picture; the screen decides what goes over it. The painting's signature, in
 * its bottom corner, falls inside the fade.
 */
export function PortraitBackground() {
  const { height } = useWindowDimensions();
  const { colors } = useSurface();
  const cover = Math.round(height * COVER_SHARE);
  return (
    <View pointerEvents="none" style={[styles.box, { height: cover }]}>
      <Image
        source={portrait}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="top"
        accessible={false}
        transition={0}
      />
      <LinearGradient
        colors={[withAlpha(colors.bg, 0), colors.bg]}
        locations={[FADE_FROM, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({ box: { position: 'absolute', top: 0, left: 0, right: 0 } });
