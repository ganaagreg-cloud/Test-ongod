import { defineConfig, devices } from '@playwright/test';

// The auth screens through Expo web, against the real API and Mailpit. Metro must be running
// with EXPO_PUBLIC_API_URL pointing at the API (see e2e/README in the log, ADR-0029):
//   MOBILE_WEB_URL=http://localhost:8081 MOBILE_E2E_API_URL=http://localhost:3100 pnpm test:e2e
const base = process.env.MOBILE_WEB_URL ?? 'http://localhost:8081';

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  use: { baseURL: base, viewport: { width: 430, height: 900 } },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 900 } },
    },
  ],
});
