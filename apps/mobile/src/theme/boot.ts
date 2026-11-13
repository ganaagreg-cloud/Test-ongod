import { applyTheme, type ThemeMode } from '@ongod/tokens';
import { readTheme } from './preference';

// ADR-0102. Import this file FIRST in app/_layout.tsx: it sets the day or night colours on the
// shared theme objects before any other module builds its styles from them.
export const themeMode: ThemeMode = readTheme();
applyTheme(themeMode);
