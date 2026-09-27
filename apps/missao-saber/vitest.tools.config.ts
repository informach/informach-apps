import path from "node:path";
import { defineConfig } from "vitest/config";

/* Ferramentas de autoria que precisam carregar o catálogo com os mesmos
   aliases dos testes. Rodar com `pnpm exec vitest run --config vitest.tools.config.ts`. */
export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "test/server-only.ts"),
    },
  },
  test: { include: ["tools/**/*.tool.ts"], environment: "node" },
});
