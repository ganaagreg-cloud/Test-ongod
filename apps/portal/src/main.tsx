import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ToastProvider } from '@ongod/ui-web';
import '@ongod/tokens/fonts.css';
import '@ongod/tokens/tokens.css';
import '@ongod/ui-web/base.css';
import '@ongod/ui-web/ui.css';
import './portal.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { mn } from './i18n/mn';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider closeLabel={mn.common.close}>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
