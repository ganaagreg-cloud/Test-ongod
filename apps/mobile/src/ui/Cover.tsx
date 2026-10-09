import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, layout } from '@ongod/tokens';

/** Square 1:1 cover with radius 12. Decorative: the title is always next to it. */
export function Cover({
  uri,
  style,
}: {
  uri?: string | null | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.cover, style]} aria-hidden>
      {uri ? <Image source={{ uri }} style={styles.image} resizeMode="cover" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: layout.coverRadius,
    backgroundColor: colors.surfaceRaised,
  },
  image: { width: '100%', height: '100%' },
});
