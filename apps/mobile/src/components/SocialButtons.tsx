import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, layout, nativeTextStyle, spacing } from '@ongod/tokens';
import { googleConfigured, isAppleAvailable } from '../auth/social';
import { useAuth, type LoginOutcome } from '../auth/AuthContext';
import { useAppConfig } from '../config/useAppConfig';
import { mn } from '../i18n/mn';
import { useSubmit } from '../lib/useSubmit';
import { Button } from '../ui';
import { AppleButton } from './AppleButton';

/**
 * Google on both platforms and Sign in with Apple on iOS, only when the server has
 * SOCIAL_LOGIN on (SPEC C, ADR-0009). App Review 4.8: if Google is offered on iOS, Apple must be
 * too, so on iOS Google is hidden when Apple is not available. Apple's own button is used
 * because Apple's guidelines ask for it.
 */
export function SocialButtons() {
  const router = useRouter();
  const auth = useAuth();
  const { socialLogin } = useAppConfig();
  const { pending, run } = useSubmit();
  const [appleOk, setAppleOk] = useState(false);

  useEffect(() => {
    void isAppleAvailable().then(setAppleOk);
  }, []);

  const showApple = socialLogin && appleOk;
  const showGoogle = socialLogin && googleConfigured && (Platform.OS !== 'ios' || appleOk);
  if (!showGoogle && !showApple) return null;

  const done = (outcome: LoginOutcome) => {
    if (outcome === 'deviceLimit') router.push('/device-limit');
  };

  return (
    <View style={styles.box}>
      <View style={styles.divider} accessibilityElementsHidden>
        <View style={styles.line} />
        <Text style={styles.or}>{mn.common.or}</Text>
        <View style={styles.line} />
      </View>
      {showApple ? (
        <AppleButton onPress={() => void run(async () => done(await auth.loginWithApple()))} />
      ) : null}
      {showGoogle ? (
        <Button
          label={mn.social.google}
          variant="secondary"
          fullWidth
          loading={pending}
          onPress={() => void run(async () => done(await auth.loginWithGoogle()))}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  line: { flex: 1, height: layout.borderWidth, backgroundColor: colors.hairline },
  or: { color: colors.textTertiary, ...nativeTextStyle('small') },
});
