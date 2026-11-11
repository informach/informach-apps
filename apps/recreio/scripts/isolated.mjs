import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

// Verificação isolada do Recreio: cria um banco descartável no PostgreSQL
// local, aplica as migrations, roda os testes de integração e apaga o banco.
// Por enquanto só existe o modo `integration`; E2E e preview chegam com as
// jornadas do portal.
const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "../..");
loadEnv({ path: resolve(root, ".env") });
const mode = process.argv[2];
if (mode !== "integration") throw new Error("Choose integration");
const baseUrl = process.env.DATABASE_URL;
const pnpmCli = process.env.npm_execpath;
if (!baseUrl || !pnpmCli)
  throw new Error("Run with pnpm and a local DATABASE_URL (root .env supported)");
const url = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error("Only explicitly local PostgreSQL administration is allowed");
const name = `recreio_review_${randomUUID().replaceAll("-", "")}`;
if (!/^recreio_review_[a-f0-9]{32}$/.test(name)) throw new Error("Invalid isolated database name");
const admin = postgres(baseUrl, { max: 1 });
url.pathname = `/${name}`;
const origin = "http://localhost:3009";
const testEnv = {
  DATABASE_URL: url.toString(),
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  SENDGRID_API_KEY: "SG.local-not-sent",
  SENDGRID_FROM: "Recreio <nao-responda@example.test>",
  EMAIL_SANDBOX_MODE: "memory",
  RECREIO_ACCESS_MODE: "fechado",
  SENTRY_AUTH_TOKEN: "",
};
const childEnv = { ...process.env, ...testEnv, RECREIO_ISOLATED_TEST: "1" };
// Isolated verification must not inherit optional production transports. In
// particular, Better Auth stores sessions in Redis when REDIS_URL is present;
// that would bypass the disposable PostgreSQL database created above and make
// the run share state with the caller's environment.
for (const key of ["REDIS_URL", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"]) delete childEnv[key];
function run(args, cwd) {
  const child = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd,
    env: childEnv,
    stdio: "inherit",
    windowsHide: true,
  });
  if (child.error) throw child.error;
  if (child.status !== 0)
    throw new Error(`Verification command failed: ${args.join(" ")} (exit ${child.status})`);
}
let created = false;
try {
  // The identifier is generated above and restricted by a closed regular expression.
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`[recreio] Isolated local database created: ${name}`);
  run(["--filter", "@informach/db", "db:migrate"], root);
  run(
    ["exec", "vitest", "run", "--config", "vitest.integration.config.ts", ...process.argv.slice(3)],
    app,
  );
} finally {
  if (created) {
    await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`[recreio] Removed isolated database ${name}`);
  }
  await admin.end();
}
