import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // compare-sources.test.mjs uses node:test and is run by the import tooling.
    include: ["scripts/edi/**/*.test.mts", "scripts/edi/protected-keys.test.mjs"],
    environment: "node",
  },
});
