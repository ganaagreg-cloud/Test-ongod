import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  coverFamilies,
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type CoverFamily,
  type ThemeColors,
} from '@ongod/tokens';
import { Icon } from './Icon';
import { springs } from './motion';
import { useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

/** Share of the card width: the photo, and where the text starts (Home.dc.html, "Сэдвээр сонсох"). */
const PHOTO_WIDTH = '66%';
const TEXT_START = '46%';

/**
 * Wide category card, 104 pt tall and as wide as its parent. The category photo (`coverPath`)
 * sits on the left and fades into the card color (transparent at 18%, 78% at 46%, solid at 64%);
 * a 3 pt gold strip marks the left edge; serif name + "N дугаар" start at 46%; a chevron sits in
 * a 44 pt hit area on the right. Pressing scales the card to .97 (snappy), zooms the photo to
 * 1.08 (smooth) and nudges the chevron 4 pt right.
 */
export function CategoryCard({
  name,
  countLabel,
  imageUri,
  family = 'forest',
  onPress,
}: {
  name: string;
  /** "24 дугаар" */
  countLabel: string;
  imageUri?: string | null | undefined;
  family?: CoverFamily;
  onPress: () => void;
}) {
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const zoom = useSharedValue(1);
  const nudge = useSharedValue(0);

  const photo = useAnimatedStyle(() => ({ transform: [{ scale: zoom.value }] }));
  const chevron = useAnimatedStyle(() => ({ transform: [{ translateX: nudge.value }] }));

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${name}. ${countLabel}`}
      onPress={onPress}
      scale={motion.pressScaleCard}
      onPressIn={() => {
        zoom.set(withSpring(motion.coverZoom, springs.smooth));
        nudge.set(withSpring(motion.chevronNudge, springs.snappy));
      }}
      onPressOut={() => {
        zoom.set(withSpring(1, springs.smooth));
        nudge.set(withSpring(0, springs.snappy));
      }}
      style={styles.card}
    >
      <View style={styles.photoBox}>
        <Animated.View style={[StyleSheet.absoluteFill, photo]}>
          <LinearGradient
            colors={[...coverFamilies[family]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              contentFit="cover"
              transition={motion.durationMs}
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </Animated.View>
      </View>
      <LinearGradient
        colors={[withAlpha(colors.surface, 0), withAlpha(colors.surface, 0.78), colors.surface]}
        locations={[0.18, 0.46, 0.64]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={styles.strip} />
      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.count}>{countLabel}</Text>
      </View>
      <Animated.View style={[styles.chevron, chevron]}>
        <Icon name="chevronRight" color={colors.textSecondary} />
      </Animated.View>
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    card: {
      width: '100%',
      height: layout.categoryCardHeight,
      overflow: 'hidden',
      justifyContent: 'center',
      borderRadius: radius.category,
      borderWidth: layout.borderWidth,
      borderColor: c.hairline,
      backgroundColor: c.surface,
    },
    photoBox: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: PHOTO_WIDTH,
      overflow: 'hidden',
    },
    strip: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: layout.categoryAccentStrip,
      backgroundColor: c.accent,
    },
    text: {
      position: 'absolute',
      left: TEXT_START,
      right: layout.touchTarget,
      gap: spacing.xxs,
    },
    name: { color: c.textPrimary, ...nativeTextStyle('cardTitle') },
    count: { color: c.textSecondary, ...nativeTextStyle('caption') },
    chevron: {
      position: 'absolute',
      right: 0,
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
