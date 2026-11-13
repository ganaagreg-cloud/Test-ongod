import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { colors, layout, nativeFontFamily, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { useAuth } from '../../../src/auth/AuthContext';
import { env } from '../../../src/config/env';
import { useStats } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { inpayMn } from '../../../src/inpay/mn';
import { useInAppPayment } from '../../../src/inpay/useInAppPayment';
import { accessState, listenedHours } from '../../../src/lib/episode';
import { openInApp } from '../../../src/lib/openInApp';
import { portalLink } from '../../../src/lib/portalLink';
import { useBottomSpace } from '../../../src/screens/layout';
import { AccessCard } from '../../../src/screens/profile/AccessCard';
import { PushSwitch } from '../../../src/screens/profile/PushSwitch';
import {
  AuroraBackground,
  Button,
  Enter,
  ListItem,
  NumberTicker,
  Sheet,
  SurfaceProvider,
  ThemeToggle,
} from '../../../src/ui';

/**
 * Профайл (dark): name, access card, numbers, menu, then "Гарах" under the notification switch
 * (DESIGN "Профайл", ADR-0093). The gift rows exist only while the switch `inAppPayment` is on
 * (ADR-0090).
 */
export default function Profile() {
  const { user, refreshUser, logout } = useAuth();
  const paymentsOn = useInAppPayment();
  const [confirmLogout, setConfirmLogout] = useState(false);
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
  // New accounts have no username of their own (ADR-0092): it equals the email, shown plainly.
  const handle = user.username === user.email ? user.email : `@${user.username}`;
  const termsUrl = portalLink(env.portalUrl, '/app/terms');
  const privacyUrl = portalLink(env.portalUrl, '/app/privacy');

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
          <Enter index={0} style={styles.headRow}>
            <View style={styles.head}>
              <Text style={styles.name} accessibilityRole="header" numberOfLines={2}>
                {fullName}
              </Text>
              <Text style={styles.username} numberOfLines={1}>
                {handle}
              </Text>
            </View>
            {/* Day / night (ADR-0102). */}
            <ThemeToggle />
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
            <ListItem
              title={mn.profile.blocked}
              icon="profile"
              onPress={() => router.push('/settings/blocked')}
            />
            {paymentsOn ? (
              <ListItem
                title={inpayMn.redeem.row}
                icon="gift"
                onPress={() => router.push('/gift/redeem')}
              />
            ) : null}
            {paymentsOn ? (
              <ListItem title={inpayMn.gift.row} icon="gift" onPress={() => router.push('/gift')} />
            ) : null}
            <ListItem title={mn.profile.help} icon="info" onPress={() => router.push('/help')} />
            {termsUrl ? (
              <ListItem
                title={mn.legal.terms}
                icon="doc"
                onPress={() => void openInApp(termsUrl)}
              />
            ) : null}
            {privacyUrl ? (
              <ListItem
                title={mn.legal.privacy}
                icon="doc"
                onPress={() => void openInApp(privacyUrl)}
              />
            ) : null}
            <PushSwitch />
          </Enter>

          <Enter index={4}>
            <Button
              label={mn.profile.logout}
              variant="secondary"
              icon="logout"
              fullWidth
              onPress={() => setConfirmLogout(true)}
            />
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
        <Sheet
          visible={confirmLogout}
          onClose={() => setConfirmLogout(false)}
          title={mn.profile.logoutTitle}
          closeLabel={mn.close}
        >
          <Text style={styles.sheetText}>{mn.profile.logoutText}</Text>
          <Button
            label={mn.profile.logout}
            icon="logout"
            fullWidth
            onPress={() => {
              setConfirmLogout(false);
              void logout();
            }}
          />
          <Button
            label={mn.common.cancel}
            variant="ghost"
            fullWidth
            onPress={() => setConfirmLogout(false)}
          />
        </Sheet>
      </View>
    </SurfaceProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.xl },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  head: { flex: 1, gap: spacing.xxs },
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
  sheetText: { color: colors.textSecondary, ...nativeTextStyle('body') },
  dev: { flexDirection: 'row', gap: spacing.sm },
});
