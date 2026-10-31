import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { defineConfig } from "drizzle-kit";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", ".env"),
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./src/migrations",
  schemaFilter: [
    "core",
    "agenda",
    "cozya",
    "audit",
    "ai",
    "billing",
    "missao_saber",
    "edi",
    "ops",
    "bora_treinar",
  ],
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
