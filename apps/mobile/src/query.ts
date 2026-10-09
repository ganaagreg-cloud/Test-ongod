import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import { ApiError } from './api';

/** One cache for the whole app. Requests the server refused (4xx) are not repeated. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

/** On a phone "focus" means the app is in the foreground, not a browser tab. */
export function watchAppState(): () => void {
  if (Platform.OS === 'web') return () => undefined;
  const listener = AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
  return () => listener.remove();
}
