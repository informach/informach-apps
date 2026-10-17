import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["scripts/edi/**/*.test.mts"], environment: "node" },
});
