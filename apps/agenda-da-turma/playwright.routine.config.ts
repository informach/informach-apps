import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

loadEnvFile(fileURLToPath(new URL(".env.local", import.meta.url)));
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3001";
if (
  !process.env.DATABASE_URL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname)
)
  throw new Error("Routine browser tests require a local app and a local database");
export default defineConfig({
  testDir: "./e2e",
  testMatch: ["family-routine.spec.ts", "review-fixes.spec.ts"],
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL,
    browserName: "chromium",
    channel: "msedge",
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    actionTimeout: 15_000,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
});
