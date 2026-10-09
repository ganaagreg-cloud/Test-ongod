import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  coverFamilies,
  motion,
  nativeFontFamily,
  nativeTextStyle,
  spacing,
  themes,
  type CoverFamily,
} from '@ongod/tokens';

const FAMILIES = Object.keys(coverFamilies) as CoverFamily[];

/** A stable cover family for an episode/category id, so placeholders keep their color. */
export function coverFamilyFor(key: string): CoverFamily {
  let hash = 0;
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return FAMILIES[hash % FAMILIES.length]!;
}

/**
 * Fills its parent (give the parent the aspect ratio, radius and overflow hidden). Shows the
 * picture with a fade-in, or a typographic placeholder (number + serif title on a cover family)
 * when there is no picture. Decorative: the title is always next to it.
 */
export function Artwork({
  uri,
  title,
  number,
  family = 'forest',
  size = 'small',
}: {
  uri?: string | null | undefined;
  title?: string | undefined;
  number?: string | undefined;
  family?: CoverFamily;
  size?: 'small' | 'large';
}) {
  const gold = themes.dark.accent;
  const text = themes.dark.textPrimary;
  return (
    <View style={StyleSheet.absoluteFill} aria-hidden>
      <LinearGradient
        colors={[...coverFamilies[family]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {uri ? (
        <Image
          source={{ uri }}
          contentFit="cover"
          transition={motion.durationMs}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <View style={styles.placeholder}>
          {number ? <Text style={[styles.number, { color: gold }]}>{number}</Text> : null}
          {title ? (
            <Text
              numberOfLines={size === 'large' ? 3 : 2}
              style={[size === 'large' ? styles.titleLarge : styles.title, { color: text }]}
            >
              {title}
            </Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: spacing.xs,
  },
  number: { ...nativeTextStyle('caption') },
  title: { ...nativeTextStyle('caption'), fontFamily: nativeFontFamily.display[600] },
  titleLarge: { ...nativeTextStyle('h2'), fontFamily: nativeFontFamily.display[600] },
});
