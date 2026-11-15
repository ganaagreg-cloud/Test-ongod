import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, nativeTextStyle, spacing, themes } from '@ongod/tokens';
import { env } from '../../src/config/env';
import { mn } from '../../src/i18n/mn';
import { openInApp } from '../../src/lib/openInApp';
import { themeMode } from '../../src/theme/boot';
import { portalLink } from '../../src/lib/portalLink';
import {
  AuroraBackground,
  Button,
  Enter,
  MountainLine,
  PortraitBackground,
  PressableScale,
  SurfaceProvider,
  ThemeToggle,
} from '../../src/ui';

const dark = themes.dark;
/** Below this screen height (iPhone SE and small Android phones) the mountain line is left out. */
const COMPACT_HEIGHT = 700;

/**
 * Main.dc.html: aurora light, the client's painting at the top fading into the page (ADR-0102),
 * the mountain line that draws itself, the title and text, then gold "Нэвтрэх" (with a sheen) and "Бүртгүүлэх". The
 * pieces enter one after the other.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // The height of the text block, so the painting stops where the text starts (short phones).
  const [contentHeight, setContentHeight] = useState(0);
  const compact = height < COMPACT_HEIGHT;
  // Hidden until the portal address is set (EXPO_PUBLIC_PORTAL_URL).
  const termsUrl = portalLink(env.portalUrl, '/app/terms', themeMode);
  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="welcome" />
        {/* The client's painting, fading into the page (ADR-0102). */}
        <PortraitBackground
          cover={contentHeight > 0 ? height - contentHeight + spacing.xl : undefined}
        />
        <View style={[styles.toggle, { top: insets.top + spacing.sm }]}>
          <ThemeToggle overImage />
        </View>
        <View
          onLayout={(e) => setContentHeight(e.nativeEvent.layout.height)}
          style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        >
          {compact ? null : <MountainLine draw color={dark.accent} />}
          <Enter index={1}>
            <Text style={styles.name} accessibilityRole="header">
              {mn.appName}
            </Text>
          </Enter>
          <Enter index={2}>
            <Text style={styles.subtitle}>{mn.welcome.subtitle}</Text>
          </Enter>
          <Enter index={3} style={styles.actions}>
            <Button
              label={mn.welcome.login}
              sheen
              fullWidth
              onPress={() => router.push('/login')}
            />
            <Button
              label={mn.welcome.register}
              variant="secondary"
              fullWidth
              onPress={() => router.push('/register')}
            />
          </Enter>
          {termsUrl ? (
            <Enter index={4}>
              <PressableScale
                accessibilityRole="link"
                accessibilityLabel={`${mn.legal.agreeBefore}${mn.legal.terms}${mn.legal.agreeAfter}`}
                onPress={() => void openInApp(termsUrl)}
                haptics={false}
                style={styles.terms}
              >
                <Text style={styles.termsText}>
                  {mn.legal.agreeBefore}
                  <Text style={styles.termsLink}>{mn.legal.terms}</Text>
                  {mn.legal.agreeAfter}
                </Text>
              </PressableScale>
            </Enter>
          ) : null}
        </View>
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden', backgroundColor: dark.bg },
  toggle: { position: 'absolute', right: layout.screenPadding },
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
  terms: { minHeight: layout.touchTarget, justifyContent: 'center' },
  termsText: { color: dark.textTertiary, textAlign: 'center', ...nativeTextStyle('caption') },
  termsLink: { textDecorationLine: 'underline' },
});
