import { useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '../../../src/api';
import { checks, required, validate } from '../../../src/auth/validation';
import { mn } from '../../../src/i18n/mn';
import { useSubmit } from '../../../src/lib/useSubmit';
import { BackHeader } from '../../../src/screens/BackHeader';
import { Button, Input, Screen, useToast } from '../../../src/ui';

/** Нууц үг солих (SPEC H): the other devices are signed out, this one stays. */
export default function ChangePassword() {
  const router = useRouter();
  const toast = useToast();
  const { pending, run } = useSubmit();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<{ current?: string; next?: string }>({});

  async function submit() {
    const problems = validate({ current, next }, { current: required, next: checks.password });
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const done = await run(() =>
      api.changePassword({ currentPassword: current, newPassword: next }),
    );
    if (done) {
      toast.show(mn.changePassword.done, { tone: 'success' });
      router.back();
    }
  }

  return (
    <Screen>
      <BackHeader title={mn.changePassword.title} />
      <Input
        label={mn.changePassword.current}
        value={current}
        onChangeText={setCurrent}
        error={errors.current}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
      />
      <Input
        label={mn.changePassword.next}
        value={next}
        onChangeText={setNext}
        error={errors.next}
        hint={mn.changePassword.nextHint}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      <Button
        label={mn.changePassword.submit}
        fullWidth
        loading={pending}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
