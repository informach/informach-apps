import { defineConfig, devices } from "@playwright/test";

const DEFAULT_PORT = 3001;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${DEFAULT_PORT}`;
const DEV_PORT = new URL(BASE_URL).port || String(DEFAULT_PORT);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: 10_000,
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm exec next dev -p ${DEV_PORT}`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          BETTER_AUTH_URL: BASE_URL,
          E2E_RELAX_AUTH_RATE_LIMITS: "1",
          EMAIL_SANDBOX_MODE: "sandbox",
          EMAIL_SANDBOX_DIR: "./tmp/integration_emails",
          NEXT_PUBLIC_APP_URL: BASE_URL,
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
