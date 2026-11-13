import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { api, ApiError } from '../../src/api';
import { useAuth } from '../../src/auth/AuthContext';
import { holdSignIn } from '../../src/auth/pendingSignIn';
import { checks, validate } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { SocialButtons } from '../../src/components/SocialButtons';
import { mn } from '../../src/i18n/mn';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, Input, PortraitBackground, Screen, TextLink, useToast } from '../../src/ui';

/** The email of an account whose login was refused because it is not confirmed yet, else null. */
function unverifiedEmailOf(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code !== 'EMAIL_NOT_VERIFIED') return null;
  const email = (error.details as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email : null;
}

/**
 * After the email code or a password reset the flow comes back to this screen with the email
 * and a notice. The form is keyed by them, so it starts again from the new values whether it is a
 * fresh screen or the one already waiting in the stack (the reset flow returns to it).
 */
export default function Login() {
  const { email, notice } = useLocalSearchParams<{ email?: string; notice?: string }>();
  return <LoginForm key={`${email ?? ''}|${notice ?? ''}`} email={email} notice={notice} />;
}

function LoginForm({ email, notice }: { email: string | undefined; notice: string | undefined }) {
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const { pending, run } = useSubmit();

  const [identifier, setIdentifier] = useState(email ?? '');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});

  // A short confirmation, once per arrival.
  const noticeShown = useRef(false);
  useEffect(() => {
    if (noticeShown.current) return;
    noticeShown.current = true;
    if (notice === 'verified') toast.show(mn.login.verified, { tone: 'success' });
    if (notice === 'reset') toast.show(mn.login.passwordReset, { tone: 'success' });
  }, [notice, toast]);

  async function submit() {
    const found = validate(
      { identifier, password },
      { identifier: checks.identifier, password: checks.loginPassword },
    );
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    await run(async () => {
      try {
        // 'ok': the gate switches to the signed-in screens by itself. 'deviceLimit': pick one to remove.
        if ((await login(identifier, password)) === 'deviceLimit') router.push('/device-limit');
      } catch (error) {
        // ADR-0097: no way in before the email is confirmed. Send a fresh code (the 60 s wait may
        // refuse it: the earlier code still works) and go to the code step; the right code signs in.
        const email = unverifiedEmailOf(error);
        if (!email) throw error;
        await api.resendCode(email).catch(() => undefined);
        holdSignIn(email, password);
        router.push({ pathname: '/verify-email', params: { email } });
      }
    });
  }

  return (
    <Screen background={<PortraitBackground />}>
      <AuthHeader title={mn.login.title} hero />
      <Input
        label={mn.login.identifier}
        value={identifier}
        onChangeText={setIdentifier}
        error={errors.identifier}
        autoCapitalize="none"
        autoComplete="username"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
      />
      <View>
        <Input
          label={mn.login.password}
          value={password}
          onChangeText={setPassword}
          error={errors.password}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
        />
        <TextLink label={mn.login.forgot} onPress={() => router.push('/forgot-password')} />
      </View>
      <Button label={mn.login.submit} fullWidth loading={pending} onPress={() => void submit()} />
      <SocialButtons />
      <View style={styles.footer}>
        <Text style={styles.footerText}>{mn.login.noAccount}</Text>
        <TextLink
          label={mn.login.register}
          align="start"
          onPress={() => router.replace('/register')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  footerText: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
