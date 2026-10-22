import { defineConfig, devices } from '@playwright/test';

// The admin is exercised against the real API, database and Mailpit. The API serves the admin
// build at /admin/ (SERVE_STATIC=true, after `pnpm build`), so no dev server is started here.
// Point ADMIN_E2E_URL at the API (default http://localhost:3000).
// Start that API with RATE_LIMIT_MAX=5000 AUTH_RATE_LIMIT_IP_MAX=1000 AUTH_RATE_LIMIT_IDENTIFIER_MAX=1000:
// one run reloads the page and refreshes the session more often than the real limits allow.
const origin = process.env.ADMIN_E2E_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  // One signed-in session for the whole run: logging in once keeps the device count down.
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
