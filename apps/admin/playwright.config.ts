import { defineConfig, devices } from '@playwright/test';

// The admin is exercised against the real API, database and Mailpit. The API serves the admin
// build at /admin/ (SERVE_STATIC=true, after `pnpm build`), so no dev server is started here.
// Point ADMIN_E2E_URL at the API (default http://localhost:3000).
const origin = process.env.ADMIN_E2E_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  // One signed-in session for the whole run: a TOTP code works once per 30 s window.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  use: { baseURL: `${origin}/admin/`, viewport: { width: 1360, height: 900 } },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } },
    },
  ],
});
