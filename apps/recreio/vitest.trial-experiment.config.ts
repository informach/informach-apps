import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

if (process.env.RECREIO_TRIAL_MODE !== "experiment")
  throw new Error("Use pnpm test:trial-experiment with the real experiment mode");

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.trial-experiment.ts"] },
});
