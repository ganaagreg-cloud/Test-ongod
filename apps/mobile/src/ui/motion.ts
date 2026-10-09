import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '@ongod/tokens';
import { useReduceMotion } from './useReduceMotion';

/**
 * `withSpring` configs from packages/tokens, with the system reduce-motion setting applied
 * (springs finish instantly when the user asked for less motion).
 */
export const springs = {
  snappy: { ...motion.spring.snappy, reduceMotion: ReduceMotion.System },
  smooth: { ...motion.spring.smooth, reduceMotion: ReduceMotion.System },
  sheet: { ...motion.spring.sheet, reduceMotion: ReduceMotion.System },
} as const;

/** Timing config that also honors reduce-motion. */
export const timing = (durationMs: number) =>
  ({ duration: durationMs, reduceMotion: ReduceMotion.System }) as const;

/**
 * Entrance for the n-th item of a section: fade + 16 pt rise, 60 ms apart; items after the 8th
 * start with the last delay, not later. With reduce-motion: a plain 150 ms fade. Only opacity and
 * transform change, so layout never moves (Reanimated's `entering` layout animation does not
 * behave on web, so this is a plain animated style on both platforms).
 */
export function useEnterStyle(index = 0) {
  const reduce = useReduceMotion();
  const progress = useSharedValue(0);
  useEffect(() => {
    if (reduce) {
      progress.value = withTiming(1, { duration: motion.enter.reducedFadeMs });
      return;
    }
    const step = Math.min(index, motion.enter.maxStagger - 1);
    progress.value = withDelay(step * motion.enter.staggerMs, withSpring(1, motion.enter.spring));
  }, [index, reduce, progress]);
  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: reduce ? 0 : (1 - progress.value) * motion.enter.rise }],
  }));
}

/**
 * True while ambient/looping motion may run: not with reduce-motion, and not while the app is in
 * the background (DESIGN.md "Motion").
 */
export function useAmbientActive(): boolean {
  const reduce = useReduceMotion();
  const [foreground, setForeground] = useState(AppState.currentState !== 'background');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => sub.remove();
  }, []);
  return foreground && !reduce;
}
