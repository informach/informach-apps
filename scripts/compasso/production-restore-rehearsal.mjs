// Rehearses the Compasso cutover on a copy of the real production database.
//
// 1. Reads the source only: row counts inside a read-only transaction and a
//    custom-format pg_dump (owners and privileges included).
// 2. Restores into a disposable PostgreSQL 18 container on loopback, after
//    creating the same non-system roles there (NOLOGIN, no password copied),
//    so ownership and grants are checked instead of discarded.
// 3. Runs the migrator's exact sequence against the copy and measures it:
//    `pnpm db:migrate && pnpm db:seed && pnpm db:seed:reference`.
// 4. Compares before/after facts that must survive and runs the sequence a
//    second time to prove nothing is duplicated.
// 5. Removes the container and the dump unless --keep is passed (to run the
//    apps against the copy); the dump never leaves this machine.
//
// Usage, through Railway so the URL never lands in a file or the shell history:
//   railway run --service Postgres --environment production -- pnpm compasso:rehearse:restore [--keep]
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const postgres = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
  "postgres",
);

const sourceUrl = process.env.DATABASE_PUBLIC_URL;
if (!sourceUrl) throw new Error("DATABASE_PUBLIC_URL is required");
const localDumpHost = process.env.COMPASSO_LOCAL_DUMP_HOST;
if (
  localDumpHost &&
  (!["127.0.0.1", "localhost"].includes(new URL(sourceUrl).hostname) || !isIP(localDumpHost))
)
  throw new Error("COMPASSO_LOCAL_DUMP_HOST only accepts an IP for a loopback fixture source");
if (!process.env.npm_execpath) throw new Error("Run through `pnpm compasso:rehearse:restore`");
const keep = process.argv.includes("--keep");
if (process.argv.slice(2).some((argument) => argument !== "--keep"))
  throw new Error("Unknown restoration rehearsal option");
const root = resolve(import.meta.dirname, "../..");
const workDirectory = mkdtempSync(join(tmpdir(), "compasso-restore-"));
const databaseName = `compasso_restore_${randomBytes(8).toString("hex")}`;
const containerName = `compasso-restore-${randomBytes(6).toString("hex")}`;
const temporaryPassword = randomBytes(24).toString("base64url");
const dumpName = "production.dump";
const dumpPath = join(workDirectory, dumpName);
const IMAGE = "postgres:18-alpine";

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${binary} ${args[0]} failed with exit ${result.status}: ${String(result.stderr).trim().slice(-2000)}`,
    );
  return String(result.stdout).trim();
}

function pgEnvironment(url) {
  const connection = new URL(url);
  return {
    PGHOST: ["127.0.0.1", "localhost"].includes(connection.hostname)
      ? (localDumpHost ?? "host.docker.internal")
      : connection.hostname,
    // This override is only for a standard PostgreSQL fixture container; the
    // published loopback port and its internal 5432 are different endpoints.
    PGPORT: localDumpHost ? "5432" : connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1),
    PGSSLMODE: connection.searchParams.get("sslmode") ?? "prefer",
    PGCONNECT_TIMEOUT: "15",
  };
}

/** Facts that must be identical after restore and must survive migration. */
async function facts(sql) {
  return sql.begin("isolation level repeatable read read only", readFacts);
}
async function readFacts(tx) {
  const [server] = await tx`select current_setting('server_version_num')::int as version`;
  const migrations = await tx`select count(*)::int as applied, max(created_at)::text as last
      from drizzle.__drizzle_migrations`;
  const tables = await tx`select table_schema, table_name from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
      order by 1, 2`;
  const counts = {};
  for (const { table_schema: schema, table_name: name } of tables) {
    const [row] = await tx`select count(*)::bigint::text as n from ${tx(schema)}.${tx(name)}`;
    counts[`${schema}.${name}`] = Number(row.n);
  }
  const owners =
    await tx`select n.nspname as schema, c.relname as name, pg_get_userbyid(c.relowner) as owner
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'S', 'v', 'm', 'f') and n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
      order by 1, 2`;
  const grants = await tx`select grantor, grantee, table_schema, table_name,
      privilege_type, is_grantable, with_hierarchy
      from information_schema.table_privileges
      where table_schema not in ('pg_catalog', 'information_schema')
      order by 1, 2, 3, 4, 5, 6, 7`;
  const has = (key) => key in counts;
  // Money and identity facts that the cutover must preserve exactly.
  const [billing] = has("billing.credit_ledger")
    ? await tx`select
          (select count(*)::int from billing.subscriptions) as subscriptions,
          (select count(*)::int from billing.customers) as customers,
          (select coalesce(sum(amount), 0)::bigint::text from billing.credit_ledger) as ledger_sum,
          (select count(*)::int from billing.credit_reservations where status = 'active') as active_reservations,
          (select count(*)::int from billing.webhook_events where processed_at is null) as pending_webhooks,
          (select md5(coalesce(string_agg(id::text || ':' || status::text || ':' || current_period_end::text, ',' order by id), ''))
             from billing.subscriptions) as subscriptions_digest,
          (select count(*)::int from billing.customers where app = 'dia-de-estrela') as dia_customers`
    : [null];
  const [identity] = await tx`select count(*)::int as users,
      md5(coalesce(string_agg(id || ':' || email, ',' order by id), '')) as users_digest from core.users`;
  return {
    server: server.version,
    migrations: migrations[0],
    counts,
    owners,
    grants,
    billing,
    identity,
  };
}

async function waitReady() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ready = spawnSync(
      "docker",
      ["exec", containerName, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
      {
        encoding: "utf8",
        windowsHide: true,
      },
    );
    if (ready.status === 0) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Temporary PostgreSQL did not become ready");
}

function migrator(targetUrl) {
  if (!["127.0.0.1", "localhost"].includes(new URL(targetUrl).hostname))
    throw new Error("The migrator rehearsal only runs against the loopback copy");
  const env = {
    ...process.env,
    DATABASE_URL: targetUrl,
    DATABASE_PUBLIC_URL: "",
    NODE_ENV: "production",
  };
  const started = performance.now();
  for (const script of ["db:migrate", "db:seed", "db:seed:reference"])
    run(process.execPath, [process.env.npm_execpath ?? "pnpm", script], { env, stdio: "pipe" });
  return Math.round(performance.now() - started);
}

let target;
let containerStarted = false;
const failures = [];
const report = {};
try {
  const source = postgres(sourceUrl, { max: 1, connect_timeout: 15, prepare: false });
  let before;
  let roles;
  try {
    // The inventory and pg_dump must observe exactly the same committed data.
    // Keep the exported snapshot alive until pg_dump has finished reading it.
    await source.begin("isolation level repeatable read read only", async (tx) => {
      const [snapshot] = await tx`select pg_export_snapshot() as id`;
      before = await readFacts(tx);
      if (Math.floor(before.server / 10000) !== 18)
        throw new Error(`Production is PostgreSQL ${before.server}; use matching client tools`);
      roles = await tx`select rolname from pg_roles
        where rolname !~ '^pg_' and rolname not in ('postgres') order by 1`;
      // Stream the dump through the client into a private file. Bind mounts
      // cannot reach this private directory with a rootless/remote daemon.
      const dumpFile = openSync(dumpPath, "wx", 0o600);
      try {
        run(
          "docker",
          [
            "run",
            "--rm",
            "--add-host=host.docker.internal:host-gateway",
            ...Object.keys(pgEnvironment(sourceUrl)).flatMap((name) => ["-e", name]),
            IMAGE,
            "pg_dump",
            "--format=custom",
            `--snapshot=${snapshot.id}`,
          ],
          {
            env: { ...process.env, ...pgEnvironment(sourceUrl) },
            stdio: ["ignore", dumpFile, "pipe"],
          },
        );
      } finally {
        closeSync(dumpFile);
      }
    });
  } finally {
    await source.end();
  }
  if (Math.floor(before.server / 10000) !== 18)
    throw new Error(`Production is PostgreSQL ${before.server}; use matching client tools`);
  report.source = {
    server: before.server,
    migrations: before.migrations,
    tables: Object.keys(before.counts).length,
    rows: Object.values(before.counts).reduce((sum, value) => sum + value, 0),
    billing: before.billing,
    users: before.identity.users,
  };

  const dump = readFileSync(dumpPath);
  report.dump = {
    bytes: statSync(dumpPath).size,
    sha256: createHash("sha256").update(dump).digest("hex"),
  };

  run(
    "docker",
    [
      "run",
      "--detach",
      "--rm",
      "--name",
      containerName,
      "--env",
      "POSTGRES_PASSWORD",
      "--publish",
      "127.0.0.1::5432",
      IMAGE,
    ],
    { env: { ...process.env, POSTGRES_PASSWORD: temporaryPassword } },
  );
  containerStarted = true;
  await waitReady();
  run("docker", ["cp", dumpPath, `${containerName}:/tmp/${dumpName}`]);
  const exec = (args) =>
    run("docker", ["exec", "--env", "PGPASSWORD", containerName, ...args], {
      env: { ...process.env, PGPASSWORD: temporaryPassword },
    });
  for (const { rolname } of roles)
    exec([
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `create role "${rolname.replaceAll('"', '""')}" nologin`,
    ]);
  exec(["createdb", "-U", "postgres", databaseName]);
  exec([
    "pg_restore",
    "--exit-on-error",
    "-U",
    "postgres",
    "--dbname",
    databaseName,
    `/tmp/${dumpName}`,
  ]);
  exec(["rm", "-f", `/tmp/${dumpName}`]);
  const port = run("docker", ["port", containerName, "5432/tcp"]).split(":").at(-1);
  if (!port || !/^\d+$/.test(port)) throw new Error("Could not read mapped port");
  const targetUrl = `postgresql://postgres:${temporaryPassword}@127.0.0.1:${port}/${databaseName}`;
  target = postgres(targetUrl, { max: 1, prepare: false });
  const restored = await facts(target);
  for (const key of ["counts", "owners", "grants", "billing", "identity", "migrations"])
    if (JSON.stringify(before[key]) !== JSON.stringify(restored[key]))
      throw new Error(`Restored ${key} differ from the production snapshot`);
  report.restore = { identical: true, roles: roles.length };

  report.migration = { firstRunMs: migrator(targetUrl) };
  const migrated = await facts(target);
  report.migration.applied = migrated.migrations;
  // Identity and money must survive the cutover unchanged.
  if (JSON.stringify(migrated.identity) !== JSON.stringify(before.identity))
    throw new Error("Users changed during migration");
  if (before.billing)
    for (const key of [
      "subscriptions",
      "customers",
      "ledger_sum",
      "subscriptions_digest",
      "dia_customers",
    ])
      if (String(migrated.billing?.[key]) !== String(before.billing[key]))
        throw new Error(`billing.${key} changed during migration`);
  if (before.billing?.dia_customers) throw new Error("Dia de Estrela has billing customers");
  report.migration.tables = {
    removed: Object.keys(before.counts).filter((key) => !(key in migrated.counts)),
    added: Object.keys(migrated.counts).filter((key) => !(key in before.counts)).length,
    shrunk: Object.keys(before.counts).filter(
      (key) => key in migrated.counts && migrated.counts[key] < before.counts[key],
    ),
  };
  report.migration.family = {
    groups: migrated.counts["family.groups"] ?? 0,
    people: migrated.counts["family.people"] ?? 0,
    migrationSources: migrated.counts["family.migration_sources"] ?? 0,
  };

  report.repeat = { secondRunMs: migrator(targetUrl) };
  const repeated = await facts(target);
  if (JSON.stringify(repeated.counts) !== JSON.stringify(migrated.counts))
    throw new Error("A second migrator run changed row counts");
  report.repeat.unchanged = true;
  if (keep) report.kept = { container: containerName, port: Number(port), database: databaseName };
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  failures.push(error);
} finally {
  try {
    await target?.end();
  } catch (error) {
    failures.push(error);
  }
  if (containerStarted) {
    const removed = spawnSync("docker", ["exec", containerName, "rm", "-f", `/tmp/${dumpName}`], {
      stdio: "ignore",
      windowsHide: true,
      timeout: 30_000,
    });
    if (removed.status !== 0) failures.push(new Error("Unable to remove the container's dump"));
    if (!keep) {
      const stopped = spawnSync("docker", ["rm", "--force", "--volumes", containerName], {
        stdio: "ignore",
        windowsHide: true,
        timeout: 30_000,
      });
      if (stopped.status !== 0)
        failures.push(new Error("Unable to remove the restoration container"));
    }
  }
  // The dump holds personal data: it never outlives the run, even with --keep.
  try {
    rmSync(dumpPath, { force: true });
    if (!keep) rmSync(workDirectory, { recursive: true, force: true });
  } catch (error) {
    failures.push(error);
  }
}
if (failures.length) throw new AggregateError(failures, "Restoration rehearsal failed");
