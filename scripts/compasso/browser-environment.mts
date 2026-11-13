import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Next loads local .env files itself. Override every key before launching the app,
// so an isolated test cannot accidentally connect to a developer's real providers.
export function fixtureEnvironment(
  slug: string,
  baseURL: string,
  source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
  if (source.COMPASSO_ISOLATED_DATABASE !== "1" || !/^[a-z][a-z-]*$/.test(slug))
    throw new Error("Fixture environment requires an isolated database and registered app slug");
  const origin = new URL(baseURL);
  if (origin.hostname !== "localhost" || origin.protocol !== "http:" || origin.origin !== baseURL)
    throw new Error("Fixture apps use local HTTP origins only");
  const database = new URL(source.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(database.hostname))
    throw new Error("Browser fixture cannot use a remote database");
  const secret = source.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Missing isolated auth secret");
  const env: Record<string, string> = {};
  for (const directory of [workspace, resolve(workspace, "apps", slug)]) {
    for (const filename of [
      ".env",
      ".env.local",
      ".env.development",
      ".env.development.local",
      ".env.production",
      ".env.production.local",
    ]) {
      const path = resolve(directory, filename);
      if (existsSync(path))
        for (const key of Object.keys(parseEnv(readFileSync(path, "utf8")))) env[key] = "";
    }
  }
  for (const key of Object.keys(source)) {
    if (
      /STRIPE|SENDGRID|OPENROUTER|OPENAI|ANTHROPIC|SENTRY|REDIS|RAILWAY|VAPID|DATABASE|AUTH|TRIAL|CRON/.test(
        key,
      )
    )
      env[key] = "";
  }
  return {
    ...env,
    NODE_ENV: source.COMPASSO_OPTIMIZED_TEST === "1" ? "production" : "development",
    PORT: new URL(baseURL).port,
    HOSTNAME: "127.0.0.1",
    REDIS_URL: source.COMPASSO_ISOLATED_REDIS === "1" ? (source.REDIS_URL ?? "") : "",
    COMPASSO_ISOLATED_REDIS: source.COMPASSO_ISOLATED_REDIS ?? "",
    DATABASE_URL: source.DATABASE_URL ?? "",
    // The same central issuer persists its encrypted keys across backend and
    // browser stages in this database. Derive independent secrets only for apps.
    BETTER_AUTH_SECRET:
      slug === "conta" ? secret : createHmac("sha256", secret).update(slug).digest("hex"),
    BETTER_AUTH_URL: baseURL,
    NEXT_PUBLIC_APP_URL: baseURL,
    COMPASSO_ISOLATED_DATABASE: "1",
    COMPASSO_TEST_RUN_ID: source.COMPASSO_TEST_RUN_ID ?? "",
    COMPASSO_TRIAL_HASH_SECRET: source.COMPASSO_TRIAL_HASH_SECRET ?? "",
    COMPASSO_BILLING_ENABLED: "false",
    CRON_SECRET: randomBytes(32).toString("hex"),
    STRIPE_MODE: "dev",
    STRIPE_SECRET_KEY: "sk_test_isolated_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_isolated_fixture",
    SENDGRID_API_KEY: "SG.isolated_fixture",
    SENDGRID_FROM: "test@example.test",
    EMAIL_SANDBOX_MODE: "memory",
    OPENROUTER_API_KEY: "isolated_fixture",
    NEXT_TELEMETRY_DISABLED: "1",
    CSP_ENFORCE: "1",
  };
}
