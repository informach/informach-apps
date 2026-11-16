import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assessMigrationHistory } from "./migration-history";
import {
  createMigrationClient,
  MigrationPreconditionError,
  migrationFailure,
} from "./migration-runtime";
import journal from "./migrations/meta/_journal.json" with { type: "json" };

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new MigrationPreconditionError("MISSING_DATABASE_URL");
  }

  console.log("[db:migrate] connecting to database...");
  const migrationsClient = createMigrationClient(databaseUrl);
  const expected = journal.entries.map((entry) => entry.when);
  try {
    const [table] = await migrationsClient`
      select to_regclass('drizzle.__drizzle_migrations')::text as name`;
    const readHistory = async () => {
      const rows = await migrationsClient`
        select created_at::text as applied from drizzle.__drizzle_migrations order by created_at, id`;
      return rows.map((row) => (row.applied === null ? NaN : Number(row.applied)));
    };
    const applied = table?.name ? await readHistory() : [];
    const before = assessMigrationHistory(expected, applied);
    if (before === "inconsistent") throw new MigrationPreconditionError("HISTORY_INCONSISTENT");
    // A push to main starts Railway's migrator independently of CI. Keep the
    // existing schema (and running deployments) until the coordinated cutover.
    // Once this batch is present, later unrelated migrations need no such flag.
    const compassoEnd = journal.entries.find(
      (entry) => entry.tag === "0162_military_dexter_bennett",
    )?.when;
    if (
      process.env.RAILWAY_ENVIRONMENT_ID &&
      compassoEnd !== undefined &&
      !applied.includes(compassoEnd) &&
      process.env.COMPASSO_CUTOVER_RELEASE !== "compasso-2026-11"
    )
      throw new MigrationPreconditionError("CUTOVER_HELD");
    console.log("[db:migrate] applying migrations from ./src/migrations");
    await migrate(drizzle(migrationsClient), {
      migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)),
    });
    if (assessMigrationHistory(expected, await readHistory()) !== "ready")
      throw new MigrationPreconditionError("HISTORY_INCOMPLETE");
    console.log("[db:migrate] done.");
  } finally {
    await migrationsClient.end();
  }
}

main().catch((error) => {
  console.error("[db:migrate] failed:", migrationFailure(error));
  process.exit(1);
});
