import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Run through pnpm edi:test:integration.");
if (process.platform !== "win32")
  throw new Error(
    "This portable database runner targets Windows. On CI use an isolated PostgreSQL service.",
  );
const { initdb, pg_ctl } = await import("@embedded-postgres/windows-x64");
const temporaryRoot = await mkdtemp(join(tmpdir(), "edi-integration-"));
const probe = createServer();
await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", resolve);
});
const address = probe.address();
if (!address || typeof address === "string") throw new Error("Cannot reserve a test port.");
await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
const password = randomBytes(32).toString("hex");
const databaseDir = join(temporaryRoot, "data");
const passwordFile = join(temporaryRoot, "password");
await writeFile(passwordFile, password, { flag: "wx", mode: 0o600 });
function databaseCommand(binary, args) {
  // Background postgres workers inherit native handles on Windows. Use no
  // captured pipes for pg_ctl; the server log already goes to our owned file.
  const result = spawnSync(binary, args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: binary === pg_ctl ? "ignore" : "pipe",
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Temporary PostgreSQL command failed (${result.status}): ${result.stderr ?? "see the disposable server log"}`,
    );
}
const childEnv = {
  ...process.env,
  DATABASE_URL: `postgres://edi_check:${password}@127.0.0.1:${address.port}/postgres`,
  EDI_ISOLATED_DATABASE: "1",
};
for (const key of ["REDIS_URL", "STRIPE_SECRET_KEY", "SENDGRID_API_KEY", "SENTRY_DSN"])
  delete childEnv[key];
function run(args) {
  const child = spawnSync(process.execPath, [pnpm, ...args], {
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`Isolated verification failed: ${args.join(" ")} (${child.status})`);
}
let started = false;
const failures = [];
try {
  databaseCommand(initdb, [
    "-D",
    databaseDir,
    "--username=edi_check",
    "--auth=scram-sha-256",
    `--pwfile=${passwordFile}`,
    "--encoding=UTF8",
    "--locale=C",
  ]);
  await rm(passwordFile);
  databaseCommand(pg_ctl, [
    "-D",
    databaseDir,
    "-l",
    join(temporaryRoot, "postgres.log"),
    "-o",
    `-h 127.0.0.1 -p ${address.port}`,
    "-w",
    "start",
  ]);
  started = true;
  console.log("[edi] Temporary loopback PostgreSQL started; no existing database is used.");
  run(["--filter", "@informach/db", "db:migrate"]);
  run(["--filter", "@informach/auth", "test:integration"]);
  run(["--filter", "@informach/edi-licensing", "test:integration"]);
  run(["--filter", "@informach/edi", "test:integration"]);
  if (process.argv.includes("--portal")) run(["exec", "node", "scripts/edi/test-portal.mts"]);
} catch (error) {
  failures.push(error);
}
try {
  if (started) databaseCommand(pg_ctl, ["-D", databaseDir, "-m", "fast", "-w", "stop"]);
  const target = resolve(temporaryRoot);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("edi-integration-"))
    throw new Error("Refusing to remove an unexpected temporary directory.");
  await rm(target, { recursive: true });
  console.log("[edi] Temporary database stopped and its disposable directory removed.");
} catch (error) {
  failures.push(error);
}
if (failures.length) throw new AggregateError(failures, "Edi isolated verification failed.");
