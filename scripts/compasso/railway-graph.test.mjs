import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createRailwayContext, project } from "railway/iac";
import { getCollectionApps } from "../../packages/config/src/collections.ts";

const sourceUrl = new URL("../../.railway/railway.ts", import.meta.url);
const context = createRailwayContext({
  projectId: "f4da4285-5b98-48b5-b03e-5be02f4e7c56",
  environmentId: "174b2cb0-e1cd-410c-8764-d913e3af18d3",
});

async function graph(launched) {
  const target = new URL(`.compasso-graph-${randomUUID()}.ts`, sourceUrl);
  let source = await readFile(sourceUrl, "utf8");
  if (launched)
    for (const flag of ["ESTRELA_LAUNCHED", "COMPASSO_LAUNCHED"])
      source = source.replace(`const ${flag} = false;`, `const ${flag} = true;`);
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
