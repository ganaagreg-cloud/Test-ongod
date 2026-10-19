import { useCallback } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, layout, nativeFontFamily, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { useAuth } from '../../../src/auth/AuthContext';
import { env } from '../../../src/config/env';
import { useStats } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { accessState, listenedHours } from '../../../src/lib/episode';
import { portalLink } from '../../../src/lib/portalLink';
import { useBottomSpace } from '../../../src/screens/layout';
import { AccessCard } from '../../../src/screens/profile/AccessCard';
import {
  AuroraBackground,
  Button,
  Enter,
  ListItem,
  NumberTicker,
  SurfaceProvider,
} from '../../../src/ui';

/** Профайл (dark): name, access card, numbers, menu (DESIGN "Профайл", Profile.dc.html). */
export default function Profile() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = useBottomSpace();
  const stats = useStats();

  // Coming back here (e.g. after paying on the portal): fresh access and numbers.
  useFocusEffect(
    useCallback(() => {
      void refreshUser().catch(() => undefined);
      void stats.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  if (!user) return null;
  const access = accessState(user.accessUntil, new Date());
  const fullName = `${user.firstName} ${user.lastName}`.trim() || user.username;
  const termsUrl = portalLink(env.portalUrl, '/terms');
  const privacyUrl = portalLink(env.portalUrl, '/privacy');

  return (
    <SurfaceProvider surface="dark">
      <View style={styles.root}>
        <AuroraBackground variant="soft" />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xl, paddingBottom: bottom },
          ]}
        >
          <Enter index={0} style={styles.head}>
            <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
              {fullName}
            </Text>
            <Text style={styles.username}>@{user.username}</Text>
          </Enter>

          <Enter index={1}>
            <AccessCard access={access} until={user.accessUntil} />
          </Enter>

          <Enter index={2} style={styles.stats}>
            <View style={styles.stat}>
              <NumberTicker value={stats.data?.completedEpisodes ?? 0} textStyle="h1" />
              <Text style={styles.statLabel}>{mn.profile.finished}</Text>
            </View>
            <View style={styles.stat}>
              <NumberTicker value={listenedHours(stats.data?.listenedSec ?? 0)} textStyle="h1" />
              <Text style={styles.statLabel}>{mn.profile.hours}</Text>
            </View>
          </Enter>

          <Enter index={3} style={styles.menu}>
            <ListItem
              title={mn.profile.settings}
              icon="settings"
              onPress={() => router.push('/settings')}
            />
            <ListItem
              title={mn.profile.devices}
              icon="device"
              onPress={() => router.push('/settings/devices')}
            />
            {termsUrl ? (
              <ListItem
                title={mn.legal.terms}
                icon="doc"
                onPress={() => void Linking.openURL(termsUrl)}
              />
            ) : null}
            {privacyUrl ? (
              <ListItem
                title={mn.legal.privacy}
                icon="doc"
                onPress={() => void Linking.openURL(privacyUrl)}
              />
            ) : null}
          </Enter>

          {/* DEV ONLY: Expo Go cannot type a route, so the device-gate benches are one tap away
              (docs/runbooks/DEVICE_SMOKE.md). Release builds drop this block (__DEV__ is false). */}
          {__DEV__ ? (
            <View style={styles.dev}>
              <Button
                label="/dev/audio"
                variant="ghost"
                onPress={() => router.push('/dev/audio')}
              />
              <Button label="/dev/ui" variant="ghost" onPress={() => router.push('/dev/ui')} />
            </View>
          ) : null}
        </ScrollView>
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.xl },
  head: { gap: spacing.xxs },
  name: { color: colors.textPrimary, ...nativeTextStyle('display') },
  username: { color: colors.textSecondary, ...nativeTextStyle('small') },
  stats: { flexDirection: 'row', gap: spacing.md },
  stat: {
    flex: 1,
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceRaised,
  },
  statLabel: {
    color: colors.textSecondary,
    ...nativeTextStyle('caption'),
    fontFamily: nativeFontFamily.ui[500],
  },
  menu: {
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  dev: { flexDirection: 'row', gap: spacing.sm },
});
