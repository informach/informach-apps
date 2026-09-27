import { readFileSync } from "node:fs";
import postgres from "postgres";

/* O número esperado vem do journal deste checkout: produção precisa ter pelo
   menos essas migrações (pode ter mais, depois de um rollback do app). */
const journal = JSON.parse(
  readFileSync(
    new URL("../../../packages/db/src/migrations/meta/_journal.json", import.meta.url),
    "utf8",
  ),
);
const expectedMigrations = journal.entries.length;
const lastMigrationAt = journal.entries.at(-1)?.when ?? 0;

const databaseUrl = process.env.DATABASE_PUBLIC_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_PUBLIC_URL is required");
}

const sql = postgres(databaseUrl, {
  max: 1,
  connect_timeout: 15,
  idle_timeout: 5,
  ssl: "require",
});

try {
  const [migrationState] = await sql`
    select count(*)::integer as count, coalesce(max(created_at), 0)::bigint as latest
    from drizzle.__drizzle_migrations
  `;
  const [schemaState] = await sql`
    select
      to_regclass('missao_saber.releases') is null as releases_removed,
      to_regclass('missao_saber.content_controls') is not null as content_controls_present,
      to_regclass('missao_saber.report_updates') is not null as report_updates_present,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'billing'
          and table_name = 'subscriptions'
          and column_name = 'confirmed_at'
      ) as confirmed_at_present,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'missao_saber'
          and table_name = 'profiles'
          and column_name = 'access_enabled'
      ) as profile_access_present,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'missao_saber'
          and table_name = 'reports'
          and column_name = 'request_key'
      ) as report_request_key_present,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'missao_saber'
          and table_name = 'profiles'
          and column_name = 'grade_year'
      ) as profile_grade_year_present,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'missao_saber'
          and table_name = 'profiles'
          and column_name = 'birth_month'
      ) as profile_birth_month_present
  `;

  const result = {
    migrations: migrationState?.count ?? 0,
    ...schemaState,
  };
  // Mesmo critério do /api/ready: o banco não pode estar atrás do journal.
  if (Number(migrationState?.latest ?? 0) < lastMigrationAt) {
    throw new Error(
      `Production schema behind: latest migration ${migrationState?.latest} is older than ${lastMigrationAt}`,
    );
  }
  if (result.migrations < expectedMigrations) {
    throw new Error(
      `Production schema behind: expected at least ${expectedMigrations} migrations, received ${result.migrations}`,
    );
  }
  const expected = {
    releases_removed: true,
    content_controls_present: true,
    report_updates_present: true,
    confirmed_at_present: true,
    profile_access_present: true,
    report_request_key_present: true,
    profile_grade_year_present: true,
    profile_birth_month_present: true,
  };

  for (const [key, expectedValue] of Object.entries(expected)) {
    if (result[key] !== expectedValue) {
      throw new Error(
        `Production schema mismatch for ${key}: expected ${expectedValue}, received ${result[key]}`,
      );
    }
  }

  console.log(JSON.stringify(result, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
