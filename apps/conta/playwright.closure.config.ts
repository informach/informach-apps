import { APPS } from "@informach/config";
import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { defineConfig } from "@playwright/test";
import { fixtureEnvironment } from "../../scripts/compasso/browser-environment.mjs";

if (process.env.COMPASSO_ISOLATED_DATABASE !== "1" || process.env.COMPASSO_ISOLATED_REDIS !== "1")
  throw new Error("Use the isolated Compasso closure system runner");
const target = process.env.COMPASSO_TEST_APP;
const application =
  target === "conta"
    ? APPS.conta
    : getCollectionApps("compasso").find((app) => app.slug === target);
if (!application && target !== "fixture") throw new Error("Unknown closure system target");
const origin = application ? getAppUrl(application.slug, "development") : undefined;
const cronSecret = process.env.CRON_SECRET;
if (!cronSecret || cronSecret.length < 32) throw new Error("Missing isolated cron secret");
const environment =
  application && origin
    ? { ...fixtureEnvironment(application.slug, origin), CRON_SECRET: cronSecret }
    : undefined;

export default defineConfig({
  testDir: "./e2e-system",
  outputDir: `./test-results/closure-system/${target}/${process.env.COMPASSO_CLOSURE_STAGE}`,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  use: { baseURL: origin },
  webServer: origin
    ? {
        command: `pnpm --filter @informach/${target} dev`,
        url: `${origin}/api/ready`,
        reuseExistingServer: false,
        timeout: 240_000,
        env: environment,
      }
    : undefined,
});
