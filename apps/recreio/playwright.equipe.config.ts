import path from "node:path";
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// A configuração base já exige banco descartável, origem local e diretório próprio.
const origin = process.env.RECREIO_E2E_ADMIN_ORIGIN,
  secret = process.env.RECREIO_E2E_ADMIN_SECRET;
const url = origin ? new URL(origin) : null;
if (
  process.env.RECREIO_E2E_EQUIPE !== "1" ||
  !url ||
  url.protocol !== "http:" ||
  url.hostname !== "localhost" ||
  !/^\d{4,5}$/.test(url.port) ||
  url.origin !== origin ||
  !secret
)
  throw new Error("Use pnpm e2e:equipe for the isolated staff journey");

export default defineConfig({
  ...base,
  testMatch: "**/equipe-seguranca.spec.ts",
  timeout: 300000,
  expect: { timeout: 30000 },
  webServer: [
    ...(Array.isArray(base.webServer) ? base.webServer : base.webServer ? [base.webServer] : []),
    {
      // Fluxo real de autenticação em desenvolvimento isolado. O build de
      // produção do Bastidores é um gate distinto; não se desliga seu guard.
      command: `pnpm exec next dev --hostname 127.0.0.1 --port ${url.port}`,
      cwd: path.resolve(process.cwd(), "../admin"),
      env: {
        NODE_ENV: "development",
        NEXT_PUBLIC_APP_URL: origin,
        BETTER_AUTH_URL: origin,
        BETTER_AUTH_SECRET: secret,
        EMAIL_SANDBOX_MODE: "sandbox",
        ADMIN_RECREIO_ENABLED: "1",
        ADMIN_SERVICE_URLS: JSON.stringify({ recreio: process.env.NEXT_PUBLIC_APP_URL }),
        REDIS_URL: "",
        READONLY_DATABASE_URL: "",
      },
      url: `${origin}/entrar`,
      reuseExistingServer: false,
      stdout: "pipe",
      timeout: 180000,
    },
  ],
});
