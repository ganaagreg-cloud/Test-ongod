import { DevSettings, Platform } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Restarts the interface so every screen is built again with the new theme (most styles are
 * built once, at load). The signed-in session is kept: it lives in the secure store.
 */
export async function restartInterface(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.location?.reload();
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    // Development builds cannot reload through expo-updates.
    DevSettings.reload();
  }
}
