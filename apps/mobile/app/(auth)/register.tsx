import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactElement } from 'react';
import { BackHandler, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, nativeTextStyle, spacing } from '@ongod/tokens';
import { ApiError } from '../../src/api';
import { useAuth } from '../../src/auth/AuthContext';
import { holdSignIn } from '../../src/auth/pendingSignIn';
import { checks, type Check } from '../../src/auth/validation';
import { AuthHeader } from '../../src/components/AuthHeader';
import { SocialButtons } from '../../src/components/SocialButtons';
import { StepDots } from '../../src/components/StepDots';
import { mn } from '../../src/i18n/mn';
import { useSubmit } from '../../src/lib/useSubmit';
import { Button, Input, Screen } from '../../src/ui';

type Field = 'lastName' | 'firstName' | 'phone' | 'email' | 'password' | 'passwordAgain';

/** What each step asks for, in order (ADR-0092). The username is not asked: it is the email. */
const STEPS: ReadonlyArray<{ title: string; text: string; fields: readonly Field[] }> = [
  { title: mn.register.nameTitle, text: mn.register.nameText, fields: ['lastName', 'firstName'] },
  { title: mn.register.contactTitle, text: mn.register.contactText, fields: ['email', 'phone'] },
  {
    title: mn.register.passwordTitle,
    text: mn.register.passwordText,
    fields: ['password', 'passwordAgain'],
  },
];
const LAST = STEPS.length - 1;
const CONTACT_STEP = 1;

/**
 * Register in three short steps: name, contact, password (ADR-0092, SPEC A). Each step checks
 * only its own fields; the last one sends everything, then the email-code screen follows.
 */
export default function Register() {
  const router = useRouter();
  const { register } = useAuth();
  const { pending, run } = useSubmit();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Field, string>>({
    lastName: '',
    firstName: '',
    phone: '',
    email: '',
    password: '',
    passwordAgain: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = (field: Field) => (value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  // Android's back button goes one step back, not out of the form.
  useEffect(() => {
    if (step === 0 || Platform.OS !== 'android') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setStep((s) => Math.max(0, s - 1));
      return true;
    });
    return () => sub.remove();
  }, [step]);

  const rules: Record<Field, Check> = {
    lastName: checks.name,
    firstName: checks.name,
    phone: checks.phone,
    email: checks.email,
    password: checks.password,
    passwordAgain: (value) =>
      value === values.password ? undefined : mn.register.passwordMismatch,
  };

  /** Checks the fields of one step; true when they are all fine. */
  function stepIsValid(index: number): boolean {
    const found: Partial<Record<Field, string>> = {};
    for (const field of STEPS[index]!.fields) {
      const message = rules[field](values[field]);
      if (message) found[field] = message;
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  async function next() {
    if (!stepIsValid(step)) return;
    if (step < LAST) {
      setStep(step + 1);
      return;
    }
    const email = values.email.trim().toLowerCase();
    await run(async () => {
      try {
        await register({
          lastName: values.lastName.trim(),
          firstName: values.firstName.trim(),
          phone: values.phone.trim(),
          email,
          password: values.password,
        });
      } catch (error) {
        // A taken email belongs under its field, on its own step, not in a toast.
        if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') {
          setStep(CONTACT_STEP);
          setErrors({ email: error.message });
          return;
        }
        throw error;
      }
      // In memory only: lets the email-code screen sign the new member in (no second password).
      holdSignIn(email, values.password);
      router.replace({ pathname: '/verify-email', params: { email } });
    });
  }

  const current = STEPS[step]!;
  const fields: Record<Field, ReactElement> = {
    lastName: (
      <Input
        key="lastName"
        label={mn.register.lastName}
        value={values.lastName}
        onChangeText={set('lastName')}
        error={errors.lastName}
        autoComplete="family-name"
        textContentType="familyName"
        returnKeyType="next"
      />
    ),
    firstName: (
      <Input
        key="firstName"
        label={mn.register.firstName}
        value={values.firstName}
        onChangeText={set('firstName')}
        error={errors.firstName}
        autoComplete="given-name"
        textContentType="givenName"
        returnKeyType="next"
        onSubmitEditing={() => void next()}
      />
    ),
    email: (
      <Input
        key="email"
        label={mn.register.email}
        value={values.email}
        onChangeText={set('email')}
        error={errors.email}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
    ),
    phone: (
      <Input
        key="phone"
        label={mn.register.phone}
        value={values.phone}
        onChangeText={set('phone')}
        error={errors.phone}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
    ),
    password: (
      <Input
        key="password"
        label={mn.register.password}
        hint={mn.register.passwordHint}
        value={values.password}
        onChangeText={set('password')}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
      />
    ),
    passwordAgain: (
      <Input
        key="passwordAgain"
        label={mn.register.passwordAgain}
        value={values.passwordAgain}
        onChangeText={set('passwordAgain')}
        error={errors.passwordAgain}
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void next()}
      />
    ),
  };

  return (
    <Screen>
      <AuthHeader
        key={`head-${step}`}
        title={current.title}
        text={current.text}
        onBack={step > 0 ? () => setStep(step - 1) : undefined}
      />
      <StepDots
        step={step + 1}
        total={STEPS.length}
        label={mn.register.step(step + 1, STEPS.length)}
      />
      {fields[current.fields[0]!]}
      {fields[current.fields[1]!]}
      <Button
        label={step < LAST ? mn.register.next : mn.register.submit}
        fullWidth
        loading={pending}
        onPress={() => void next()}
      />
      {step === 0 ? <SocialButtons /> : null}
      {step === 0 ? (
        <View style={styles.footer}>
          <Text style={styles.footerText}>{mn.register.haveAccount}</Text>
          <Button
            label={mn.register.login}
            variant="ghost"
            onPress={() => router.replace('/login')}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  footerText: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
