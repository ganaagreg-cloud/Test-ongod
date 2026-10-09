import { StyleSheet, Text } from 'react-native';
import { colors, nativeTextStyle } from '@ongod/tokens';
import { useAuth } from '../../src/auth/AuthContext';
import { mn } from '../../src/i18n/mn';
import { Button, Screen } from '../../src/ui';

/** Placeholder for the signed-in area until the library screens are built. */
export default function Home() {
  const { user, logout } = useAuth();
  const name = user ? `${user.firstName}`.trim() || user.username : '';
  return (
    <Screen>
      <Text style={styles.title} accessibilityRole="header">
        {mn.home.greeting(name)}
      </Text>
      <Text style={styles.text}>{mn.home.soon}</Text>
      <Button label={mn.home.logout} variant="secondary" fullWidth onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.textPrimary, ...nativeTextStyle('display') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
