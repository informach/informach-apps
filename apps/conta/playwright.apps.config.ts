import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { defineConfig, devices } from "@playwright/test";
import { fixtureEnvironment } from "../../scripts/compasso/browser-environment.mjs";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
  throw new Error("Use pnpm compasso:test:integration --apps-only");
const app = getCollectionApps("compasso").find(
  (candidate) => candidate.slug === process.env.COMPASSO_TEST_APP,
);
if (!app) throw new Error("Set COMPASSO_TEST_APP to a registered Compasso app");
const origin = getAppUrl(app.slug, "development");
const optimized = process.env.COMPASSO_OPTIMIZED_TEST === "1";
const runId = process.env.COMPASSO_TEST_RUN_ID;
if (
  optimized &&
  (!runId || !/^[a-f0-9]{24}$/.test(runId) || process.env.COMPASSO_ISOLATED_REDIS !== "1")
)
  throw new Error("Optimized browser checks require owned build artifacts and Redis");
const command = (slug: string) =>
  optimized
    ? `node "../${slug}/.next-compasso-${runId}/standalone/apps/${slug}/server.js"`
    : `pnpm --filter @informach/${slug} dev`;
if (process.env.COMPASSO_ISOLATED_REDIS === "1") {
  const redis = new URL(process.env.REDIS_URL ?? "");
  if (redis.protocol !== "redis:" || redis.hostname !== "127.0.0.1" || !redis.password)
    throw new Error("Browser Redis must be an authenticated disposable loopback fixture");
}

const domainTests = [
  "bora-treinar",
  "missao-saber",
  "dia-de-estrela",
  "agenda-da-turma",
  "cozya",
].includes(app.slug)
  ? "e2e"
  : "e2e-compasso";
export default defineConfig({
  testDir: "./e2e-apps",
  outputDir: `./test-results/compasso-apps/${app.slug}`,
  workers: 1,
  grep: process.env.COMPASSO_BROWSER_GREP
    ? new RegExp(process.env.COMPASSO_BROWSER_GREP)
    : undefined,
  retries: 0,
  maxFailures: 3,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { baseURL: origin, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    { name: "mobile", use: { ...devices["Pixel 7"], browserName: "chromium" as const } },
    ...(app.slug === "dia-de-estrela"
      ? [
          {
            name: "tablet",
            use: {
              ...devices["Desktop Chrome"],
              viewport: { width: 1194, height: 834 },
              hasTouch: true,
            },
          },
        ]
      : []),
  ].flatMap((project) => [
    project,
    ...(existsSync(resolve("..", app.slug, domainTests))
      ? [
          {
            ...project,
            name: `${app.slug}-${project.name}`,
            testDir: resolve("..", app.slug, domainTests),
          },
        ]
      : []),
  ]),
  webServer: [
    {
      command: command("conta"),
      url: `${getAppUrl("conta", "development")}/api/ready`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: fixtureEnvironment("conta", getAppUrl("conta", "development")),
    },
    {
      command: command(app.slug),
      // This matrix exercises auth without Redis; production /api/ready remains unchanged.
      url: `${origin}${optimized ? "/api/ready" : "/api/auth/get-session"}`,
      reuseExistingServer: false,
      timeout: 240_000,
      env: fixtureEnvironment(app.slug, origin),
    },
  ],
});
