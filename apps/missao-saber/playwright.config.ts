import { defineConfig, devices } from "@playwright/test";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/missao_review_[a-f0-9]{32}$/.test(url.pathname) ||
  process.env.MISSAO_ISOLATED_TEST !== "1"
)
  throw new Error("Use pnpm e2e for a disposable local database");
const e2ePort = process.env.MISSAO_E2E_PORT ?? "3105";
const parsedE2ePort = Number(e2ePort);
if (!Number.isInteger(parsedE2ePort) || parsedE2ePort < 1024 || parsedE2ePort > 65535)
  throw new Error("MISSAO_E2E_PORT must be a local TCP port from 1024 to 65535");
const e2eRunId = process.env.MISSAO_E2E_RUN_ID;
if (!e2eRunId || !/^[a-f0-9]{24}$/.test(e2eRunId))
  throw new Error("Use pnpm e2e for an isolated artifact directory");
const origin = `http://localhost:${e2ePort}`;
export default defineConfig({
  testDir: "./e2e",
  outputDir: `test-results-${e2eRunId}`,
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  expect: { timeout: 15000 },
  reporter: "list",
  use: {
    baseURL: origin,
    actionTimeout: 15000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1365, height: 900 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `pnpm exec next start -p ${e2ePort}`,
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
