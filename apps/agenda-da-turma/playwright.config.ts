import { defineConfig, devices } from "@playwright/test";

const DEFAULT_PORT = 3001;
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${DEFAULT_PORT}`;
const DEV_PORT = new URL(BASE_URL).port || String(DEFAULT_PORT);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  // Orçamentos maiores no CI porque o servidor é `next dev`, que compila a rota
  // na primeira requisição: num runner de dois núcleos isso não cabe nos 10 s
  // de uma interação. Mesmos valores que o cozya já usa. `warmup.setup.ts`
  // paga a compilação das rotas pesadas antes da suíte, mas o restante da
  // aplicação também é compilado sob demanda ao longo dos testes.
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    actionTimeout: process.env.CI ? 30_000 : 10_000,
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : {
        command: `pnpm exec next dev -p ${DEV_PORT}`,
        // Rota de API, não a home: assim o servidor só é dado como pronto
        // depois de compilar o handler de auth, que é a primeira coisa que todo
        // teste usa.
        url: `${BASE_URL}/api/auth/get-session`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          BETTER_AUTH_URL: BASE_URL,
          E2E_RELAX_AUTH_RATE_LIMITS: "1",
          EMAIL_SANDBOX_MODE: "sandbox",
          EMAIL_SANDBOX_DIR: "./tmp/integration_emails",
          NEXT_PUBLIC_APP_URL: BASE_URL,
        },
      },
  projects: [
    // Setup project, e não `globalSetup`: um projeto é um teste e roda com
    // garantia depois do `webServer` estar de pé.
    { name: "warmup", testMatch: /warmup\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["warmup"],
    },
  ],
});
