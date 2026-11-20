import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_CAPACITY_PROBE !== "1" || process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Capacity verification requires the isolated GitHub mode");
export default defineConfig(base, {
  testMatch: "capacidade.jornada.ts",
  timeout: 1_200_000,
  // Only aggregate numeric evidence is uploaded. No browser content/trace.
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
});
