import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { layout, motion, nativeTextStyle, radius, spacing, type ThemeColors } from '@ongod/tokens';
import { Icon } from './Icon';
import { useSurface, useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

/**
 * The library search box (Library.dc.html): search icon, the label only for screen readers, a
 * clear button while there is text. Focus = the focus-ring border (forest on cream).
 */
export function SearchField({
  value,
  onChangeText,
  label,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChangeText: (text: string) => void;
  /** Accessible name, e.g. "Хайх". */
  label: string;
  placeholder: string;
  /** Accessible name of the clear button. */
  clearLabel: string;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useSurface();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[styles.box, focused && styles.focused]}>
      <Icon name="search" size="small" color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.input}
      />
      {value ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          onPress={() => onChangeText('')}
          scale={motion.pressScaleRound}
          style={styles.clear}
        >
          <Icon name="close" size="small" color={colors.textSecondary} />
        </PressableScale>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    box: {
      height: layout.inputHeight,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingLeft: spacing.sm,
      borderRadius: radius.thumb,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      backgroundColor: c.surface,
    },
    focused: { borderColor: c.focusRing, borderWidth: layout.focusRingWidth },
    input: { flex: 1, height: '100%', color: c.textPrimary, ...nativeTextStyle('body') },
    clear: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
