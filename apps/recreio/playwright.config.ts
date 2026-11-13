import { defineConfig, devices } from "@playwright/test";
import { ARGS_DO_NAVEGADOR } from "./e2e/navegador";

// O E2E só roda por `pnpm e2e` (`scripts/isolated.mjs e2e`), que cria o banco
// descartável, gera os segredos da execução e faz o build com o jogo de teste.
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname) ||
  process.env.RECREIO_ISOLATED_TEST !== "1"
)
  throw new Error("Use pnpm e2e for a disposable local database");
const e2ePort = process.env.RECREIO_E2E_PORT ?? "3109";
const parsedE2ePort = Number(e2ePort);
if (!Number.isInteger(parsedE2ePort) || parsedE2ePort < 1024 || parsedE2ePort > 65535)
  throw new Error("RECREIO_E2E_PORT must be a local TCP port from 1024 to 65535");
const e2eRunId = process.env.RECREIO_E2E_RUN_ID;
if (!e2eRunId || !/^[a-f0-9]{24}$/.test(e2eRunId))
  throw new Error("Use pnpm e2e for an isolated artifact directory");
const origin = `http://localhost:${e2ePort}`;
export default defineConfig({
  testDir: "./e2e",
  outputDir: process.env.RECREIO_E2E_PRIVATE_ARTIFACTS
    ? `${process.env.RECREIO_E2E_PRIVATE_ARTIFACTS}/test-results`
    : `test-results-${e2eRunId}`,
  // A jornada principal espera a posse de uma instância morta vencer (30 s).
  timeout: 240000,
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
    launchOptions: { args: ARGS_DO_NAVEGADOR },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1365, height: 900 } },
    },
  ],
  webServer: {
    command: `node .next-isolated-${e2eRunId}/standalone/apps/recreio/server.js`,
    env: { HOSTNAME: "127.0.0.1", PORT: e2ePort },
    url: `${origin}/api/health`,
    reuseExistingServer: false,
    stdout: "pipe",
    timeout: 120000,
  },
});
