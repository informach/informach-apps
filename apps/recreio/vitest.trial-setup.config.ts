import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

if (process.env.RECREIO_TRIAL_MODE !== "setup")
  throw new Error("Use pnpm test:trial-setup with the real setup mode");

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.trial-setup.ts"] },
});
