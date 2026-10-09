import { useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../src/api';
import { checks } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { mn } from '../../src/i18n/mn';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, Input, Screen, useToast } from '../../src/ui';

export default function ForgotPassword() {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useSubmit();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();

  async function submit() {
    const problem = checks.email(email);
    setError(problem);
    if (problem) return;
    const address = email.trim().toLowerCase();
    await run(async () => {
      // The answer is the same whether or not the address is registered.
      await api.forgotPassword(address);
      toast.show(mn.forgot.sent, { tone: 'success' });
      router.replace({ pathname: '/reset-password', params: { email: address } });
    });
  }

  return (
    <Screen>
      <AuthHeader title={mn.forgot.title} text={mn.forgot.text} />
      <Input
        label={mn.forgot.email}
        value={email}
        onChangeText={setEmail}
        error={error}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={() => void submit()}
      />
      <Button label={mn.forgot.submit} fullWidth loading={pending} onPress={() => void submit()} />
      <Button
        label={mn.forgot.haveCode}
        variant="ghost"
        onPress={() => router.replace({ pathname: '/reset-password', params: { email } })}
      />
    </Screen>
  );
}
