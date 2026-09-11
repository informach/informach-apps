import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { db, sql } from "@informach/db";
import { config as loadEnv } from "dotenv";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = resolve(appDir, "../..");
loadEnv({ path: resolve(appDir, ".env.local") });
loadEnv({ path: resolve(rootDir, ".env") });

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const pnpmCli = process.env.npm_execpath;
  if (!databaseUrl || !pnpmCli)
    throw new Error("Run this suite with pnpm and a local DATABASE_URL");
  const url = new URL(databaseUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    throw new Error("Integration database administration is restricted to localhost");
  const databaseName = `cozya_review_${randomUUID().replaceAll("-", "")}`;
  url.pathname = `/${databaseName}`;
  const childEnv = {
    ...process.env,
    DATABASE_URL: url.toString(),
    COZYA_ISOLATED_INTEGRATION: "1",
  };
  const run = (args: string[], cwd: string) => {
    const result = spawnSync(process.execPath, [pnpmCli, ...args], {
      cwd,
      env: childEnv,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Integration command failed (exit ${result.status}): ${args.join(" ")}`);
  };
  await db.execute(sql`CREATE DATABASE ${sql.identifier(databaseName)}`);
  console.log(`[integration] Created isolated local database ${databaseName}`);
  try {
    run(["db:migrate"], rootDir);
    run(["exec", "vitest", "run", "--config", "vitest.integration.config.ts"], appDir);
  } finally {
    // This exact identifier was generated and created above; never drop the configured database.
    await db.execute(sql`DROP DATABASE ${sql.identifier(databaseName)} WITH (FORCE)`);
    console.log(`[integration] Removed ${databaseName}`);
  }
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : "Integration runner failed");
    process.exit(1);
  },
);
