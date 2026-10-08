import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  clean: true,
  // Workspace packages ship TS source, so bundle them into the output.
  noExternal: [/^@ongod\//],
});
