import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";
import postgres from "postgres";

const root = resolve(import.meta.dirname, "../../..");
const app = resolve(root, "apps/missao-saber");
const rootEnv = parse(readFileSync(resolve(root, ".env")));
const localEnv = parse(readFileSync(resolve(app, ".env.local")));
const command = process.argv[2];
const suppliedName = process.argv[3];
const providerPort = process.env.MISSAO_PROVIDER_PORT ?? "3005";
const pnpmCli = process.env.npm_execpath;
const baseUrl = rootEnv.DATABASE_URL;

if (!baseUrl || !pnpmCli) throw new Error("Run this harness with pnpm and a root DATABASE_URL");
const adminUrl = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(adminUrl.hostname))
  throw new Error("Provider homologation requires explicitly local PostgreSQL");
if (localEnv.STRIPE_MODE !== "dev" || !/^(sk|rk)_test_/.test(localEnv.STRIPE_SECRET_KEY ?? ""))
  throw new Error("Provider homologation requires Stripe test mode");
if (!/^\d{4,5}$/.test(providerPort) || Number(providerPort) > 65535)
  throw new Error("MISSAO_PROVIDER_PORT must be a local TCP port");

function validName(value) {
  if (!/^missao_provider_[a-f0-9]{32}$/.test(value ?? ""))
    throw new Error("Invalid disposable database name");
  return value;
}

function run(args, env) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Command failed with exit ${result.status}`);
}

const admin = postgres(baseUrl, { max: 1 });
try {
  if (command === "setup") {
    const name = `missao_provider_${randomBytes(16).toString("hex")}`;
    validName(name);
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    adminUrl.pathname = `/${name}`;
    const emailDirectory = resolve(app, `tmp/provider-emails-${name}`);
    mkdirSync(emailDirectory, { recursive: true });
    run(["--filter", "@informach/db", "db:migrate"], {
      ...process.env,
      DATABASE_URL: adminUrl.toString(),
    });
    console.log(`MISSAO_PROVIDER_DATABASE=${name}`);
    console.log(`MISSAO_PROVIDER_EMAILS=${emailDirectory.replaceAll("\\", "/")}`);
  } else if (command === "serve") {
    const name = validName(suppliedName);
    adminUrl.pathname = `/${name}`;
    const emailDirectory = resolve(app, `tmp/provider-emails-${name}`);
    const origin = `http://localhost:${providerPort}`;
    run(["--filter", "@informach/missao-saber", "exec", "next", "dev", "-p", providerPort], {
      ...process.env,
      DATABASE_URL: adminUrl.toString(),
      BETTER_AUTH_URL: origin,
      NEXT_PUBLIC_APP_URL: origin,
      EMAIL_SANDBOX_MODE: "sandbox",
      EMAIL_SANDBOX_DIR: emailDirectory.replaceAll("\\", "/"),
    });
  } else if (command === "cleanup") {
    const name = validName(suppliedName);
    await admin.unsafe(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [name],
    );
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
    console.log(`Removed disposable database ${name}`);
  } else {
    throw new Error("Choose setup, serve or cleanup");
  }
} finally {
  await admin.end();
}
