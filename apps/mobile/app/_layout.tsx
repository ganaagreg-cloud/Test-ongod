import { useEffect } from 'react';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import { Lora_400Regular, Lora_600SemiBold } from '@expo-google-fonts/lora';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { colors, nativeFontFamily } from '@ongod/tokens';
import { AuthProvider } from '../src/auth/AuthContext';
import { AppErrorBoundary } from '../src/components/AppErrorBoundary';
import { useGate } from '../src/gate';
import { mn } from '../src/i18n/mn';
import { initMonitoring, wrapRoot } from '../src/monitoring/sentry';
import { queryClient, watchAppState } from '../src/query';
import { ToastProvider } from '../src/ui';

// Crash reports start before anything renders (only when EXPO_PUBLIC_SENTRY_DSN is set).
initMonitoring();
SplashScreen.preventAutoHideAsync();

export { AppErrorBoundary as ErrorBoundary };

// Keys are the per-weight family names from packages/tokens (nativeFontFamily).
const fonts = {
  [nativeFontFamily.display[400]]: Lora_400Regular,
  [nativeFontFamily.display[600]]: Lora_600SemiBold,
  [nativeFontFamily.ui[400]]: Inter_400Regular,
  [nativeFontFamily.ui[500]]: Inter_500Medium,
  [nativeFontFamily.ui[600]]: Inter_600SemiBold,
};

/**
 * Which screens exist depends on where the user is (see src/gate.ts). A screen behind a false
 * guard is not part of the navigator, so it cannot be reached by a link or the back button.
 * "index" always exists and shows the loading / no-connection states or redirects.
 */
function Screens() {
  const gate = useGate();

  useEffect(() => {
    if (gate !== 'loading') void SplashScreen.hideAsync();
  }, [gate]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Protected guard={gate === 'update'}>
        <Stack.Screen name="update-required" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'signedOut'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'pendingProfile'}>
        <Stack.Screen name="complete-profile" options={{ gestureEnabled: false }} />
      </Stack.Protected>
      <Stack.Protected guard={gate === 'signedIn'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

function RootLayout() {
  const [loaded, error] = useFonts(fonts);
  const ready = loaded || error !== null;

  useEffect(() => {
    if (error) console.error('Font loading failed', error);
  }, [error]);

  useEffect(() => watchAppState(), []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <ToastProvider closeLabel={mn.close}>
            <Screens />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });

export default wrapRoot(RootLayout);
