import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { useAuth } from '../../src/auth/AuthContext';
import { mn } from '../../src/i18n/mn';
import { Button, Screen } from '../../src/ui';

/** Placeholder for the signed-in area until the library screens are built. */
export default function Home() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const name = user ? `${user.firstName}`.trim() || user.username : '';
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {mn.home.greeting(name)}
      </Text>
      <Text style={styles.text}>{mn.home.soon}</Text>
      <Button label={mn.home.logout} variant="secondary" fullWidth onPress={() => void logout()} />
      {/* DEV ONLY: Expo Go has no way to type a route, so the device-gate benches are one tap away
          (docs/runbooks/DEVICE_SMOKE.md). Release builds drop this block (__DEV__ is false). */}
      {__DEV__ ? (
        <View style={styles.dev}>
          <Button label="/dev/audio" variant="ghost" onPress={() => router.push('/dev/audio')} />
          <Button label="/dev/ui" variant="ghost" onPress={() => router.push('/dev/ui')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, ...nativeTextStyle('display') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
  dev: { flexDirection: 'row', gap: spacing.sm },
});
