import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { layout, nativeTextStyle, spacing, type ThemeColors } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import {
  Button,
  Icon,
  MountainLine,
  springs,
  useAmbientActive,
  useSurface,
  useThemedStyles,
} from '../ui';

/** The bookmark falls from this high and tilts, then rests on the ridge (Saved.dc.html). */
const DROP_FROM = -spacing.xl;
const DROP_TILT_DEG = -12;
/** After landing it bobs gently (an ambient loop: stops with reduce motion / in background). */
const BOB = spacing.xxs;
const BOB_MS = 1600;

/** Хадгалсан, empty: a bookmark dropping onto the mountain line (DESIGN "Хадгалсан"). */
export function SavedEmpty({ onBrowse }: { onBrowse: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const ambient = useAmbientActive();
  const drop = useSharedValue(0);
  const bob = useSharedValue(0);

  useEffect(() => {
    drop.value = withSpring(1, { ...springs.smooth, reduceMotion: ReduceMotion.System });
  }, [drop]);

  useEffect(() => {
    if (!ambient) {
      bob.value = 0;
      return;
    }
    bob.value = withDelay(
      600,
      withRepeat(
        withSequence(
          withTiming(-BOB, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: BOB_MS / 2, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
      ),
    );
  }, [ambient, bob]);

  const mark = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [
      { translateY: (1 - drop.value) * DROP_FROM + bob.value },
      { rotate: `${(1 - drop.value) * DROP_TILT_DEG}deg` },
    ],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.scene} aria-hidden>
        <Animated.View style={[styles.mark, mark]}>
          <Icon name="bookmark" size="large" color={colors.accent} />
        </Animated.View>
        <View style={styles.ridge}>
          <MountainLine draw />
        </View>
      </View>
      <Text style={styles.title} accessibilityRole="header">
        {mn.saved.emptyTitle}
      </Text>
      <Text style={styles.text}>{mn.saved.emptyText}</Text>
      <Button label={mn.saved.browse} variant="secondary" onPress={onBrowse} />
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    root: { alignItems: 'center', gap: spacing.sm, paddingTop: spacing.huge },
    scene: {
      width: layout.motifWidth,
      height: layout.motifHeight * 2,
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    mark: { position: 'absolute', top: 0 },
    ridge: { width: layout.motifWidth, height: layout.motifHeight },
    title: { color: c.textPrimary, textAlign: 'center', ...nativeTextStyle('h1') },
    text: {
      color: c.textSecondary,
      textAlign: 'center',
      maxWidth: layout.welcomeTextMax,
      ...nativeTextStyle('body'),
    },
  });
