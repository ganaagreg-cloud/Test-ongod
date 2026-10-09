import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import {
  layout,
  motion,
  nativeTextStyle,
  radius,
  spacing,
  themes,
  withAlpha,
  type IconName,
} from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { Icon, MountainLine, PressableScale, useSurface } from '../ui';

/**
 * Top of an auth screen (Code.dc.html): a round back button when there is a screen to go back to,
 * then either the mountain line (draws itself) or an icon tile, the title and optional text.
 */
export function AuthHeader({
  title,
  text,
  icon,
}: {
  title: string;
  text?: string | undefined;
  /** An icon tile instead of the mountain line (e.g. `mail` on the email-code screen). */
  icon?: IconName;
}) {
  const router = useRouter();
  const { colors } = useSurface();
  return (
    <View style={styles.box}>
      {router.canGoBack() ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={mn.back}
          onPress={() => router.back()}
          scale={motion.pressScaleRound}
          style={[styles.back, { backgroundColor: withAlpha(themes.dark.textPrimary, 0.06) }]}
        >
          <Icon name="chevronLeft" color={colors.textPrimary} />
        </PressableScale>
      ) : null}
      {icon ? (
        <View
          style={[
            styles.tile,
            { backgroundColor: colors.brand, borderColor: withAlpha(colors.accent, 0.3) },
          ]}
        >
          <Icon name={icon} color={colors.accent} />
        </View>
      ) : (
        <MountainLine draw color={colors.accent} />
      )}
      <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
        {title}
      </Text>
      {text ? <Text style={[styles.text, { color: colors.textSecondary }]}>{text}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'flex-start' },
  back: {
    width: layout.touchTarget,
    height: layout.touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tile: {
    width: layout.iconTile,
    height: layout.iconTile,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...nativeTextStyle('display') },
  text: { ...nativeTextStyle('body') },
});
