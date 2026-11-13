import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { join } from "node:path";

// Use the database workspace's locked driver rather than resolving an unrelated global client.
const postgres = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
  "postgres",
);
const OWNED_DATABASE = /^compasso_review_[a-f0-9]{24}$/;

/** Creates a new database on the existing local CI service; it never migrates the source database. */
export async function createCiPostgresFixture(baseUrl) {
  const url = new URL(baseUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
  )
    throw new Error("CI verification requires its local PostgreSQL service");
  const name = `compasso_review_${randomBytes(12).toString("hex")}`;
  if (!OWNED_DATABASE.test(name)) throw new Error("Unexpected fixture database name");
  const admin = postgres(url.toString(), { max: 1, prepare: false });
  let created = false;
  async function dispose() {
    try {
      if (created) {
        // Only the exact name successfully created by this instance may be removed.
        await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
        created = false;
      }
    } finally {
      await admin.end();
    }
  }
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    return { url: url.toString(), dispose };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "PostgreSQL fixture preparation and cleanup failed",
      );
    }
    throw error;
  }
}

/** The caller owns and removes directory only after this server has been stopped. */
export async function createPostgresFixture(directory) {
  if (process.platform !== "win32") {
    if (process.env.CI !== "true" || !process.env.DATABASE_URL)
      throw new Error("On non-Windows hosts, run in CI with its explicit local PostgreSQL service");
    return createCiPostgresFixture(process.env.DATABASE_URL);
  }
  const binaries = await import("@embedded-postgres/windows-x64");
  const socket = createServer();
  await new Promise((done, fail) => {
    socket.once("error", fail);
    socket.listen(0, "127.0.0.1", done);
  });
  const address = socket.address();
  if (!address || typeof address === "string") throw new Error("No fixture port allocated");
  await new Promise((done, fail) => socket.close((error) => (error ? fail(error) : done())));
  const data = join(directory, "postgres");
  const credential = join(directory, "credential");
  const password = randomBytes(32).toString("hex");
  await writeFile(credential, password, { flag: "wx", mode: 0o600 });
  let started = false;
  function run(binary, args) {
    const result = spawnSync(binary, args, {
      windowsHide: true,
      encoding: "utf8",
      stdio: "ignore",
    });
    if (result.error || result.status !== 0)
      throw new Error(`Disposable PostgreSQL command failed (${result.status ?? "launch"})`);
  }
  async function dispose() {
    // pg_ctl can fail after launching the owned server. Its PID file still requires cleanup.
    if (!started && !existsSync(join(data, "postmaster.pid"))) return;
    run(binaries.pg_ctl, ["-D", data, "-m", "fast", "-w", "stop"]);
    started = false;
  }
  try {
    run(binaries.initdb, [
      "-D",
      data,
      "--username=compasso_test",
      "--auth=scram-sha-256",
      `--pwfile=${credential}`,
      "--encoding=UTF8",
      "--locale=C",
    ]);
    await rm(credential);
    run(binaries.pg_ctl, [
      "-D",
      data,
      "-l",
      join(directory, "postgres.log"),
      "-o",
      `-h 127.0.0.1 -p ${address.port}`,
      "-w",
      "start",
    ]);
    started = true;
    return {
      url: `postgres://compasso_test:${password}@127.0.0.1:${address.port}/postgres`,
      dispose,
    };
  } catch (error) {
    try {
      await dispose();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "PostgreSQL fixture preparation and cleanup failed",
      );
    }
    throw error;
  }
}
