import { StyleSheet } from 'react-native';
import { layout, motion, radius, themes, withAlpha, type ThemeColors } from '@ongod/tokens';
import { mn } from '../i18n/mn';
import { saveTheme } from '../theme/preference';
import { themeMode } from '../theme/boot';
import { restartInterface } from '../theme/restart';
import { haptic } from './haptics';
import { Icon } from './Icon';
import { useThemedStyles } from './surface';
import { PressableScale } from './usePressScale';

/**
 * The day / night switch (ADR-0102): a round button that shows where a tap leads (the moon while
 * it is day, the sun while it is night). It saves the choice and restarts the interface.
 */
export function ThemeToggle({ overImage = false }: { overImage?: boolean }) {
  const styles = useThemedStyles(makeStyles);
  const day = themeMode === 'day';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={day ? mn.theme.toNight : mn.theme.toDay}
      scale={motion.pressScaleRound}
      style={[styles.button, overImage && styles.overImage]}
      onPress={() => {
        haptic.light();
        saveTheme(day ? 'night' : 'day');
        void restartInterface();
      }}
    >
      <Icon name={day ? 'moon' : 'sun'} color={overImage ? themes.light.brand : undefined} />
    </PressableScale>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    button: {
      width: layout.touchTarget,
      height: layout.touchTarget,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: withAlpha(c.textPrimary, 0.06),
    },
    // On the painting: a light round button with dark ink, readable on red and blue alike.
    overImage: { backgroundColor: withAlpha(themes.light.surface, 0.78) },
  });
