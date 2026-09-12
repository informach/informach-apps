import path from "node:path";
import { loadEnvFile } from "node:process";
import { defineConfig } from "vitest/config";

loadEnvFile(path.resolve(__dirname, ".env.local"));
if (process.env.AGENDA_RUN_AI_EVAL !== "1" || !process.env.OPENROUTER_API_KEY)
  throw new Error(
    "Real provider evaluation requires AGENDA_RUN_AI_EVAL=1 and OPENROUTER_API_KEY; it incurs model usage",
  );
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/integration/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["test/evaluation/**/*.eval.ts"],
    fileParallelism: false,
    testTimeout: 90_000,
  },
});
