import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { APPS } from "../../packages/config/src/apps.ts";
import { withBrowserArtifacts } from "./browser-artifacts.mjs";
import { fixtureEnvironment } from "./browser-environment.mts";
import { createPostgresFixture } from "./postgres-fixture.mjs";
import { createRedisFixture } from "./redis-fixture.mjs";

// Owns a disposable server on Windows or a new database on the local CI service.
// It never reads .env credentials or migrates the administration database.
if (!process.env.npm_execpath) throw new Error("Run with pnpm compasso:test:integration.");
if (
  process.argv
    .slice(2)
    .some(
      (argument) =>
        ![
          "--ui",
          "--ui-only",
          "--migration-ui-only",
          "--closure-system-only",
          "--apps-only",
          "--bora-only",
          "--auth-only",
          "--family-only",
          "--account-only",
          "--billing-only",
          "--estrela-only",
          "--agenda-only",
          "--cozya-only",
          "--admin-only",
          "--missao-devices-only",
          "--missao-only",
          "--redis",
          "--optimized",
        ].includes(argument) &&
        !/^--missao-test=test\/[a-z0-9.-]+\.integration\.ts$/.test(argument) &&
        !/^--agenda-test=test\/integration\/[a-z0-9.-]+\.test\.ts$/.test(argument) &&
        !/^--cozya-test=test\/[a-z0-9.-]+\.integration\.ts$/.test(argument),
    )
)
  throw new Error("Unknown integration option");
const optimized = process.argv.includes("--optimized");
if (optimized && (!process.argv.includes("--apps-only") || !process.argv.includes("--redis")))
  throw new Error("Optimized browser verification requires --apps-only --redis");
const useRedis = process.argv.includes("--redis");
const missaoDevicesOnly = process.argv.includes("--missao-devices-only");
const missaoOnly = process.argv.includes("--missao-only");
const missaoTests = process.argv.filter((argument) => argument.startsWith("--missao-test="));
if (missaoTests.length > 1) throw new Error("Choose one focused Missão test file");
const missaoTest = missaoTests[0]?.slice("--missao-test=".length);
const cozyaOnly = process.argv.includes("--cozya-only");
const cozyaTests = process.argv
  .filter((arg) => arg.startsWith("--cozya-test="))
  .map((arg) => arg.slice("--cozya-test=".length));
if (cozyaTests.some((test) => !existsSync(resolve("apps/cozya", test))))
  throw new Error("Cozya integration test file does not exist");
const agendaOnly = process.argv.includes("--agenda-only");
const agendaTests = [
  ...new Set(
    process.argv
      .filter((argument) => argument.startsWith("--agenda-test="))
      .map((argument) => argument.slice("--agenda-test=".length)),
  ),
];
if (agendaTests.some((test) => !existsSync(resolve("apps/agenda-da-turma", test))))
  throw new Error("Agenda integration test file does not exist");
const agendaTest = agendaTests.length > 0;
const adminOnly = process.argv.includes("--admin-only");
const estrelaOnly = process.argv.includes("--estrela-only");
const authOnly = process.argv.includes("--auth-only");
const familyOnly = process.argv.includes("--family-only");
const accountOnly = process.argv.includes("--account-only");
const billingOnly = process.argv.includes("--billing-only");
const boraOnly = process.argv.includes("--bora-only");
const appsOnly = process.argv.includes("--apps-only");
const uiOnly = process.argv.includes("--ui-only");
const migrationUiOnly = process.argv.includes("--migration-ui-only");
const closureSystemOnly = process.argv.includes("--closure-system-only");
if (
  closureSystemOnly &&
  (!useRedis ||
    process.argv.slice(2).some((arg) => !["--closure-system-only", "--redis"].includes(arg)))
)
  throw new Error("The closure system gate requires its own database and Redis run");
const checkUi = uiOnly || process.argv.includes("--ui");
const root = await mkdtemp(join(tmpdir(), "compasso-integration-"));
let postgresFixture;

function checked(binary, args, options = {}) {
  const result = spawnSync(binary, args, { windowsHide: true, encoding: "utf8", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Isolated command failed (${result.status}): ${result.stderr ?? "see test output"}`,
    );
}

const env = {
  ...process.env,
  NEXT_PUBLIC_APP_URL: "http://localhost:3011",
  DATABASE_URL: "",
  COMPASSO_ISOLATED_DATABASE: "1",
  EDI_ISOLATED_DATABASE: "1",
  BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
  COMPASSO_TRIAL_HASH_SECRET: randomBytes(32).toString("hex"),
  EMAIL_SANDBOX_MODE: "memory",
  COMPASSO_BILLING_ENABLED: "false",
  STRIPE_MODE: "dev",
  COMPASSO_MONTHLY_PRICE: "price_browser_compasso",
  COMPASSO_ANNUAL_PRICE: "price_browser_annual",
  COMPASSO_CREDITS_100_PRICE: "price_browser_credits",
  COMPASSO_CREDITS_300_PRICE: "price_browser_credits300",
  COMPASSO_CREDITS_1000_PRICE: "price_browser_credits1000",
  STRIPE_SECRET_KEY: "",
  STRIPE_WEBHOOK_SECRET: "",
  STRIPE_PORTAL_CONFIGURATION_ID: "",
  CRON_SECRET: randomBytes(32).toString("hex"),
};
for (const key of ["REDIS_URL", "SENDGRID_API_KEY", "SENTRY_DSN"]) delete env[key];
function run(args, childEnv = env) {
  checked(process.execPath, [process.env.npm_execpath, ...args], {
    env: childEnv,
    stdio: "inherit",
  });
}

let redisFixture;
const failures = [];
try {
  postgresFixture = await createPostgresFixture(root);
  env.DATABASE_URL = postgresFixture.url;
  run(["--filter", "@informach/db", "db:migrate"]);
  if (useRedis) {
    redisFixture = await createRedisFixture(root);
    env.REDIS_URL = redisFixture.url;
    env.COMPASSO_ISOLATED_REDIS = "1";
  }
  const shared =
    !familyOnly &&
    !accountOnly &&
    !billingOnly &&
    !uiOnly &&
    !migrationUiOnly &&
    !closureSystemOnly &&
    !appsOnly &&
    !boraOnly &&
    !missaoDevicesOnly &&
    !missaoOnly &&
    !missaoTest &&
    !estrelaOnly &&
    !agendaOnly &&
    !cozyaOnly &&
    !cozyaTests.length &&
    !agendaTest &&
    !adminOnly;
  if (shared && !authOnly) {
    run(["--filter", "@informach/family", "test:integration"]);
    run(["--filter", "@informach/billing", "test:integration"]);
    run(["--filter", "@informach/account", "test:integration"]);
    run(["--filter", "@informach/edi", "test:integration"]);
  }
  if (billingOnly) run(["--filter", "@informach/billing", "test:integration"]);
  if (familyOnly) run(["--filter", "@informach/family", "test:integration"]);
  if (accountOnly) run(["--filter", "@informach/account", "test:integration"]);
  if (shared || authOnly) {
    run([
      "--filter",
      "@informach/auth",
      "exec",
      "vitest",
      "run",
      "--config",
      "vitest.integration.config.ts",
      "src/web-sso.integration.ts",
      "src/web-session-freshness.integration.ts",
      "src/web-email-change.integration.ts",
      "src/web-participation.integration.ts",
      "src/identity-dependencies.integration.ts",
      "src/desktop-oauth.integration.ts",
    ]);
  }
  if (adminOnly) {
    run(
      [
        "--filter",
        "@informach/admin",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
      ],
      {
        ...env,
        ...fixtureEnvironment("admin", "http://localhost:3003", env),
        NODE_ENV: "test",
        READONLY_DATABASE_URL: "",
      },
    );
  }
  if (cozyaOnly || cozyaTests.length) {
    // Cozya's retention tests exercise the installed Mastra store against historical data.
    run(["--filter", "@informach/ai-core", "mastra:migrate"]);
    run(
      [
        "--filter",
        "@informach/cozya",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...cozyaTests,
      ],
      {
        ...env,
        ...fixtureEnvironment("cozya", "http://localhost:3002", env),
        NODE_ENV: "test",
      },
    );
  }
  if (agendaOnly || agendaTest) {
    run(
      [
        "--filter",
        "@informach/agenda-da-turma",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...agendaTests,
      ],
      {
        ...env,
        ...fixtureEnvironment("agenda-da-turma", "http://localhost:3001", env),
        NODE_ENV: "test",
      },
    );
  }
  if (estrelaOnly) {
    run(
      [
        "--filter",
        "@informach/dia-de-estrela",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
      ],
      {
        ...env,
        ...fixtureEnvironment("dia-de-estrela", "http://localhost:3008", env),
      },
    );
  }
  if (missaoDevicesOnly || missaoOnly || missaoTest) {
    run(
      [
        "--filter",
        "@informach/missao-saber",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
        ...(missaoTest
          ? [missaoTest]
          : missaoDevicesOnly
            ? ["test/study-access.integration.ts", "test/competition.integration.ts"]
            : []),
      ],
      {
        ...env,
        ...fixtureEnvironment("missao-saber", "http://localhost:3005", env),
        NODE_ENV: "test",
      },
    );
  }
  if (boraOnly) {
    const boraEnvironment = {
      ...env,
      NODE_ENV: "test",
      BETTER_AUTH_URL: "http://localhost:3007",
      NEXT_PUBLIC_APP_URL: "http://localhost:3007",
      SENDGRID_API_KEY: "SG.synthetic_fixture",
      SENDGRID_FROM: "test@example.test",
      STRIPE_SECRET_KEY: "sk_test_synthetic_fixture",
      STRIPE_WEBHOOK_SECRET: "whsec_synthetic_fixture",
      CRON_SECRET: randomBytes(32).toString("hex"),
      BORA_INDIVIDUAL_MONTHLY_PRICE: "",
      BORA_INDIVIDUAL_ANNUAL_PRICE: "",
      BORA_FAMILY_MONTHLY_PRICE: "",
      BORA_FAMILY_ANNUAL_PRICE: "",
      RAILWAY_ENVIRONMENT_ID: "",
    };
    run(
      [
        "--filter",
        "@informach/bora-treinar",
        "exec",
        "vitest",
        "run",
        "--config",
        "vitest.integration.config.ts",
      ],
      boraEnvironment,
    );
    if (useRedis)
      run(
        [
          "--filter",
          "@informach/bora-treinar",
          "exec",
          "vitest",
          "run",
          "--config",
          "vitest.redis.config.ts",
        ],
        boraEnvironment,
      );
  }
  if (closureSystemOnly) {
    run(["--filter", "@informach/ai-core", "mastra:migrate"]);
    run(["--filter", "@informach/conta", "setup:oauth"]);
    const apps = Object.values(APPS).filter((app) => app.collection === "compasso");
    await withBrowserArtifacts(["conta", ...apps.map((app) => app.slug)], async (id) => {
      const stage = (phase, target = "fixture") =>
        run(
          [
            "--filter",
            "@informach/conta",
            "exec",
            "playwright",
            "test",
            "--config",
            "playwright.closure.config.ts",
          ],
          {
            ...env,
            COMPASSO_TEST_RUN_ID: id,
            COMPASSO_TEST_APP: target,
            COMPASSO_CLOSURE_STAGE: phase,
            CRON_SECRET: randomBytes(32).toString("hex"),
            COMPASSO_CLOSURE_FIXTURE: join(root, "closure-system.json"),
          },
        );
      stage("seed");
      for (const app of apps) stage("review", app.slug);
      stage("begin");
      stage("prepare", "conta");
      for (const app of apps) stage("prepare", app.slug);
      stage("confirm");
      stage("billing", "conta");
      for (const app of apps) stage("erase", app.slug);
      stage("finalize", "conta");
      stage("verify");
    });
  }
  if (appsOnly) {
    // Match the real migrator: cleanup/export also inspect historical Mastra storage.
    // Browser tests must not silently omit the provider-owned schema.
    run(["--filter", "@informach/ai-core", "mastra:migrate"]);
    run(["--filter", "@informach/conta", "setup:oauth"]);
    const apps = Object.values(APPS).filter(
      (app) =>
        app.collection === "compasso" &&
        (!process.env.COMPASSO_TEST_APP || app.slug === process.env.COMPASSO_TEST_APP),
    );
    if (!apps.length) throw new Error("Unregistered Compasso app under test");
    for (const app of apps)
      await withBrowserArtifacts(["conta", app.slug], async (id) => {
        const browserEnv = {
          ...env,
          COMPASSO_TEST_APP: app.slug,
          COMPASSO_TEST_RUN_ID: id,
          COMPASSO_OPTIMIZED_TEST: optimized ? "1" : "",
        };
        if (optimized) {
          for (const target of [APPS.conta, app]) {
            const appRoot = resolve("apps", target.slug);
            const buildRoot = resolve(appRoot, `.next-compasso-${id}`);
            const standaloneApp = resolve(buildRoot, "standalone", "apps", target.slug);
            if (
              !standaloneApp.startsWith(`${buildRoot}${process.platform === "win32" ? "\\" : "/"}`)
            )
              throw new Error("Unexpected standalone fixture path");
            run(["--filter", `@informach/${target.slug}`, "build"], {
              ...browserEnv,
              ...fixtureEnvironment(
                target.slug,
                `http://localhost:${target.localPort}`,
                browserEnv,
              ),
            });
            await cp(
              resolve(buildRoot, "static"),
              resolve(standaloneApp, `.next-compasso-${id}`, "static"),
              { recursive: true },
            );
            if (existsSync(resolve(appRoot, "public")))
              await cp(resolve(appRoot, "public"), resolve(standaloneApp, "public"), {
                recursive: true,
              });
          }
        }
        run(
          [
            "--filter",
            "@informach/conta",
            "exec",
            "playwright",
            "test",
            "--config",
            "playwright.apps.config.ts",
          ],
          browserEnv,
        );
      });
  }

  if (checkUi)
    await withBrowserArtifacts(["conta"], (id) =>
      run(["--filter", "@informach/conta", "exec", "playwright", "test"], {
        ...env,
        COMPASSO_TEST_RUN_ID: id,
      }),
    );
  if (migrationUiOnly || process.argv.includes("--ui"))
    await withBrowserArtifacts(["conta"], (id) =>
      run(
        [
          "--filter",
          "@informach/conta",
          "exec",
          "playwright",
          "test",
          "--config",
          "playwright.migration.config.ts",
        ],
        {
          ...env,
          COMPASSO_TEST_RUN_ID: id,
        },
      ),
    );
} catch (error) {
  failures.push(error);
}
try {
  if (redisFixture) await redisFixture.dispose();
} catch (error) {
  failures.push(error);
}
try {
  if (postgresFixture) await postgresFixture.dispose();
  const target = resolve(root);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("compasso-integration-")
  )
    throw new Error("Unexpected disposable database path; refusing cleanup.");
  await rm(target, { recursive: true });
} catch (error) {
  failures.push(error);
}
if (failures.length)
  throw new AggregateError(failures, "Compasso integration verification failed.");
console.log("Compasso integration checks passed; disposable database removed.");
