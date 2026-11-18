import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

if (
  process.env.RECREIO_BILLING_MODE !== "sandbox" ||
  process.env.RECREIO_TRIAL_MODE !== "experiment"
)
  throw new Error("Use pnpm test:commercial-checkout with the isolated sandbox mode");

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.commercial-checkout.ts"] },
});
