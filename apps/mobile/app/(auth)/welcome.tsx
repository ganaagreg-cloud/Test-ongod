import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, nativeTextStyle, spacing, themes, withAlpha } from '@ongod/tokens';
import { CoverMarquee } from '../../src/components/CoverMarquee';
import { mn } from '../../src/i18n/mn';
import { AuroraBackground, Button, Enter, MountainLine, SurfaceProvider } from '../../src/ui';

const dark = themes.dark;

/**
 * Main.dc.html: aurora light, three rows of cover tiles drifting behind, the mountain line that
 * draws itself, the title and text, then gold "Нэвтрэх" (with a sheen) and "Бүртгүүлэх". The
 * pieces enter one after the other.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="welcome" />
        <CoverMarquee />
        {/* The rows sink into the dark at the bottom (the top row is faint, see CoverMarquee). */}
        <LinearGradient
          pointerEvents="none"
          colors={[withAlpha(dark.bg, 0), withAlpha(dark.bg, 0.85), dark.bg]}
          locations={[0, 0.32, 0.55]}
          style={styles.bottomFade}
        />
        <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
          <MountainLine draw color={dark.accent} />
          <Enter index={1}>
            <Text style={styles.name} accessibilityRole="header">
              {mn.appName}
            </Text>
          </Enter>
          <Enter index={2}>
            <Text style={styles.subtitle}>{mn.welcome.subtitle}</Text>
          </Enter>
          <Enter index={3} style={styles.actions}>
            <Button label={mn.welcome.login} sheen fullWidth onPress={() => router.push('/login')} />
            <Button
              label={mn.welcome.register}
              variant="secondary"
              fullWidth
              onPress={() => router.push('/register')}
            />
          </Enter>
        </View>
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: dark.bg },
  bottomFade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '62%' },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding + spacing.xxs,
  },
  name: {
    color: dark.textPrimary,
    textAlign: 'center',
    letterSpacing: layout.heroTracking,
    ...nativeTextStyle('hero'),
  },
  subtitle: {
    maxWidth: layout.welcomeTextMax,
    color: dark.textSecondary,
    textAlign: 'center',
    ...nativeTextStyle('body'),
  },
  actions: { alignSelf: 'stretch', gap: spacing.sm, marginTop: spacing.lg },
});
