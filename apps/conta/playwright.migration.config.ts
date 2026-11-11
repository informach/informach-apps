import { randomBytes } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { defineConfig, devices } from "@playwright/test";
import { fixtureEnvironment } from "../../scripts/compasso/browser-environment.mjs";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
  throw new Error("Use the isolated Compasso integration runner");
const origin = getAppUrl("conta", "development");
export default defineConfig({
  testDir: "./e2e-migration",
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev",
    url: `${origin}/api/ready`,
    reuseExistingServer: false,
    timeout: 180000,
    // Normal production configuration switches, with deliberately unusable test
    // credentials. The browser fixtures contain only promotional credit lots;
    // provider settlement is covered at the SDK and PostgreSQL boundaries.
    env: {
      ...fixtureEnvironment("conta", origin),
      COMPASSO_BILLING_ENABLED: "true",
      STRIPE_PORTAL_CONFIGURATION_ID: "bpc_isolated_fixture",
      CRON_SECRET: randomBytes(32).toString("hex"),
      COMPASSO_MONTHLY_PRICE: "price_fixture_monthly",
      COMPASSO_ANNUAL_PRICE: "price_fixture_annual",
      COMPASSO_CREDITS_100_PRICE: "price_fixture_100",
      COMPASSO_CREDITS_300_PRICE: "price_fixture_300",
      COMPASSO_CREDITS_1000_PRICE: "price_fixture_1000",
    },
  },
});
