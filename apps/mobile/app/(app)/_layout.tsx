import { Stack } from 'expo-router';
import { colors } from '@ongod/tokens';

/**
 * The signed-in area: the four tabs, the Player above them (a sheet on iOS: drag down to close,
 * DESIGN "Player"; ADR-0039) and the settings pages pushed from Профайл.
 */
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="player/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
