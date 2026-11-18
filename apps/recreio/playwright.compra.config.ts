import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_BILLING_MODE !== "setup")
  throw new Error("Use pnpm e2e:commercial-setup for the isolated native purchase journey");
export default defineConfig({ ...base, testMatch: "**/compra-consentimento.jornada.ts" });
