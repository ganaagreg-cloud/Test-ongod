import { StrictMode, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider, useToast } from '@ongod/ui-web';
import '@ongod/tokens/fonts.css';
import '@ongod/tokens/tokens.css';
import '@ongod/ui-web/base.css';
import '@ongod/ui-web/ui.css';
import './admin.css';
import { App } from './App';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import { mn } from './i18n/mn';

/** Where failed mutations are reported; the provider below points it at the toast. */
let reportError: ((message: string) => void) | undefined;

/**
 * One cache for the whole app. A failed mutation shows its (already translated) server message
 * as a toast, unless the caller handles the error itself (`meta: { silent: true }`).
 */
const client = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 2,
      refetchOnWindowFocus: true,
    },
  },
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return;
      reportError?.(error instanceof ApiError ? error.message : mn.common.errorGeneric);
    },
  }),
});

function Data({ children }: { children: ReactNode }) {
  const toast = useToast();
  useEffect(() => {
    reportError = (message) => toast.show(message, { tone: 'danger' });
    return () => {
      reportError = undefined;
    };
  }, [toast]);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/admin">
      <ToastProvider closeLabel={mn.common.close}>
        <Data>
          <App />
        </Data>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
