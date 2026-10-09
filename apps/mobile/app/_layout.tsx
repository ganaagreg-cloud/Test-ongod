import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Lora_400Regular, Lora_600SemiBold } from '@expo-google-fonts/lora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { colors, nativeFontFamily } from '@ongod/tokens';
import { mn } from '../src/i18n/mn';
import { ToastProvider } from '../src/ui';

SplashScreen.preventAutoHideAsync();

// Keys are the per-weight family names from packages/tokens (nativeFontFamily).
const fonts = {
  [nativeFontFamily.display[400]]: Lora_400Regular,
  [nativeFontFamily.display[600]]: Lora_600SemiBold,
  [nativeFontFamily.ui[400]]: Inter_400Regular,
  [nativeFontFamily.ui[500]]: Inter_500Medium,
  [nativeFontFamily.ui[600]]: Inter_600SemiBold,
};

export default function RootLayout() {
  const [loaded, error] = useFonts(fonts);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (error) console.error('Font loading failed', error);
    if (ready) SplashScreen.hideAsync();
  }, [ready, error]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style="light" />
      <ToastProvider closeLabel={mn.close}>
        <Stack
          screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
        />
      </ToastProvider>
    </>
  );
}
