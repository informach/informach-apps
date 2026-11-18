import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (
  process.env.RECREIO_BILLING_MODE !== "sandbox" ||
  process.env.STRIPE_SECRET_KEY !== "sk_test_isolated_not_sent"
)
  throw new Error(
    "Use pnpm e2e:commercial-plans for native UI with synthetic financial preconditions",
  );
export default defineConfig({ ...base, testMatch: "**/troca-consentimento.jornada.ts" });
