import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { nativeTextStyle, typeScale, type TextStyleName } from '@ongod/tokens';
import { springs } from './motion';
import { useSurface } from './surface';

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function Digit({ digit, name, color }: { digit: number; name: TextStyleName; color: string }) {
  const lineHeight = typeScale[name].lineHeight;
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withSpring(-digit * lineHeight, springs.smooth);
  }, [digit, lineHeight, y]);
  const column = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const text = { ...nativeTextStyle(name), color, fontVariant: ['tabular-nums'] as ['tabular-nums'] };
  return (
    <View style={{ height: lineHeight, overflow: 'hidden' }}>
      {/* Invisible "0" gives the column its width; the real column slides behind the window. */}
      <Text style={[text, styles.sizer]}>0</Text>
      <Animated.View style={[styles.column, column]}>
        {DIGITS.map((d) => (
          <Text key={d} style={text}>
            {d}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

/**
 * A number whose digits roll to their value (0 -> n on first show, then on every change).
 * Screen readers get the plain number.
 */
export function NumberTicker({
  value,
  textStyle = 'display',
  color,
}: {
  value: number;
  textStyle?: TextStyleName;
  color?: string;
}) {
  const { colors } = useSurface();
  const tint = color ?? colors.textPrimary;
  const chars = String(Math.max(0, Math.round(value))).split('');
  return (
    <View accessible accessibilityLabel={String(value)} style={styles.row}>
      {chars.map((ch, i) => {
        const key = `${chars.length - i}`;
        return /\d/.test(ch) ? (
          <Digit key={key} digit={Number(ch)} name={textStyle} color={tint} />
        ) : (
          <Text key={key} style={[nativeTextStyle(textStyle), { color: tint }]}>
            {ch}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  sizer: { opacity: 0 },
  column: { position: 'absolute', top: 0, left: 0 },
});
