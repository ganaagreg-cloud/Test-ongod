import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  // The host's Node version is unknown (R-hosting-limits), so the output stays Node 20 compatible (ADR-0063).
  target: 'node20',
  platform: 'node',
  clean: true,
  // Dev-only code (API docs) is behind `process.env.NODE_ENV === 'development'`; fixing the
  // value here lets the bundler drop it, so swagger is not in dist/ and not needed in production.
  define: { 'process.env.NODE_ENV': '"production"' },
  // Workspace packages ship TS source, so bundle them into the output.
  noExternal: [/^@ongod\//],
});
