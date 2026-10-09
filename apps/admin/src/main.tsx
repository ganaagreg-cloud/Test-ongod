import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@ongod/tokens/fonts.css';
import '@ongod/tokens/tokens.css';
import '@ongod/ui-web/base.css';
import '@ongod/ui-web/ui.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
