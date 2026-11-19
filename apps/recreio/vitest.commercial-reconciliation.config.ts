import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

if (
  process.env.RECREIO_BILLING_MODE !== "sandbox" ||
  process.env.RECREIO_TRIAL_MODE !== "experiment"
)
  throw new Error("Use pnpm test:commercial-reconciliation for isolated financial reconciliation");
export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.commercial-reconciliation.ts"] },
});
