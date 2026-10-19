import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { DeviceDto } from '@ongod/shared';
import { colors, layout, nativeTextStyle, radius, spacing } from '@ongod/tokens';
import { api } from '../../../src/api';
import { required } from '../../../src/auth/validation';
import { keys, useDevices } from '../../../src/data/queries';
import { mn } from '../../../src/i18n/mn';
import { deviceLabel, formatDate } from '../../../src/lib/format';
import { useSubmit } from '../../../src/lib/useSubmit';
import { BackHeader } from '../../../src/screens/BackHeader';
import {
  Button,
  EmptyState,
  Input,
  ListItem,
  Screen,
  Sheet,
  Skeleton,
  useToast,
} from '../../../src/ui';

/** Төхөөрөмжүүд: the signed-in devices (max 2); another one can be removed with the password. */
export default function Devices() {
  const client = useQueryClient();
  const toast = useToast();
  const devices = useDevices();
  const { pending, run } = useSubmit();
  const [removing, setRemoving] = useState<DeviceDto | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();

  const close = () => {
    setRemoving(null);
    setPassword('');
    setError(undefined);
  };

  async function remove() {
    if (!removing) return;
    const problem = required(password);
    setError(problem);
    if (problem) return;
    const done = await run(() => api.removeDevice(removing.id, password));
    if (done) {
      close();
      toast.show(mn.devices.removed, { tone: 'success' });
      void client.invalidateQueries({ queryKey: keys.devices });
    }
  }

  return (
    <Screen>
      <BackHeader title={mn.devices.title} />
      <Text style={styles.text}>{mn.devices.text}</Text>
      {devices.data ? (
        <View style={styles.group}>
          {devices.data.devices.map((device) => (
            <ListItem
              key={device.id}
              title={deviceLabel(device.platform, device.model)}
              value={
                device.current
                  ? mn.devices.current
                  : mn.deviceLimit.lastSeen(formatDate(device.lastSeenAt))
              }
              icon="device"
              {...(device.current ? {} : { onPress: () => setRemoving(device) })}
            />
          ))}
        </View>
      ) : devices.isError ? (
        <EmptyState
          title={mn.episode.loadError}
          action={
            <Button
              label={mn.common.retry}
              variant="secondary"
              onPress={() => void devices.refetch()}
            />
          }
        />
      ) : (
        <View style={styles.skeletons} aria-hidden>
          <Skeleton shape="block" height={layout.buttonHeight} />
          <Skeleton shape="block" height={layout.buttonHeight} />
        </View>
      )}

      <Sheet
        visible={removing !== null}
        onClose={close}
        title={mn.devices.removeTitle}
        closeLabel={mn.close}
      >
        {removing ? (
          <Text style={styles.text}>
            {deviceLabel(removing.platform, removing.model)}. {mn.devices.removeText}
          </Text>
        ) : null}
        <Input
          label={mn.devices.password}
          value={password}
          onChangeText={setPassword}
          error={error}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
        />
        <Button
          label={mn.devices.remove}
          variant="destructive"
          fullWidth
          loading={pending}
          onPress={() => void remove()}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.textSecondary, ...nativeTextStyle('body') },
  group: {
    borderRadius: radius.cardLarge,
    borderWidth: layout.borderWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  skeletons: { gap: spacing.sm },
});
