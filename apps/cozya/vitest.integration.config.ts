import path from "node:path";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv({ path: path.resolve(__dirname, ".env.local") });
loadEnv({ path: path.resolve(__dirname, "../../.env") });
const liveAi = process.env.COZYA_LIVE_AI_SMOKE === "1";
if (liveAi && !process.env.OPENROUTER_API_KEY) throw new Error("Live AI smoke requires an API key");
if (
  !process.env.DATABASE_URL ||
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(process.env.DATABASE_URL).hostname)
)
  throw new Error("Integration tests require an explicitly local PostgreSQL database");
if (
  process.env.COZYA_ISOLATED_INTEGRATION !== "1" ||
  !new URL(process.env.DATABASE_URL).pathname.startsWith("/cozya_review_")
)
  throw new Error(
    "Use pnpm test:integration to create an isolated database before running this suite",
  );
Object.assign(process.env, {
  NODE_ENV: "test",
  LOG_LEVEL: "error",
  EMAIL_SANDBOX_MODE: "memory",
  STRIPE_MODE: "dev",
  STRIPE_SECRET_KEY: "sk_test_integration",
  STRIPE_WEBHOOK_SECRET: "whsec_integration",
  OPENROUTER_API_KEY: liveAi ? process.env.OPENROUTER_API_KEY : "sk-or-integration-disabled",
  SENTRY_DSN: "",
  NEXT_PUBLIC_SENTRY_DSN: "",
  REDIS_URL: "redis://localhost:6379/12",
});
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    testTimeout: liveAi ? 120000 : 30000,
    hookTimeout: 30000,
    include: liveAi ? ["test/ai.live.ts"] : ["test/**/*.integration.ts"],
  },
});
