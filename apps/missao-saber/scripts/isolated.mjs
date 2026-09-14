import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(app, "../..");
loadEnv({ path: resolve(root, ".env") });
const mode = process.argv[2];
if (!["integration", "e2e", "preview"].includes(mode))
  throw new Error("Choose integration, e2e or preview");
const baseUrl = process.env.DATABASE_URL;
const pnpmCli = process.env.npm_execpath;
if (!baseUrl || !pnpmCli)
  throw new Error("Run with pnpm and a local DATABASE_URL (root .env supported)");
const url = new URL(baseUrl);
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  throw new Error("Only explicitly local PostgreSQL administration is allowed");
if (mode === "preview" && existsSync(resolve(app, ".env.local")))
  throw new Error(
    "Preview .env.local already exists; keep the current preview or choose a separate environment",
  );
const name = `missao_${mode === "preview" ? "preview" : "review"}_${randomUUID().replaceAll("-", "")}`;
if (!/^missao_(preview|review)_[a-f0-9]{32}$/.test(name))
  throw new Error("Invalid isolated database name");
const admin = postgres(baseUrl, { max: 1 });
url.pathname = `/${name}`;
const e2ePort = process.env.MISSAO_E2E_PORT ?? "3105";
const parsedE2ePort = Number(e2ePort);
if (!Number.isInteger(parsedE2ePort) || parsedE2ePort < 1024 || parsedE2ePort > 65535)
  throw new Error("MISSAO_E2E_PORT must be a local TCP port from 1024 to 65535");
const origin = mode === "e2e" ? `http://localhost:${e2ePort}` : "http://localhost:3005";
const e2eRunId = mode === "e2e" ? randomBytes(12).toString("hex") : "";
const generatedPaths = e2eRunId
  ? [resolve(app, `.next-isolated-${e2eRunId}`), resolve(app, `test-results-${e2eRunId}`)]
  : [];
for (const generatedPath of generatedPaths) {
  const generatedName = basename(generatedPath);
  const expectedName = generatedPath.includes("test-results-")
    ? `test-results-${e2eRunId}`
    : `.next-isolated-${e2eRunId}`;
  if (dirname(generatedPath) !== app || generatedName !== expectedName)
    throw new Error("Refusing to use an unexpected isolated artifact path");
}
const testEnv = {
  DATABASE_URL: url.toString(),
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  BETTER_AUTH_URL: origin,
  NEXT_PUBLIC_APP_URL: origin,
  SENDGRID_API_KEY: "SG.local-not-sent",
  SENDGRID_FROM: "Missão Saber <nao-responda@example.test>",
  SENDGRID_WEBHOOK_PUBLIC_KEY: "",
  EMAIL_SANDBOX_MODE: mode === "integration" ? "memory" : "sandbox",
  EMAIL_SANDBOX_DIR: resolve(app, "tmp/emails").replaceAll("\\", "/"),
  STRIPE_SECRET_KEY: "sk_test_local_disabled",
  STRIPE_WEBHOOK_SECRET: "whsec_local_disabled",
  STRIPE_MODE: "dev",
  CRON_SECRET: randomBytes(32).toString("hex"),
  MISSAO_CONTENT_MANAGER_IDS: "",
  MISSAO_CONTENT_MANAGER_EMAILS: "",
  MISSAO_INDIVIDUAL_MONTHLY_PRICE: "",
  MISSAO_INDIVIDUAL_ANNUAL_PRICE: "",
  MISSAO_FAMILY_MONTHLY_PRICE: "",
  MISSAO_FAMILY_ANNUAL_PRICE: "",
  SENTRY_AUTH_TOKEN: "",
  MISSAO_E2E_RUN_ID: e2eRunId,
};
const childEnv = { ...process.env, ...testEnv, MISSAO_ISOLATED_TEST: "1" };
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
let preserve = false;
try {
  // The identifier is generated above and restricted by a closed regular expression.
  await admin.unsafe(`CREATE DATABASE "${name}"`);
  created = true;
  console.log(`[missao] Isolated local database created: ${name}`);
  run(["--filter", "@informach/db", "db:migrate"], root);
  if (mode === "preview") {
    writeFileSync(
      resolve(app, ".env.local"),
      `${Object.entries(testEnv)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")}\n`,
      { flag: "wx" },
    );
    preserve = true;
    console.log(
      "[missao] Local preview configured; run pnpm --filter @informach/missao-saber dev. No external providers enabled.",
    );
  } else if (mode === "e2e") {
    run(["exec", "next", "build"], app);
    run(["exec", "playwright", "test"], app);
  } else run(["exec", "vitest", "run", "--config", "vitest.integration.config.ts"], app);
} finally {
  for (const generatedPath of generatedPaths)
    rmSync(generatedPath, { recursive: true, force: true });
  if (created && !preserve) {
    await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    console.log(`[missao] Removed isolated database ${name}`);
  }
  await admin.end();
}
