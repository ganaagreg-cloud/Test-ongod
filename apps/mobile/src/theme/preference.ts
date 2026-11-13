import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { ThemeMode } from '@ongod/tokens';

// ADR-0102: the member's choice between day (white) and night (dark forest) is kept on the phone.
// It is read SYNCHRONOUSLY at start (src/theme/boot.ts), before any screen builds its styles, so
// the very first frame already has the right colours. Nothing secret: a plain preference.
const KEY = 'ongod.theme';

/** What a phone gets before anyone chooses: day, as the client asked for the white look. */
export const DEFAULT_THEME: ThemeMode = 'day';

const isMode = (value: unknown): value is ThemeMode => value === 'day' || value === 'night';

export function readTheme(): ThemeMode {
  try {
    const raw =
      Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : SecureStore.getItem(KEY);
    return isMode(raw) ? raw : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // storage unreadable: the default, never a crash at start
  }
}

export function saveTheme(mode: ThemeMode): void {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(KEY, mode);
    else SecureStore.setItem(KEY, mode);
  } catch {
    // Not saved: the choice lasts until the app closes.
  }
}
