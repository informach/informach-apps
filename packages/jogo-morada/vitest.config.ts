import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Só os testes de unidade. Os de navegador ficam em `e2e/`, com o Playwright.
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
