import postgres from "postgres";

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
    select count(*)::integer as count
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
      ) as report_request_key_present
  `;

  const result = {
    migrations: migrationState?.count ?? 0,
    ...schemaState,
  };
  const expected = {
    migrations: 50,
    releases_removed: true,
    content_controls_present: true,
    report_updates_present: true,
    confirmed_at_present: true,
    profile_access_present: true,
    report_request_key_present: true,
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
