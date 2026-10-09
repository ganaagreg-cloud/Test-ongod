import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { getDeviceId } from '../auth/deviceId';
import { env } from '../config/env';
import { mn } from '../i18n/mn';
import { deleteItem, getItem, setItem } from '../storage/secureStore';
import { createApiClient, type TokenStore } from './client';
import { createEndpoints } from './endpoints';

const REFRESH_KEY = 'ongod.refreshToken';

/** The refresh token is the only secret kept on the phone; it sits in the keychain / keystore. */
const tokens: TokenStore = {
  getRefreshToken: () => getItem(REFRESH_KEY),
  setRefreshToken: (token) => setItem(REFRESH_KEY, token),
  clear: () => deleteItem(REFRESH_KEY),
};

let sessionLostHandler: (() => void) | undefined;

/** The auth context registers here to switch to the signed-out screens. */
export function onSessionLost(handler: (() => void) | undefined) {
  sessionLostHandler = handler;
}

export const client = createApiClient({
  baseUrl: env.apiUrl ?? '',
  tokens,
  getDeviceId,
  messages: { network: mn.errors.network, generic: mn.errors.generic },
  onSessionLost: () => sessionLostHandler?.(),
});

export const api = createEndpoints(client);

/** What the login calls tell the API about this phone. */
export async function deviceInfo() {
  const model = Device.modelName?.slice(0, 100);
  return {
    deviceId: await getDeviceId(),
    // The browser preview pretends to be Android: web logins use a cookie, not a token body.
    platform: Platform.OS === 'ios' ? ('ios' as const) : ('android' as const),
    ...(model ? { model } : {}),
  };
}

export { ApiError } from './client';
