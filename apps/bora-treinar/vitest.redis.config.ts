import { defineConfig } from "vitest/config";
import integration from "./vitest.integration.config.ts";

export default defineConfig({
  ...integration,
  test: { ...integration.test, include: ["test/redis.transport.ts"] },
});
