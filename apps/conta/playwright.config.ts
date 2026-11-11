import { getAppUrl } from "@informach/config/domains";
import { defineConfig, devices } from "@playwright/test";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
  throw new Error("Use pnpm compasso:test:integration --ui");
export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  retries: 0,
  grep: process.env.COMPASSO_BROWSER_GREP
    ? new RegExp(process.env.COMPASSO_BROWSER_GREP)
    : undefined,
  timeout: 90_000,
  use: { baseURL: getAppUrl("conta", "development"), trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" } },
  ],
  webServer: {
    command: "pnpm dev",
    url: `${getAppUrl("conta", "development")}/api/ready`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
