import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
}

const TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: colors.onPrimary,
  secondary: colors.textPrimary,
  ghost: colors.accentText,
  destructive: colors.bg,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  fullWidth = false,
}: ButtonProps) {
  const blocked = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && variant === 'primary' && styles.primaryPressed,
        pressed && variant !== 'primary' && styles.pressedSoft,
        fullWidth && styles.full,
        disabled && styles.disabled,
      ]}
    >
      <View style={styles.content}>
        {loading && <ActivityIndicator size="small" color={TEXT_COLOR[variant]} />}
        <Text style={[styles.label, { color: TEXT_COLOR[variant] }]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: layout.buttonHeight,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    borderWidth: layout.borderWidth,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  label: { ...nativeTextStyle('body'), fontFamily: nativeTextStyle('h1').fontFamily },
  full: { alignSelf: 'stretch' },
  primary: { backgroundColor: colors.primary },
  primaryPressed: { backgroundColor: colors.accentPressed },
  secondary: { borderColor: colors.hairline, backgroundColor: 'transparent' },
  ghost: { backgroundColor: 'transparent' },
  destructive: { backgroundColor: colors.danger },
  pressedSoft: { backgroundColor: colors.surfaceRaised },
  disabled: { opacity: 0.4 },
});
