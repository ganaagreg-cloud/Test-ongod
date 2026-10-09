import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import {
  layout,
  nativeTextStyle,
  radius,
  spacing,
  withAlpha,
  type ThemeColors,
} from '@ongod/tokens';
import { useSurface, useThemedStyles } from './surface';

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
  const { colors } = useSurface();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  const message = error ?? hint;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={message}
        placeholderTextColor={colors.textTertiary}
        selectionColor={colors.focusRing}
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
          focused && { boxShadow: `0px 0px 0px 4px ${withAlpha(colors.focusRing, 0.14)}` },
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

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    field: { gap: spacing.xs },
    label: { color: c.textSecondary, ...nativeTextStyle('small') },
    input: {
      minHeight: layout.inputHeight,
      paddingHorizontal: spacing.md,
      borderRadius: radius.cardLarge,
      borderWidth: layout.borderWidth,
      borderColor: c.hairlineStrong,
      backgroundColor: c.surface,
      color: c.textPrimary,
      ...nativeTextStyle('body'),
    },
    focused: { borderColor: c.focusRing },
    invalid: { borderColor: c.danger },
    disabled: { opacity: 0.5 },
    message: { color: c.textSecondary, ...nativeTextStyle('caption') },
    error: { color: c.danger },
  });
