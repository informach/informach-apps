import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
if (
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !/^\/(postgres|compasso_review_[a-f0-9]{24})$/.test(url.pathname)
)
  throw new Error("Use pnpm compasso:test:integration --admin-only");
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/features/people/family-metadata.integration.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
