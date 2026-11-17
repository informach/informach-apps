import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

if (process.env.RECREIO_CHECKPOINT_MODE !== "on")
  throw new Error("Checkpoint gate requires its real production feature mode");
export default defineConfig({ ...base, testDir: "./checkpoint-e2e" });
