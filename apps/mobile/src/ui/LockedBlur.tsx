import { Platform, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { glass, themes, withAlpha } from '@ongod/tokens';

/**
 * Blur over a picture of a paid item the member cannot play (ADR-0044). No icon, no text: the
 * picture just does not show. Same blur strength as <Glass>; Android has no blur (DESIGN "Glass"),
 * so it gets the dark background at the Android glass opacity instead.
 */
export function LockedBlur() {
  if (Platform.OS === 'android') {
    return (
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: withAlpha(themes.dark.bg, glass.androidOpacity) },
        ]}
      />
    );
  }
  return (
    <BlurView
      pointerEvents="none"
      intensity={glass.blurIntensity}
      tint="dark"
      style={StyleSheet.absoluteFill}
    />
  );
}
