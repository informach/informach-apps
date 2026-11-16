import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { evidenciasPrivadas } from "./evidencias";

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
const regras = process.env.MORADA_E2E_REGRAS ?? "prova";
if (regras !== "prova" && regras !== "padrao") throw new Error("Preset de regras inválido.");
const grupo = process.env.MORADA_E2E_GRUPO ?? "focada";
if (!/^[a-z][a-z0-9-]{0,63}$/.test(grupo)) throw new Error("Grupo de evidências inválido.");
const resultados = evidenciasPrivadas
  ? join(evidenciasPrivadas, "test-results")
  : join(pacote, "e2e/test-results");

export default defineConfig({
  testDir: ".",
  outputDir: join(resultados, grupo),
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
      channel: "chromium",
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
      env: { MORADA_PLATAFORMA: "falsa", MORADA_REGRAS: regras, PORT: "3010", LOG_LEVEL: "warn" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command:
        process.env.MORADA_E2E_BUILD_PRONTO === "1"
          ? "pnpm exec vite preview --config bancada/vite.config.ts --strictPort"
          : "pnpm build:bancada && pnpm exec vite preview --config bancada/vite.config.ts --strictPort",
      cwd: pacote,
      url: "http://localhost:5173/",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
