import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, nativeTextStyle, spacing } from '@ongod/tokens';
import { mn } from '../../src/i18n/mn';
import { Button, MountainLine } from '../../src/ui';

/** DESIGN.md "Auth: Welcome": motif, app name in the display font, Login primary, Register secondary. */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.hero}>
        <MountainLine />
        <Text style={styles.name} accessibilityRole="header">
          {mn.appName}
        </Text>
        <Text style={styles.subtitle}>{mn.welcome.subtitle}</Text>
      </View>
      <View style={styles.actions}>
        <Button label={mn.welcome.login} fullWidth onPress={() => router.push('/login')} />
        <Button
          label={mn.welcome.register}
          variant="secondary"
          fullWidth
          onPress={() => router.push('/register')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: colors.bg,
    paddingHorizontal: layout.screenPadding,
  },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
  name: { color: colors.textPrimary, ...nativeTextStyle('display') },
  subtitle: { color: colors.textSecondary, textAlign: 'center', ...nativeTextStyle('body') },
  actions: { gap: spacing.sm },
});
