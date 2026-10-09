import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import {
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type IconName,
  type ThemeColors,
} from '@ongod/tokens';
import { Icon } from './Icon';
import { useAmbientActive } from './motion';
import { useSurface } from './surface';
import { PressableScale } from './usePressScale';

export type ButtonVariant = 'primary' | 'inverse' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Light sweeps across the primary button every 3.2 s. Welcome screen only. */
  sheen?: boolean;
  icon?: IconName;
}

function palette(variant: ButtonVariant, c: ThemeColors, pressed: boolean, disabled: boolean) {
  switch (variant) {
    case 'primary':
      return disabled
        ? { bg: withAlpha(c.accent, 0.16), fg: withAlpha(c.textPrimary, 0.45), border: 'transparent' }
        : { bg: pressed ? c.accentPressed : c.accent, fg: c.onAccent, border: 'transparent' };
    case 'inverse':
      return { bg: c.textPrimary, fg: c.bg, border: 'transparent' };
    case 'secondary':
      return { bg: 'transparent', fg: c.textPrimary, border: c.hairlineStrong };
    case 'ghost':
      return { bg: c.accentSoft, fg: c.accentText, border: 'transparent' };
    case 'destructive':
      return { bg: 'transparent', fg: c.danger, border: withAlpha(c.danger, 0.45) };
  }
}

/** Highlight sweep geometry, as shares of the button width (Main.dc.html `sweep`). */
const SHEEN_FROM = -0.56;
const SHEEN_TO = 1.28;
const SHEEN_SHARE = 0.4;
const SHEEN_SWEEP_SHARE = 0.6;

function Sheen() {
  const active = useAmbientActive();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active || width === 0) return;
    progress.value = 0;
    progress.value = withDelay(
      motion.sheenDelayMs,
      withRepeat(
        withSequence(
          withTiming(1, {
            duration: motion.sheenMs * SHEEN_SWEEP_SHARE,
            easing: Easing.inOut(Easing.ease),
            reduceMotion: ReduceMotion.Never,
          }),
          withDelay(
            motion.sheenMs * (1 - SHEEN_SWEEP_SHARE),
            withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never }),
          ),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(progress);
  }, [active, width, progress]);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(progress.value, [0, 1], [SHEEN_FROM * width, SHEEN_TO * width]) },
      { skewX: '-20deg' },
    ],
  }));

  const shine = themes.dark.textPrimary;
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.sheen, { width: width * SHEEN_SHARE }, style]}>
        <LinearGradient
          colors={[withAlpha(shine, 0), withAlpha(shine, 0.55), withAlpha(shine, 0)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
  sheen = false,
  icon,
}: ButtonProps) {
  const { colors } = useSurface();
  const [pressed, setPressed] = useState(false);
  const blocked = disabled || loading;
  const look = palette(variant, colors, pressed, disabled);
  const fadeOthers = disabled && variant !== 'primary';

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.base,
        { backgroundColor: look.bg, borderColor: look.border },
        fullWidth && styles.full,
        fadeOthers && styles.faded,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator size="small" color={look.fg} /> : null}
        {icon && !loading ? <Icon name={icon} color={look.fg} /> : null}
        <Text style={[styles.label, { color: look.fg }]}>{label}</Text>
      </View>
      {sheen && variant === 'primary' && !blocked ? <Sheen /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  faded: { opacity: 0.4 },
  base: {
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...nativeTextStyle('body'), fontFamily: nativeTextStyle('h1').fontFamily },
  full: { alignSelf: 'stretch' },
  sheen: { position: 'absolute', top: 0, bottom: 0, left: 0 },
});
