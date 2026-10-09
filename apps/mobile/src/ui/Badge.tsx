import { StyleSheet, Text, View } from 'react-native';
import { layout, nativeTextStyle, radius, spacing, type ThemeColors } from '@ongod/tokens';
import { useSurface } from './surface';

/** `active` = the active-access badge (heritage); status hues use text in the solid color. */
export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info' | 'active';

function tones(c: ThemeColors): Record<BadgeTone, { bg: string; fg: string }> {
  return {
    neutral: { bg: c.surfaceSunken, fg: c.textSecondary },
    success: { bg: c.successBg, fg: c.success },
    danger: { bg: c.dangerBg, fg: c.danger },
    warning: { bg: c.warningBg, fg: c.warning },
    info: { bg: c.infoBg, fg: c.info },
    active: { bg: c.heritage, fg: c.onHeritage },
  };
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const { colors } = useSurface();
  const { bg, fg } = tones(colors)[tone];
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
