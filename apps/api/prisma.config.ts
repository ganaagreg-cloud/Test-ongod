import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Prisma CLI does not load .env itself; the repo keeps one .env at the root.
const rootEnv = new URL('../../.env', import.meta.url);
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Not required for `prisma generate`, so read it without throwing.
  datasource: { url: process.env.DATABASE_URL },
});
