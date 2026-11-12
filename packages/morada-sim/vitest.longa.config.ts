import { defineConfig } from "vitest/config";

// Provas longas (100 dias de jogo). Ficam fora do `pnpm test` para não disputar
// CPU com as medições de tempo de outros workspaces.
export default defineConfig({
  test: {
    include: ["testes/**/*.longa.ts"],
    setupFiles: ["./testes/preparo.ts"],
    testTimeout: 10 * 60 * 1000,
    pool: "forks",
    execArgv: ["--expose-gc"],
  },
});
