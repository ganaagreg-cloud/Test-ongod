import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';

export interface InputProps extends Omit<TextInputProps, 'style' | 'placeholderTextColor'> {
  label: string;
  /** Shown below the field in the danger color; also marks the field invalid. */
  error?: string | undefined;
  hint?: string | undefined;
}

export function Input({
  label,
  error,
  hint,
  editable = true,
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  const [focused, setFocused] = useState(false);
  const message = error ?? hint;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={message}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.accent}
        editable={editable}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          styles.input,
          focused && styles.focused,
          error ? styles.invalid : null,
          !editable && styles.disabled,
        ]}
        {...rest}
      />
      {message ? (
        <Text
          style={[styles.message, error ? styles.error : null]}
          accessibilityLiveRegion="polite"
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { color: colors.textSecondary, ...nativeTextStyle('small') },
  input: {
    minHeight: layout.inputHeight,
    paddingHorizontal: spacing.md,
    borderRadius: radius.card,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    ...nativeTextStyle('body'),
  },
  focused: { borderColor: colors.focusRing },
  invalid: { borderColor: colors.danger },
  disabled: { opacity: 0.5 },
  message: { color: colors.textSecondary, ...nativeTextStyle('caption') },
  error: { color: colors.danger },
});
