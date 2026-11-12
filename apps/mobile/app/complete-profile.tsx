import { useState } from 'react';
import { useAuth } from '../src/auth/AuthContext';
import { checks, validate } from '../src/auth/validation';
import { AuthHeader } from '../src/components/AuthHeader';
import { mn } from '../src/i18n/mn';
import { markStartPrompt } from '../src/lib/startPrompt';
import { useSubmit } from '../src/lib/useSubmit';
import { Button, Input, Screen } from '../src/ui';

type Field = 'password' | 'lastName' | 'firstName' | 'phone';

/**
 * SPEC C: after the first Google or Apple sign-in the account exists but is locked
 * (PROFILE_INCOMPLETE) until password, name and phone are set. The username is the email and is
 * not asked (ADR-0092); Apple's name (first sign-in only) is prefilled.
 */
export default function CompleteProfile() {
  const { user, prefill, completeProfile, logout } = useAuth();
  const { pending, run } = useSubmit();
  const [values, setValues] = useState<Record<Field, string>>({
    password: '',
    lastName: prefill?.lastName ?? '',
    firstName: prefill?.firstName ?? '',
    phone: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function submit() {
    const found = validate(values, {
      password: checks.password,
      lastName: checks.name,
      firstName: checks.name,
      phone: checks.phone,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // On success the gate switches to the signed-in screens by itself.
    await run(async () => {
      // The signed-in area may offer the gift-code step once after this (ADR-0090).
      await markStartPrompt().catch(() => undefined);
      await completeProfile({
        // Not asked (ADR-0092): the username is the email, as SPEC C prefilled it before.
        username: user?.email ?? '',
        password: values.password,
        lastName: values.lastName.trim(),
        firstName: values.firstName.trim(),
        phone: values.phone.trim(),
      });
    });
  }

  return (
    <Screen>
      <AuthHeader title={mn.completeProfile.title} text={mn.completeProfile.text} />
      <Input
        label={mn.completeProfile.lastName}
        value={values.lastName}
        onChangeText={set('lastName')}
        error={errors.lastName}
        autoComplete="family-name"
        textContentType="familyName"
      />
      <Input
        label={mn.completeProfile.firstName}
        value={values.firstName}
        onChangeText={set('firstName')}
        error={errors.firstName}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <Input
        label={mn.completeProfile.phone}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <Input
        label={mn.completeProfile.password}
        hint={mn.completeProfile.passwordHint}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Button
        label={mn.completeProfile.submit}
        fullWidth
        loading={pending}
        onPress={() => void submit()}
      />
      <Button
        label={mn.completeProfile.otherAccount}
        variant="ghost"
        onPress={() => void logout()}
      />
    </Screen>
  );
}
