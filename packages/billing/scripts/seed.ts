import path from "node:path";
import { fileURLToPath } from "node:url";
import { schema } from "@informach/db";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  expireLegacyCozyaPricing,
  expireSupersededCozyaPricing,
  seedAgendaCreditPricing,
  seedCozyaCreditPricing,
} from "../src/seeds";

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

  console.log("[billing:seed] expiring legacy cozya credit_pricing rows (pre-OpenRouter)...");
  const expired = await expireLegacyCozyaPricing(db);
  console.log(`[billing:seed] credit_pricing: ${expired.closed} legacy rows closed`);

  console.log("[billing:seed] expiring superseded cozya credit_pricing rows (model upgrades)...");
  const superseded = await expireSupersededCozyaPricing(db);
  console.log(`[billing:seed] credit_pricing: ${superseded.closed} superseded rows closed`);

  console.log("[billing:seed] seeding billing.credit_pricing (Cozya)...");
  const cozyaResult = await seedCozyaCreditPricing(db);
  console.log(
    `[billing:seed] credit_pricing (cozya): ${cozyaResult.inserted} inserted, ${cozyaResult.skipped} skipped`,
  );

  console.log("[billing:seed] seeding billing.credit_pricing (Agenda da Turma)...");
  const agendaResult = await seedAgendaCreditPricing(db);
  console.log(
    `[billing:seed] credit_pricing (agenda): ${agendaResult.inserted} inserted, ${agendaResult.skipped} skipped`,
  );

  console.log("[billing:seed] done.");
  await client.end();
}

main().catch((error) => {
  console.error("[billing:seed] failed:", error);
  process.exit(1);
});
