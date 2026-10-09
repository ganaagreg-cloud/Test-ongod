import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { ApiError } from '../../src/api';
import { useAuth } from '../../src/auth/AuthContext';
import { checks, validate } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { SocialButtons } from '../../src/components/SocialButtons';
import { mn } from '../../src/i18n/mn';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, Input, Screen } from '../../src/ui';

type Field = 'lastName' | 'firstName' | 'phone' | 'email' | 'username' | 'password';

export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const { pending, run } = useSubmit();
  const [values, setValues] = useState<Record<Field, string>>({
    lastName: '',
    firstName: '',
    phone: '',
    email: '',
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (value: string) => setValues((v) => ({ ...v, [field]: value }));

  async function submit() {
    const found = validate(values, {
      lastName: checks.name,
      firstName: checks.name,
      phone: checks.phone,
      email: checks.email,
      username: checks.optionalUsername,
      password: checks.password,
    });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    const email = values.email.trim().toLowerCase();
    const username = values.username.trim();
    await run(async () => {
      try {
        await register({
          lastName: values.lastName.trim(),
          firstName: values.firstName.trim(),
          phone: values.phone.trim(),
          email,
          ...(username ? { username } : {}),
          password: values.password,
        });
      } catch (error) {
        // A taken email or username belongs under its field, not in a toast.
        if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
          setErrors({ email: error.message });
          return;
        }
        if (error instanceof ApiError && error.code === 'USERNAME_TAKEN') {
          setErrors({ username: error.message });
          return;
        }
        throw error;
      }
      router.replace({ pathname: '/verify-email', params: { email } });
    });
  }

  return (
    <Screen>
      <AuthHeader title={mn.register.title} />
      <Input
        label={mn.register.lastName}
        value={values.lastName}
        onChangeText={set('lastName')}
        error={errors.lastName}
        autoComplete="family-name"
        textContentType="familyName"
      />
      <Input
        label={mn.register.firstName}
        value={values.firstName}
        onChangeText={set('firstName')}
        error={errors.firstName}
        autoComplete="given-name"
        textContentType="givenName"
      />
      <Input
        label={mn.register.phone}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <Input
        label={mn.register.email}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
      />
      <Input
        label={mn.register.username}
        hint={mn.register.usernameHint}
        value={values.username}
        onChangeText={set('username')}
        error={errors.username}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="username"
      />
      <Input
        label={mn.register.password}
        hint={mn.register.passwordHint}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <Button
        label={mn.register.submit}
        fullWidth
        loading={pending}
        onPress={() => void submit()}
      />
      <SocialButtons />
      <View style={styles.footer}>
        <Text style={styles.footerText}>{mn.register.haveAccount}</Text>
        <Button
          label={mn.register.login}
          variant="ghost"
          onPress={() => router.replace('/login')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  footerText: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
