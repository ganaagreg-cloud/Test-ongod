import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useEnterStyle } from './motion';

/** Fades in and rises 16 pt, `index` x 60 ms after the screen mounts (max 8 steps). */
export function Enter({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const enter = useEnterStyle(index);
  return <Animated.View style={[style, enter]}>{children}</Animated.View>;
}
