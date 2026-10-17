import path from "node:path";
import { defineConfig } from "vitest/config";

const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (
  !url ||
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !/^\/missao_review_[a-f0-9]{32}$/.test(url.pathname) ||
  process.env.MISSAO_ISOLATED_TEST !== "1"
)
  throw new Error("Use pnpm test:integration for a disposable local database");
export default defineConfig({
  // O e-mail semanal é JSX sem `import React`, como o Next compila.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: {
    include: ["test/**/*.integration.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
