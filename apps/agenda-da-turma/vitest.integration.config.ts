import path from "node:path";
import { defineConfig } from "vitest/config";

const databaseUrl = process.env.DATABASE_URL;
if (
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !databaseUrl ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl).hostname)
)
  throw new Error("Integration tests require the disposable Compasso PostgreSQL fixture");
process.env.EMAIL_SANDBOX_MODE = "memory";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3001";
process.env.BETTER_AUTH_URL = "http://localhost:3001";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "test/integration/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/integration/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
