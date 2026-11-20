import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

// Explicit external qualification profile; no skip/fallback to local mocks.
export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.backup-operational.ts"], testTimeout: 300000 },
});
