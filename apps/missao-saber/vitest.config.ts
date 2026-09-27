import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // O e-mail semanal é JSX sem `import React`, como o Next compila.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
