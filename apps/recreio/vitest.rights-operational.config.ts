import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config";

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/**/*.rights-operational.ts"], testTimeout: 240000 },
});
