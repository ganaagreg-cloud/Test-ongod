import { useRouter } from 'expo-router';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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

/** Share of the screen height kept free for the painting on a screen with `hero`. */
const HERO_GAP_SHARE = 0.3;

/**
 * Top of an auth screen (Code.dc.html): a round back button when there is a screen to go back to,
 * then either the mountain line (draws itself) or an icon tile, the title and optional text.
 */
export function AuthHeader({
  title,
  text,
  icon,
  onBack,
  hero = false,
}: {
  title: string;
  text?: string | undefined;
  /** An icon tile instead of the mountain line (e.g. `mail` on the email-code screen). */
  icon?: IconName;
  /** A back step inside the screen (the register steps): shown even without a screen to go back to. */
  onBack?: (() => void) | undefined;
  /**
   * The screen has the painting behind it (ADR-0102): leave the painting's space free under the
   * back button, and make that button light so it reads on the picture.
   */
  hero?: boolean;
}) {
  const { height } = useWindowDimensions();
  const router = useRouter();
  const { colors } = useSurface();
  return (
    <View style={styles.box}>
      {onBack || router.canGoBack() ? (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={mn.back}
          onPress={onBack ?? (() => router.back())}
          scale={motion.pressScaleRound}
          style={[
            styles.back,
            {
              backgroundColor: hero
                ? withAlpha(themes.light.surface, 0.78)
                : withAlpha(themes.dark.textPrimary, 0.06),
            },
          ]}
        >
          <Icon name="chevronLeft" color={hero ? themes.light.brand : colors.textPrimary} />
        </PressableScale>
      ) : null}
      {hero ? <View style={{ height: Math.round(height * HERO_GAP_SHARE) }} /> : null}
      {icon ? (
        <View
          style={[
            styles.tile,
            { backgroundColor: colors.brand, borderColor: withAlpha(colors.onBrandAccent, 0.3) },
          ]}
        >
          <Icon name={icon} color={colors.onBrandAccent} />
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
