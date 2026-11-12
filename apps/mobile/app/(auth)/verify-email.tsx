import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { api } from '../../src/api';
import { useAuth } from '../../src/auth/AuthContext';
import { takeSignIn } from '../../src/auth/pendingSignIn';
import { checks } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { mn } from '../../src/i18n/mn';
import { markStartPrompt } from '../../src/lib/startPrompt';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, CodeInput, Screen, useToast } from '../../src/ui';

/** Seconds before a new code can be requested (the server enforces the same 60 s, SPEC A). */
const RESEND_SECONDS = 60;

const styles = StyleSheet.create({
  resend: { gap: spacing.xxs },
  noCode: { color: colors.textTertiary, ...nativeTextStyle('small') },
});

export default function VerifyEmail() {
  const router = useRouter();
  const toast = useToast();
  const { login } = useAuth();
  const { email = '' } = useLocalSearchParams<{ email?: string }>();
  const { pending, run } = useSubmit();
  const resend = useSubmit();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  // The first code was sent a moment ago by registering, so the wait starts now.
  const [wait, setWait] = useState(RESEND_SECONDS);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function submit(value: string) {
    const problem = checks.code(value);
    setError(problem);
    if (problem) return;
    await run(async () => {
      await api.verifyEmail({ email, code: value });
      // The next start of the signed-in area may offer the gift-code step once (ADR-0090).
      await markStartPrompt().catch(() => undefined);
      // Straight in when this phone just made the account (ADR-0092); otherwise the login screen.
      const password = takeSignIn(email);
      if (password !== null) {
        try {
          // 'ok': the gate switches to the signed-in screens by itself.
          if ((await login(email, password)) === 'deviceLimit') router.push('/device-limit');
          return;
        } catch {
          // Fall back to typing the password on the login screen.
        }
      }
      router.replace({ pathname: '/login', params: { email, notice: 'verified' } });
    });
  }

  return (
    <Screen>
      <AuthHeader icon="mail" title={mn.verify.title} text={mn.verify.text(email)} />
      <CodeInput
        label={mn.verify.code}
        value={code}
        error={error}
        autoFocus
        onChange={(value) => {
          setCode(value);
          setError(undefined);
          // The last digit sends the code, so there is nothing more to tap.
          if (value.length === 6) void submit(value);
        }}
      />
      <View style={styles.resend}>
        <Text style={styles.noCode}>{mn.verify.noCode}</Text>
        <Button
          label={wait > 0 ? mn.verify.resendIn(wait) : mn.verify.resend}
          variant="ghost"
          disabled={wait > 0}
          loading={resend.pending}
          onPress={() =>
            void resend.run(async () => {
              await api.resendCode(email);
              setWait(RESEND_SECONDS);
              toast.show(mn.verify.resent, { tone: 'success' });
            })
          }
        />
      </View>
      <Button
        label={mn.verify.submit}
        fullWidth
        loading={pending}
        onPress={() => void submit(code)}
      />
    </Screen>
  );
}
