import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";
import { seedCities } from "./cities";
import { seedSchools } from "./schools";
import { seedStates } from "./states";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..", ".env"),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run reference seeds");
  }

  console.log("[seeds:reference] connecting to database...");
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await seedStates(db);
    await seedCities(db);
    await seedSchools(db);
    console.log("[seeds:reference] done.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[seeds:reference] failed:", error);
  process.exit(1);
});
