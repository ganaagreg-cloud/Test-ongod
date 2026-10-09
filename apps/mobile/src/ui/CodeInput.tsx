import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { haptic } from './haptics';
import { springs, useAmbientActive } from './motion';
import { useSurface, useThemedStyles } from './surface';

export interface CodeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Number of digits (the emailed codes have 6). */
  length?: number;
  error?: string | undefined;
  /** Boxes turn green and wave. Default: the code is complete and there is no error. */
  success?: boolean;
  autoFocus?: boolean;
}

/** Wave height of a box in the success animation, as a share of the box's own height. */
const WAVE = -0.14;
/** Shake distance: shares of a box width. */
const SHAKE = [-0.2, 0.2, -0.12, 0.12, 0];

/**
 * The emailed code as separate boxes (DESIGN.md "Email code (6 boxes)"). One invisible text
 * field underneath takes the typing, pasting and the system's code suggestion, so the boxes
 * are only a picture of it. Screen readers get the single field with its label.
 * Motion: caret blink, pop when a digit lands, success wave, error shake + error haptic.
 */
export function CodeInput({
  label,
  value,
  onChange,
  length = 6,
  error,
  success,
  autoFocus = false,
}: CodeInputProps) {
  const styles = useThemedStyles(makeStyles);
  const field = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const [boxWidth, setBoxWidth] = useState(0);
  const digits = value.split('');
  const complete = value.length === length;
  const ok = success ?? (complete && !error);

  const shake = useSharedValue(0);
  useEffect(() => {
    if (!error) return;
    haptic.error();
    const d = boxWidth * 1;
    shake.value = withSequence(
      ...SHAKE.map((s) =>
        withTiming(s * d, { duration: motion.shakeMs, reduceMotion: ReduceMotion.System }),
      ),
    );
  }, [error, boxWidth, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => field.current?.focus()}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Animated.View style={[styles.boxes, shakeStyle]}>
          {Array.from({ length }, (_, index) => (
            <Box
              key={index}
              index={index}
              char={digits[index] ?? ''}
              current={focused && !complete && index === digits.length}
              ok={ok}
              invalid={Boolean(error)}
              onWidth={index === 0 ? setBoxWidth : undefined}
            />
          ))}
        </Animated.View>
      </Pressable>
      <TextInput
        ref={field}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, length))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={styles.hidden}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

function Box({
  index,
  char,
  current,
  ok,
  invalid,
  onWidth,
}: {
  index: number;
  char: string;
  current: boolean;
  ok: boolean;
  invalid: boolean;
  onWidth: ((width: number) => void) | undefined;
}) {
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const active = useAmbientActive();
  const pop = useSharedValue(1);
  const wave = useSharedValue(0);
  const caret = useSharedValue(1);
  const previous = useRef(char);
  const height = layout.codeBoxHeight;

  // A digit lands: scale .86 -> 1.
  useEffect(() => {
    if (char && !previous.current) {
      pop.value = 0.86;
      pop.value = withSpring(1, springs.snappy);
    }
    previous.current = char;
  }, [char, pop]);

  // The code is complete and right: each box hops, one after another.
  useEffect(() => {
    if (!ok) return;
    wave.value = withDelay(
      index * motion.waveStaggerMs,
      withSequence(withSpring(WAVE * height, springs.snappy), withSpring(0, springs.snappy)),
    );
  }, [ok, index, wave, height]);

  // Caret blinks while this is the box being typed into.
  useEffect(() => {
    if (!current || !active) {
      caret.value = 1;
      return;
    }
    const half = motion.caretMs / 2;
    caret.value = withRepeat(
      withSequence(
        withDelay(half, withTiming(0, { duration: 0, reduceMotion: ReduceMotion.Never })),
        withDelay(half, withTiming(1, { duration: 0, reduceMotion: ReduceMotion.Never })),
      ),
      -1,
    );
    return () => cancelAnimation(caret);
  }, [current, active, caret]);

  const boxStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { translateY: wave.value }],
  }));
  const caretStyle = useAnimatedStyle(() => ({ opacity: caret.value }));

  return (
    <Animated.View
      onLayout={onWidth ? (e) => onWidth(e.nativeEvent.layout.width) : undefined}
      style={[
        styles.box,
        char ? styles.filled : null,
        current && styles.current,
        current && { boxShadow: `0px 0px 0px 4px ${withAlpha(colors.focusRing, 0.14)}` },
        ok && styles.ok,
        invalid && styles.invalid,
        boxStyle,
      ]}
    >
      <Text style={styles.digit}>{char}</Text>
      {current ? <Animated.View style={[styles.caret, caretStyle]} /> : null}
    </Animated.View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.xs },
    label: { color: c.textSecondary, ...nativeTextStyle('small') },
    boxes: { flexDirection: 'row', gap: spacing.xs },
    box: {
      flex: 1,
      height: layout.codeBoxHeight,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.thumb,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      backgroundColor: c.surface,
    },
    filled: { backgroundColor: c.surfaceRaised },
    current: { borderColor: c.focusRing, borderWidth: layout.focusRingWidth },
    ok: { backgroundColor: c.brand, borderColor: c.success, borderWidth: layout.borderWidth },
    invalid: { borderColor: c.danger },
    digit: { color: c.textPrimary, ...nativeTextStyle('h1') },
    caret: {
      position: 'absolute',
      width: layout.codeCaretWidth,
      height: layout.codeCaretHeight,
      borderRadius: radius.pill,
      backgroundColor: c.accent,
    },
    // Covers the boxes so a tap anywhere focuses it; invisible, it only collects the typing.
    hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
    error: { color: c.danger, ...nativeTextStyle('caption') },
  });
