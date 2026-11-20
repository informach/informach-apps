import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_E2E_ACCOUNT_CLOSURE !== "1" || process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Native account closure requires its isolated GitHub workflow");
export default defineConfig(base, {
  testIgnore: [],
  testMatch: "encerramento-nativo.spec.ts",
  timeout: 300000,
});
