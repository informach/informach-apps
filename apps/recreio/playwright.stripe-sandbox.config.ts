import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (
  process.env.GITHUB_ACTIONS !== "true" ||
  process.env.RECREIO_BILLING_MODE !== "sandbox" ||
  process.env.RECREIO_FINANCIAL_JOBS_MODE !== "on" ||
  process.env.RECREIO_TRIAL_MODE !== "off"
)
  throw new Error("Use the explicit GitHub Stripe Sandbox journey");

export default defineConfig({
  ...base,
  testMatch: "**/stripe-sandbox.jornada.ts",
  timeout: 600_000,
  use: { ...base.use, trace: "off", screenshot: "off", video: "off" },
});
