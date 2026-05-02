import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  console.log("[db:migrate] connecting to database...");
  const migrationsClient = postgres(databaseUrl, { max: 1 });
  const db = drizzle(migrationsClient);

  console.log("[db:migrate] applying migrations from ./src/migrations");
  await migrate(db, { migrationsFolder: "./src/migrations" });

  console.log("[db:migrate] done.");
  await migrationsClient.end();
}

main().catch((error) => {
  console.error("[db:migrate] failed:", error);
  process.exit(1);
});
