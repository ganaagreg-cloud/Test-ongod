import { StyleSheet, Text, View } from 'react-native';
import { layout, nativeFontFamily, nativeTextStyle, type ThemeColors } from '@ongod/tokens';
import { useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

/**
 * A small text action (gold on dark, ink on cream), 14 pt, with a 44 pt tall touch area. For the
 * secondary actions that must not look like buttons ("Нууц үгээ мартсан уу?"). Announced as a
 * button.
 */
export function TextLink({
  label,
  onPress,
  align = 'end',
}: {
  label: string;
  onPress: () => void;
  /** Where it sits in a full-width row. */
  align?: 'start' | 'center' | 'end';
}) {
  const styles = useThemedStyles(makeStyles);
  const justify = { start: 'flex-start', center: 'center', end: 'flex-end' } as const;
  return (
    <View style={[styles.row, { justifyContent: justify[align] }]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.hit}
      >
        <Text style={styles.label}>{label}</Text>
      </PressableScale>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row' },
    hit: { minHeight: layout.touchTarget, justifyContent: 'center' },
    label: { color: c.accentText, ...nativeTextStyle('small'), fontFamily: nativeFontFamily.ui[500] },
  });
