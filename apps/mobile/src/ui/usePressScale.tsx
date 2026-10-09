import { forwardRef, type ComponentProps } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { motion } from '@ongod/tokens';
import { haptic } from './haptics';
import { springs } from './motion';

/**
 * Press feedback for every pressable (DESIGN.md "Motion"): scale down on press-in, spring back on
 * release (spring.snappy), light haptic on a completed tap. Round icon buttons press deeper.
 */
export function usePressScale({
  scale = motion.pressScale,
  haptics = true,
}: { scale?: number; haptics?: boolean } = {}) {
  const value = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: value.value }] }));
  return {
    animatedStyle,
    onPressIn: () => {
      value.set(withSpring(scale, springs.snappy));
    },
    onPressOut: () => {
      value.set(withSpring(1, springs.snappy));
    },
    /** Call when a tap completes. */
    tap: () => {
      if (haptics) haptic.light();
    },
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableProps = Omit<ComponentProps<typeof Pressable>, 'style'>;

export interface PressableScaleProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  /** Round icon buttons: pass `motion.pressScaleRound`. */
  scale?: number;
  /** Light haptic on tap (default on). */
  haptics?: boolean;
}

/** `Pressable` + usePressScale. Use it instead of Pressable for anything tappable. */
export const PressableScale = forwardRef<React.ComponentRef<typeof Pressable>, PressableScaleProps>(
  function PressableScale({ style, scale, haptics, onPress, onPressIn, onPressOut, ...rest }, ref) {
    const press = usePressScale({
      ...(scale !== undefined && { scale }),
      ...(haptics !== undefined && { haptics }),
    });
    return (
      <AnimatedPressable
        ref={ref}
        {...rest}
        onPressIn={(e: GestureResponderEvent) => {
          press.onPressIn();
          onPressIn?.(e);
        }}
        onPressOut={(e: GestureResponderEvent) => {
          press.onPressOut();
          onPressOut?.(e);
        }}
        onPress={(e: GestureResponderEvent) => {
          press.tap();
          onPress?.(e);
        }}
        style={[style, press.animatedStyle]}
      />
    );
  },
);
