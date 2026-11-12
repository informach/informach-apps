import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

/**
 * Testes de navegador do cliente do Morada. Sobem o servidor do jogo no modo
 * de desenvolvimento (plataforma em memória, regras da prova) e a bancada já
 * construída. Nenhum dos dois é reaproveitado: cada execução começa com um
 * mundo novo, e as portas 3010 e 5173 precisam estar livres.
 *
 * O navegador de teste desenha por software (SwiftShader), para o resultado
 * não depender da placa de vídeo da máquina. `MORADA_E2E_GPU=1` tira essas
 * opções, para medir com a placa de verdade.
 */

const pacote = fileURLToPath(new URL("..", import.meta.url));
const raiz = fileURLToPath(new URL("../../..", import.meta.url));
const porSoftware = process.env.MORADA_E2E_GPU !== "1";

export default defineConfig({
  testDir: ".",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 150_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    viewport: { width: 1280, height: 720 },
    trace: "off",
    launchOptions: {
      args: porSoftware
        ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
        : ["--ignore-gpu-blocklist"],
    },
  },
  webServer: [
    {
      // Sem `watch`: o servidor não deve reiniciar (e trocar de mundo) no meio dos testes.
      command: "pnpm --filter @informach/morada-server exec tsx src/main.ts",
      cwd: raiz,
      url: "http://localhost:3010/api/ready",
      env: { MORADA_PLATAFORMA: "falsa", MORADA_REGRAS: "prova", PORT: "3010", LOG_LEVEL: "warn" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        "pnpm build:bancada && pnpm exec vite preview --config bancada/vite.config.ts --strictPort",
      cwd: pacote,
      url: "http://localhost:5173/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
