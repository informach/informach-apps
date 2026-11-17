import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRailwayContext, project } from "railway/iac";
import { getCollectionApps } from "../../packages/config/src/collections.ts";

const sourceUrl = new URL("../../.railway/railway.ts", import.meta.url);
const context = createRailwayContext({
  projectId: "f4da4285-5b98-48b5-b03e-5be02f4e7c56",
  environmentId: "174b2cb0-e1cd-410c-8764-d913e3af18d3",
});

test("Recreio watches code and workspace inputs while Markdown alone cannot trigger a deployment", async () => {
  const resources = await graph(true, true);
  const samples = [
    [
      "@informach/recreio-app",
      [
        ["apps/recreio/src/app/page.tsx", true],
        ["packages/db/drizzle/0001.sql", true],
        ["packages/recreio/src/sdk/index.ts", true],
        ["apps/recreio/PRODUCAO.md", false],
        ["packages/recreio/README.md", false],
        ["pnpm-lock.yaml", true],
        ["package.json", true],
      ],
    ],
    [
      "@informach/morada-server",
      [
        ["apps/morada-server/src/main.ts", true],
        ["packages/morada-sim/src/execucao.ts", true],
        ["packages/morada-arte/src/manifesto.ts", true],
        ["apps/morada-server/README.md", false],
        ["packages/morada-sim/README.md", false],
        ["pnpm-lock.yaml", true],
        ["package.json", true],
      ],
    ],
  ];
  for (const [name, paths] of samples) {
    const sandbox = await mkdtemp(join(tmpdir(), "recreio-watch-"));
    try {
      const initialized = spawnSync("git", ["init", "--quiet", "--initial-branch=watch-proof"], {
        cwd: sandbox,
        encoding: "utf8",
      });
      assert.equal(initialized.status, 0, initialized.stderr);
      await writeFile(
        join(sandbox, ".gitignore"),
        `${resources.get(name).build.watchPatterns.join("\n")}\n`,
      );
      for (const [path, watched] of paths) {
        // Railway documenta sintaxe gitignore: positivo inclui, ! retira.
        const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
          cwd: sandbox,
          input: `${path}\n`,
          encoding: "utf8",
        });
        assert.equal(result.status, watched ? 0 : 1, `${name}: ${path}: ${result.stderr}`);
      }
    } finally {
      assert.equal(dirname(resolve(sandbox)), resolve(tmpdir()));
      assert.match(basename(sandbox), /^recreio-watch-/);
      await rm(sandbox, { recursive: true, force: true });
    }
  }
});

async function graph(launched, recreioLaunched) {
  const target = new URL(`.compasso-graph-${randomUUID()}.ts`, sourceUrl);
  let source = await readFile(sourceUrl, "utf8");
  for (const flag of ["ESTRELA_LAUNCHED", "COMPASSO_LAUNCHED"]) {
    const declaration = new RegExp(`const ${flag} = (?:true|false);`);
    assert.match(source, declaration, `${flag} must remain an explicit deployment decision`);
    source = source.replace(declaration, `const ${flag} = ${launched};`);
  }
  if (recreioLaunched !== undefined) {
    const declaration = /const RECREIO_LAUNCHED = (?:true|false);/;
    assert.match(source, declaration);
    source = source.replace(declaration, `const RECREIO_LAUNCHED = ${recreioLaunched};`);
  }
  try {
    await writeFile(target, source, { flag: "wx" });
    const loaded = await import(target.href);
    const program = typeof loaded.default === "function" ? loaded.default : loaded.default.default;
    const definition = await program(context, project);
    return new Map(
      definition.resources.flat(Infinity).map((resource) => [resource.name, resource]),
    );
  } finally {
    await rm(fileURLToPath(target), { force: true });
  }
}

test("preparation retains the existing central services; cutover retires only the seven legacy financial crons", async () => {
  const before = await graph(false);
  const after = await graph(true);
  for (const name of ["@informach/conta", "@informach/dia-de-estrela"]) {
    assert.ok(before.has(name), `${name} must not disappear before launch`);
    assert.equal(before.get(name).source, undefined);
    assert.ok(after.get(name).source);
  }
  const removed = [...before.keys()].filter((name) => !after.has(name)).sort();
  assert.deepEqual(removed, [
    "cron-bora-treinar-billing",
    "cron-missao-saber-billing",
    "cron-perapp-billing-dunning",
    "cron-perapp-billing-expire-bonus",
    "cron-perapp-billing-grant-monthly",
    "cron-perapp-billing-reconcile",
    "cron-perapp-billing-release-reservations",
  ]);
  const added = [...after.keys()].filter((name) => !before.has(name)).sort();
  assert.deepEqual(
    added,
    [
      ...getCollectionApps("compasso").map((app) => `cron-${app.slug}-account-departure`),
      "cron-conta-account-maintenance",
      "cron-conta-billing",
      "cron-dia-de-estrela-alertas",
    ].sort(),
  );
  assert.equal(after.get("cron-conta-billing").deploy.cronSchedule, "*/5 * * * *");
  assert.equal(
    after.get("@informach/conta").deploy.startCommand,
    "HOSTNAME=0.0.0.0 pnpm start:conta",
  );
  for (const name of [
    "Postgres",
    "Redis",
    "postgres-volume",
    "redis-volume",
    "@informach/edi",
    "cron-edi-reconcile",
    "cron-global-auth-cleanup",
    "cron-global-email-suppression-sync",
    "cron-perapp-email-retry",
    "cron-perapp-email-recover-stale",
    "cron-cozya-retention",
    "cron-agenda-routine",
    "cron-missao-saber-weekly-report",
    "cron-bora-treinar-lembretes",
    "cron-admin-watch",
    "cron-admin-weekly",
    "@informach/recreio-app",
    "@informach/morada-server",
    "morada-arte",
    "cron-recreio-manutencao",
  ]) {
    assert.ok(before.has(name), `${name} must remain in the prepared graph`);
    assert.deepEqual(after.get(name), before.get(name), `${name} must be preserved`);
  }
  assert.equal(before.get("@informach/admin").variables.ADMIN_COMPASSO_ENABLED.value, "0");
  assert.equal(after.get("@informach/admin").variables.ADMIN_COMPASSO_ENABLED.value, "1");
});

test("Recreio launch enables only its sources and monitoring, preserving data resources and other products", async () => {
  const before = await graph(true, false);
  const after = await graph(true, true);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  const changed = [...before.keys()]
    .filter((name) => JSON.stringify(before.get(name)) !== JSON.stringify(after.get(name)))
    .sort();
  assert.deepEqual(
    changed,
    [
      "@informach/admin",
      "@informach/morada-server",
      "@informach/recreio-app",
      "cron-recreio-manutencao",
    ].sort(),
  );
  for (const name of [
    "@informach/recreio-app",
    "@informach/morada-server",
    "cron-recreio-manutencao",
  ]) {
    assert.equal(before.get(name).source, undefined);
    assert.ok(after.get(name).source);
  }
  assert.deepEqual(after.get("morada-arte"), before.get("morada-arte"));
  assert.equal(after.get("cron-recreio-manutencao").deploy.cronSchedule, "*/5 * * * *");
  assert.equal(before.get("@informach/admin").variables.ADMIN_RECREIO_ENABLED.value, "0");
  assert.equal(after.get("@informach/admin").variables.ADMIN_RECREIO_ENABLED.value, "1");
  assert.equal(
    after.get("@informach/recreio-app").source.commitSha,
    "396fe9326e3b1fac28a2b1bb86d9664c5b74e18a",
  );
  assert.equal(
    after.get("@informach/morada-server").source.commitSha,
    "644b3841cb81b24d04159f75892a4c21d4d5f094",
  );
  assert.equal(after.get("@informach/recreio-app").variables.RECREIO_SOCIAL_MODE.value, "off");
  for (const name of ["@informach/recreio-app", "@informach/admin"])
    assert.deepEqual(after.get(name).variables.RECREIO_MODERATION_SECRET, { type: "preserve" });
  const morada = after.get("@informach/morada-server");
  assert.equal(morada.variables.DATABASE_URL, undefined);
  assert.ok(morada.deploy.drainingSeconds > 25);
  assert.ok(
    Object.values(morada.deploy.multiRegionConfig).every((region) => region.numReplicas === 1),
  );
});
