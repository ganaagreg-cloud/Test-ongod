import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '@ongod/tokens';
import { useAuth } from '../../src/auth/AuthContext';
import { AuthHeader } from '../../src/components/AuthHeader';
import { mn } from '../../src/i18n/mn';
import { deviceLabel, formatDate } from '../../src/lib/format';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, ListItem, Screen } from '../../src/ui';

/**
 * SPEC B: the 3rd device is refused with the list of the other two. Removing one finishes the
 * login that was refused (the password, or the Google/Apple token, is the confirmation).
 */
export default function DeviceLimit() {
  const router = useRouter();
  const { phase, deviceLimit, clearDeviceLimit } = useAuth();
  const { pending, run } = useSubmit();

  // Nothing to choose from (opened directly). After a successful removal the gate takes over, so
  // only a signed-out user is sent back to the login form.
  useEffect(() => {
    if (!deviceLimit && phase === 'signedOut') router.replace('/login');
  }, [deviceLimit, phase, router]);

  if (!deviceLimit) return null;

  return (
    <Screen>
      <AuthHeader title={mn.deviceLimit.title} text={mn.deviceLimit.text} />
      {deviceLimit.devices.map((device) => (
        <View key={device.id} style={styles.device}>
          <ListItem
            title={deviceLabel(device.platform, device.model)}
            value={mn.deviceLimit.lastSeen(formatDate(device.lastSeenAt))}
          />
          <Button
            label={mn.deviceLimit.remove}
            variant="secondary"
            fullWidth
            loading={pending}
            onPress={() => void run(() => deviceLimit.retry(device.id))}
          />
        </View>
      ))}
      <Button
        label={mn.common.cancel}
        variant="ghost"
        onPress={() => {
          clearDeviceLimit();
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  device: { gap: spacing.xs },
});
