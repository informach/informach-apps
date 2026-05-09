import path from "node:path";
import { fileURLToPath } from "node:url";
import { PostgresStore } from "@mastra/pg";
import { config as loadEnv } from "dotenv";
import { MASTRA_SCHEMA_NAME, MASTRA_STORAGE_ID } from "../src/mastra/constants";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to migrate Mastra storage");
  }

  const storage = new PostgresStore({
    id: MASTRA_STORAGE_ID,
    connectionString: databaseUrl,
    schemaName: MASTRA_SCHEMA_NAME,
    max: 1,
  });

  try {
    console.log(`[mastra:migrate] initializing storage in schema "${MASTRA_SCHEMA_NAME}"`);
    await storage.init();
    console.log("[mastra:migrate] done.");
  } finally {
    await storage.close();
  }
}

main().catch((error) => {
  console.error("[mastra:migrate] failed:", error);
  process.exit(1);
});
