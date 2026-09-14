import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const productionUrl = process.env.DATABASE_PUBLIC_URL;
if (!productionUrl) throw new Error("DATABASE_PUBLIC_URL is required");
const root = resolve(import.meta.dirname, "../../..");
const databaseName = `missao_restore_${randomBytes(12).toString("hex")}`;
const containerName = `missao-pg18-${randomBytes(8).toString("hex")}`;
const temporaryPassword = randomBytes(24).toString("base64url");
const outputDirectory = resolve(root, "apps/missao-saber/tmp/production");
const dumpName = `pre-0044-0049-${databaseName}.dump`;
const dumpPath = resolve(outputDirectory, dumpName);
mkdirSync(outputDirectory, { recursive: true });

function docker(args, extraEnvironment = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: { ...process.env, ...extraEnvironment },
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Docker ${args[0]} failed with exit ${result.status}: ${result.stderr.trim().slice(-2000)}`,
    );
  return result.stdout.trim();
}

function dockerPostgres(args, databaseUrl) {
  const connection = new URL(databaseUrl);
  const pgEnvironment = {
    PGHOST: connection.hostname,
    PGPORT: connection.port || "5432",
    PGUSER: decodeURIComponent(connection.username),
    PGPASSWORD: decodeURIComponent(connection.password),
    PGDATABASE: connection.pathname.slice(1),
    PGSSLMODE: connection.searchParams.get("sslmode") ?? "prefer",
  };
  const result = spawnSync(
    "docker",
    [
      "run",
      "--rm",
      "-e",
      "PGHOST",
      "-e",
      "PGPORT",
      "-e",
      "PGUSER",
      "-e",
      "PGPASSWORD",
      "-e",
      "PGDATABASE",
      "-e",
      "PGSSLMODE",
      "-v",
      `${outputDirectory}:/backup`,
      "postgres:18-alpine",
      ...args,
    ],
    {
      cwd: root,
      env: { ...process.env, ...pgEnvironment },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `PostgreSQL ${args[0]} failed with exit ${result.status}: ${result.stderr.trim().slice(-2000)}`,
    );
}

async function counts(sql) {
  const [row] = await sql`
    select
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
      (select count(*)::int from core.users) as users,
      (select count(*)::int
         from information_schema.tables
        where table_schema not in ('pg_catalog', 'information_schema')) as tables
  `;
  return row;
}

async function waitForPostgres() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const ready = spawnSync("docker", ["exec", containerName, "pg_isready", "-U", "postgres"], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (ready.status === 0) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error("Temporary PostgreSQL 18 did not become ready");
}

let restored;
let containerStarted = false;
try {
  const production = postgres(productionUrl, { max: 1, connect_timeout: 15 });
  let sourceCounts;
  try {
    sourceCounts = await counts(production);
  } finally {
    await production.end();
  }

  dockerPostgres(
    ["pg_dump", "--format=custom", `--file=/backup/${dumpName}`, "--no-owner", "--no-privileges"],
    productionUrl,
  );

  docker(
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
      "--volume",
      `${outputDirectory}:/backup`,
      "postgres:18-alpine",
    ],
    { POSTGRES_PASSWORD: temporaryPassword },
  );
  containerStarted = true;
  await waitForPostgres();
  docker(
    ["exec", "--env", "PGPASSWORD", containerName, "createdb", "-U", "postgres", databaseName],
    { PGPASSWORD: temporaryPassword },
  );
  docker(
    [
      "exec",
      "--env",
      "PGPASSWORD",
      containerName,
      "pg_restore",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "-U",
      "postgres",
      "--dbname",
      databaseName,
      `/backup/${dumpName}`,
    ],
    { PGPASSWORD: temporaryPassword },
  );

  const mappedPort = docker(["port", containerName, "5432/tcp"]).split(":").at(-1);
  if (!mappedPort || !/^\d+$/.test(mappedPort)) throw new Error("Could not read mapped port");
  const targetUrl = `postgresql://postgres:${temporaryPassword}@127.0.0.1:${mappedPort}/${databaseName}`;
  restored = postgres(targetUrl.toString(), { max: 1 });
  const restoredCounts = await counts(restored);
  if (JSON.stringify(sourceCounts) !== JSON.stringify(restoredCounts))
    throw new Error("Restored database counts differ from the production snapshot");
  const dump = readFileSync(dumpPath);
  console.log(
    JSON.stringify({
      restored: true,
      sourceCounts,
      restoredCounts,
      bytes: statSync(dumpPath).size,
      sha256: createHash("sha256").update(dump).digest("hex"),
      temporaryDatabaseRemoved: true,
      localDumpRemoved: true,
    }),
  );
} finally {
  await restored?.end();
  if (containerStarted)
    spawnSync("docker", ["rm", "--force", containerName], {
      stdio: "ignore",
      windowsHide: true,
    });
  rmSync(dumpPath, { force: true });
}
