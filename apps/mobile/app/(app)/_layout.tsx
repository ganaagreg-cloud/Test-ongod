import { Stack } from 'expo-router';
import { colors } from '@ongod/tokens';

// The tabs (Нүүр / Сан / Хадгалсан / Профайл) come with the next step; for now one screen.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
  );
}
