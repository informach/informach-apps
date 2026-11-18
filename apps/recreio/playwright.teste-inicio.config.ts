import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_TRIAL_MODE !== "experiment")
  throw new Error("Use pnpm e2e:trial-experiment for the isolated first-session journey");

export default defineConfig({
  ...base,
  testMatch: "**/teste-inicio.jornada.ts",
});
