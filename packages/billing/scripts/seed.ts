import path from "node:path";
import { fileURLToPath } from "node:url";
import { schema } from "@informach/db";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { seedCozyaCreditPricing } from "../src/seeds";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run seeds");
  }

  console.log("[billing:seed] connecting...");
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("[billing:seed] seeding billing.credit_pricing (Cozya)...");
  const result = await seedCozyaCreditPricing(db);
  console.log(
    `[billing:seed] credit_pricing: ${result.inserted} inserted, ${result.skipped} skipped`,
  );

  console.log("[billing:seed] done.");
  await client.end();
}

main().catch((error) => {
  console.error("[billing:seed] failed:", error);
  process.exit(1);
});
