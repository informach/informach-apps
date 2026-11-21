import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

// The adoption scans a global legacy source, so unrelated fixtures must not
// share its database or be filtered out of the production algorithm.
export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.world-traces.ts"] },
});
