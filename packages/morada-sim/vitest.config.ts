import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "testes/**/*.test.ts"],
    setupFiles: ["./testes/preparo.ts"],
  },
});
