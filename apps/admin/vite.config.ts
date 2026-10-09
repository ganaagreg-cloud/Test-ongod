import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    // A busy port is an error, not a silent move: the printed URLs must stay true.
    strictPort: true,
    proxy: { '/v1': 'http://localhost:3000' },
  },
});
