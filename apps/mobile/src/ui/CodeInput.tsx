import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';

export interface CodeInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Number of digits (the emailed codes have 6). */
  length?: number;
  error?: string | undefined;
  autoFocus?: boolean;
}

/**
 * The emailed code as separate boxes (DESIGN.md "Email code (6 boxes)"). One invisible text
 * field underneath takes the typing, pasting and the system's code suggestion, so the boxes
 * are only a picture of it. Screen readers get the single field with its label.
 */
export function CodeInput({
  label,
  value,
  onChange,
  length = 6,
  error,
  autoFocus = false,
}: CodeInputProps) {
  const field = useRef<TextInput>(null);
  const [focused, setFocused] = useState(autoFocus);
  const digits = value.split('');

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        onPress={() => field.current?.focus()}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.boxes}
      >
        {Array.from({ length }, (_, index) => {
          const current = focused && index === Math.min(digits.length, length - 1);
          return (
            <View
              key={index}
              style={[styles.box, current && styles.current, error ? styles.invalid : null]}
            >
              <Text style={styles.digit}>{digits[index] ?? ''}</Text>
            </View>
          );
        })}
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

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { color: colors.textSecondary, ...nativeTextStyle('small') },
  boxes: { flexDirection: 'row', gap: spacing.xs },
  box: {
    flex: 1,
    minHeight: layout.inputHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.card,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  current: { borderColor: colors.focusRing },
  invalid: { borderColor: colors.danger },
  digit: { color: colors.textPrimary, ...nativeTextStyle('h1') },
  // Covers the boxes so a tap anywhere focuses it; invisible, it only collects the typing.
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
  error: { color: colors.danger, ...nativeTextStyle('caption') },
});
