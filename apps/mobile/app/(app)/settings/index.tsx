import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { UpdateProfileRequest } from '@ongod/shared';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { api } from '../../../src/api';
import { useAuth } from '../../../src/auth/AuthContext';
import { checks, validate } from '../../../src/auth/validation';
import { mn } from '../../../src/i18n/mn';
import { useSubmit } from '../../../src/lib/useSubmit';
import { BackHeader } from '../../../src/screens/BackHeader';
import { Button, Input, ListItem, Screen, Sheet, useToast } from '../../../src/ui';

type Field = 'lastName' | 'firstName' | 'phone';

/**
 * Тохиргоо (DESIGN): personal information (name, phone; ADR-0039), username (read-only), email
 * and password changes, devices, "Гарах" and "Бүртгэл устгах" (two confirmations, SPEC H).
 */
export default function Settings() {
  const { user, updateUser, logout, deleteAccount } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const save = useSubmit();
  const remove = useSubmit();
  const [form, setForm] = useState<Record<Field, string>>({
    lastName: user?.lastName ?? '',
    firstName: user?.firstName ?? '',
    phone: user?.phone ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);

  if (!user) return null;

  const set = (field: Field) => (value: string) => setForm((f) => ({ ...f, [field]: value }));
  const changes: UpdateProfileRequest = {};
  for (const field of ['lastName', 'firstName', 'phone'] as const) {
    if (form[field].trim() !== user[field]) changes[field] = form[field].trim();
  }
  const dirty = Object.keys(changes).length > 0;

  async function submit() {
    const problems = validate(form, {
      lastName: checks.name,
      firstName: checks.name,
      phone: checks.phone,
    });
    setErrors(problems);
    if (Object.keys(problems).length > 0 || !dirty) return;
    await save.run(async () => {
      const { user: updated } = await api.updateProfile(changes);
      updateUser(updated);
      toast.show(mn.settings.saved, { tone: 'success' });
    });
  }

  return (
    <Screen>
      <BackHeader title={mn.settings.title} />

      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">
          {mn.settings.personal}
        </Text>
        <Input
          label={mn.settings.lastName}
          value={form.lastName}
          onChangeText={set('lastName')}
          error={errors.lastName}
          autoComplete="family-name"
          textContentType="familyName"
        />
        <Input
          label={mn.settings.firstName}
          value={form.firstName}
          onChangeText={set('firstName')}
          error={errors.firstName}
          autoComplete="given-name"
          textContentType="givenName"
        />
        <Input
          label={mn.settings.phone}
          value={form.phone}
          onChangeText={set('phone')}
          error={errors.phone}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
        />
        <Button
          label={mn.settings.save}
          fullWidth
          disabled={!dirty}
          loading={save.pending}
          onPress={() => void submit()}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.heading} accessibilityRole="header">
          {mn.settings.account}
        </Text>
        <View style={styles.group}>
          <ListItem title={mn.settings.username} value={user.username} />
          <ListItem
            title={mn.settings.email}
            value={user.email}
            onPress={() => router.push('/settings/email')}
          />
          <ListItem
            title={mn.settings.changePassword}
            onPress={() => router.push('/settings/password')}
          />
          <ListItem title={mn.profile.devices} onPress={() => router.push('/settings/devices')} />
        </View>
        <Text style={styles.hint}>{mn.settings.usernameHint}</Text>
      </View>

      <Button
        label={mn.settings.logout}
        variant="secondary"
        icon="logout"
        fullWidth
        onPress={() => void logout()}
      />
      <Button
        label={mn.settings.deleteAccount}
        variant="destructive"
        fullWidth
        onPress={() => setDeleteStep(1)}
      />

      <Sheet
        visible={deleteStep === 1}
        onClose={() => setDeleteStep(0)}
        title={mn.settings.deleteTitle}
        closeLabel={mn.close}
      >
        <Text style={styles.text}>{mn.settings.deleteText}</Text>
        <Button
          label={mn.settings.deleteNext}
          variant="destructive"
          fullWidth
          onPress={() => setDeleteStep(2)}
        />
        <Button
          label={mn.common.cancel}
          variant="ghost"
          fullWidth
          onPress={() => setDeleteStep(0)}
        />
      </Sheet>
      <Sheet
        visible={deleteStep === 2}
        onClose={() => setDeleteStep(0)}
        title={mn.settings.deleteConfirmTitle}
        closeLabel={mn.close}
      >
        <Text style={styles.text}>{mn.settings.deleteConfirmText}</Text>
        <Button
          label={mn.settings.deleteConfirm}
          variant="destructive"
          fullWidth
          loading={remove.pending}
          onPress={() => void remove.run(deleteAccount)}
        />
        <Button
          label={mn.common.cancel}
          variant="ghost"
          fullWidth
          onPress={() => setDeleteStep(0)}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md },
  heading: { color: colors.textPrimary, ...nativeTextStyle('h2') },
  group: {
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  hint: { color: colors.textTertiary, ...nativeTextStyle('caption') },
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
});
