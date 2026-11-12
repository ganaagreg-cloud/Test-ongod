import { Stack } from 'expo-router';
import { colors } from '@ongod/tokens';
import { useCaptureGuard } from '../../src/capture/useCaptureGuard';
import { usePush } from '../../src/push/push';

/**
 * The signed-in area: the four tabs, the Player above them (a sheet on iOS: drag down to close,
 * DESIGN "Player"; ADR-0039) and the settings pages pushed from Профайл.
 */
export default function AppLayout() {
  // Push token, token changes and taps on a push (ADR-0055).
  usePush();
  // No sound while the screen is recorded or mirrored (ADR-0094).
  useCaptureGuard();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
