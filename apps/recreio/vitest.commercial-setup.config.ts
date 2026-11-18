import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

if (process.env.RECREIO_BILLING_MODE !== "setup" || process.env.RECREIO_TRIAL_MODE !== "experiment")
  throw new Error("Use pnpm test:commercial-setup with the isolated commercial and trial modes");

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.commercial-setup.ts"] },
});
