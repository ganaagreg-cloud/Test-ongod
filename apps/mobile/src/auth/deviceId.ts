import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { getItem, setItem } from '../storage/secureStore';

const KEY = 'ongod.deviceId';

let pending: Promise<string> | undefined;

/**
 * A random id for this installation, created once and kept in SecureStore. The API counts it as
 * one of the user's two devices (SPEC B), so it must not change between app starts. (iOS may
 * keep it across a reinstall; Android forgets it, and the user can remove the old device at login.)
 */
export function getDeviceId(): Promise<string> {
  pending ??= (async () => {
    const saved = await getItem(KEY);
    if (saved && saved.length >= 8) return saved;
    const created = `${Platform.OS}-${Crypto.randomUUID()}`;
    await setItem(KEY, created);
    return created;
  })();
  return pending;
}
