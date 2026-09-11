import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const APP_DIR = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.E2E_PORT ?? 3102);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const EMAIL_SANDBOX_DIR =
  process.env.EMAIL_SANDBOX_DIR ?? resolve(APP_DIR, "tmp", "integration_emails");

process.env.EMAIL_SANDBOX_DIR = EMAIL_SANDBOX_DIR;

export default defineConfig({
  testDir: "./e2e",
  timeout: process.env.CI ? 60_000 : 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: process.env.CI ? 30_000 : 10_000,
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm exec next dev -p ${PORT}`,
        url: `${BASE_URL}/api/auth/get-session`,
        reuseExistingServer: process.env.E2E_REUSE_EXISTING_SERVER === "1",
        timeout: 120_000,
        env: {
          BETTER_AUTH_URL: BASE_URL,
          EMAIL_SANDBOX_MODE: "sandbox",
          EMAIL_SANDBOX_DIR,
          E2E_RELAX_AUTH_RATE_LIMITS: "1",
          NEXT_PUBLIC_APP_URL: BASE_URL,
          OPENROUTER_API_KEY: "sk-or-e2e-disabled",
          REDIS_URL: "redis://localhost:6379/12",
          STRIPE_MODE: "dev",
          STRIPE_SECRET_KEY: "sk_test_e2e",
          STRIPE_WEBHOOK_SECRET: "whsec_e2e",
          SENTRY_AUTH_TOKEN: "",
          SENTRY_DSN: "",
          NEXT_PUBLIC_SENTRY_DSN: "",
        },
      },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
