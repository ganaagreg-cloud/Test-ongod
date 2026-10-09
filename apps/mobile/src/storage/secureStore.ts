// Native (iOS/Android): the system keychain / keystore via expo-secure-store.
// The browser preview uses secureStore.web.ts instead (Metro picks the .web file on web).
import * as SecureStore from 'expo-secure-store';

export const secureStoreBackend = 'native' as const;

export const getItem = (key: string): Promise<string | null> => SecureStore.getItemAsync(key);
export const setItem = (key: string, value: string): Promise<void> =>
  SecureStore.setItemAsync(key, value);
export const deleteItem = (key: string): Promise<void> => SecureStore.deleteItemAsync(key);
