import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "versoes.spec.ts",
  webServer: undefined,
});
