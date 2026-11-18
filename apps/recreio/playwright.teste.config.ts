import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_TRIAL_MODE !== "setup")
  throw new Error("Use pnpm e2e:trial-setup for the isolated trial consent journey");

export default defineConfig({
  ...base,
  testMatch: "**/teste-consentimento.jornada.ts",
});
