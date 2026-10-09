import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { api } from '../../src/api';
import { checks, validate } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { mn } from '../../src/i18n/mn';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, CodeInput, Input, Screen } from '../../src/ui';

export default function ResetPassword() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string }>();
  const { pending, run } = useSubmit();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; code?: string; newPassword?: string }>({});

  async function submit() {
    const found = validate(
      { email, code, newPassword },
      { email: checks.email, code: checks.code, newPassword: checks.password },
    );
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const address = email.trim().toLowerCase();
    await run(async () => {
      await api.resetPassword({ email: address, code, newPassword });
      // Back to the login screen that is already in the stack (login > forgot > reset), so
      // "back" from the login never shows a second, empty login.
      router.dismissTo({ pathname: '/login', params: { email: address, notice: 'reset' } });
    });
  }

  return (
    <Screen>
      <AuthHeader title={mn.reset.title} />
      <Input
        label={mn.reset.email}
        value={email}
        onChangeText={setEmail}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <CodeInput
        label={mn.reset.code}
        value={code}
        error={errors.code}
        autoFocus={Boolean(params.email)}
        onChange={setCode}
      />
      <Input
        label={mn.reset.newPassword}
        hint={mn.register.passwordHint}
        value={newPassword}
        onChangeText={setNewPassword}
        error={errors.newPassword}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
      />
      <Button label={mn.reset.submit} fullWidth loading={pending} onPress={() => void submit()} />
    </Screen>
  );
}
