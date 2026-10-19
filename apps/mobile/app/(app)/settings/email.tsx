import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { colors, nativeTextStyle } from '@ongod/tokens';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth/AuthContext';
import { checks, required, validate } from '../../../src/auth/validation';
import { mn } from '../../../src/i18n/mn';
import { useSubmit } from '../../../src/lib/useSubmit';
import { BackHeader } from '../../../src/screens/BackHeader';
import { Button, CodeInput, Input, Screen, useToast } from '../../../src/ui';

/** Имэйл солих (SPEC H): new address + password, then the 6-digit code sent to the new address. */
export default function ChangeEmail() {
  const router = useRouter();
  const toast = useToast();
  const { updateUser } = useAuth();
  const { pending, run } = useSubmit();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ newEmail?: string; password?: string }>({});
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();

  async function send() {
    const problems = validate(
      { newEmail, password },
      { newEmail: checks.email, password: required },
    );
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const address = newEmail.trim().toLowerCase();
    if (await run(() => api.changeEmail({ newEmail: address, password }))) setSentTo(address);
  }

  async function verify(value: string) {
    const problem = checks.code(value);
    setCodeError(problem);
    if (problem) return;
    const done = await run(async () => {
      const { user } = await api.verifyEmailChange(value);
      updateUser(user);
    });
    if (done) {
      toast.show(mn.changeEmail.done, { tone: 'success' });
      router.back();
    }
  }

  if (sentTo) {
    return (
      <Screen>
        <BackHeader title={mn.changeEmail.title} />
        <Text style={styles.text}>{mn.changeEmail.codeText(sentTo)}</Text>
        <CodeInput
          label={mn.changeEmail.code}
          value={code}
          error={codeError}
          autoFocus
          onChange={(value) => {
            setCode(value);
            setCodeError(undefined);
            if (value.length === 6) void verify(value);
          }}
        />
        <Button
          label={mn.changeEmail.verify}
          fullWidth
          loading={pending}
          onPress={() => void verify(code)}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackHeader title={mn.changeEmail.title} />
      <Text style={styles.text}>{mn.changeEmail.text}</Text>
      <Input
        label={mn.changeEmail.newEmail}
        value={newEmail}
        onChangeText={setNewEmail}
        error={errors.newEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Input
        label={mn.changeEmail.password}
        value={password}
        onChangeText={setPassword}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="send"
        onSubmitEditing={() => void send()}
      />
      <Button label={mn.changeEmail.send} fullWidth loading={pending} onPress={() => void send()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
