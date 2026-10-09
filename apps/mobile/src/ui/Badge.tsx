import { StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';

/** `active` = the active-access badge (heritage); status hues use text in the solid color. */
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'active';

const TONES: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceRaised, fg: colors.textSecondary },
  success: { bg: colors.successBg, fg: colors.success },
  danger: { bg: colors.dangerBg, fg: colors.danger },
  warning: { bg: colors.warningBg, fg: colors.warning },
  info: { bg: colors.infoBg, fg: colors.info },
  active: { bg: colors.heritage, fg: colors.textPrimary },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.label, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    minHeight: layout.badgeHeight,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.pill,
    justifyContent: 'center',
  },
  label: nativeTextStyle('caption'),
});
