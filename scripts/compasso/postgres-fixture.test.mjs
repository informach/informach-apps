import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createCiPostgresFixture, createPostgresFixture } from "./postgres-fixture.mjs";

const postgres = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
  "postgres",
);
const workspace = resolve(import.meta.dirname, "../..");
test("CI fixture refuses remote administration before opening a connection", async () => {
  await assert.rejects(
    createCiPostgresFixture("postgres://fixture:fixture@remote.invalid/existing"),
    /local PostgreSQL/,
  );
});
test("CI fixture owns only its new database and preserves the administration database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compasso-integration-fixture-"));
  const target = resolve(directory);
  if (
    dirname(target) !== resolve(tmpdir()) ||
    !basename(target).startsWith("compasso-integration-fixture-")
  )
    throw new Error("Unexpected fixture test directory");
  let parent, child, source, isolated;
  try {
    parent = await createPostgresFixture(directory);
    source = postgres(parent.url, { max: 1, prepare: false });
    await source`CREATE TABLE fixture_untouched (id integer primary key)`;
    await source`INSERT INTO fixture_untouched VALUES (7)`;
    child = await createCiPostgresFixture(parent.url);
    const databaseName = new URL(child.url).pathname.slice(1);
    assert.match(databaseName, /^compasso_review_[a-f0-9]{24}$/);
    isolated = postgres(child.url, { max: 1, prepare: false });
    const [absence] = await isolated`SELECT to_regclass('public.fixture_untouched') AS relation`;
    assert.equal(absence.relation, null);
    await isolated`CREATE TABLE fixture_child_only (id integer primary key)`;
    await isolated.end();
    isolated = undefined;
    await child.dispose();
    await child.dispose();
    child = undefined;
    const [remaining] =
      await source`SELECT count(*)::int AS count FROM pg_database WHERE datname = ${databaseName}`;
    assert.equal(remaining.count, 0);
    assert.deepEqual([...(await source`SELECT id FROM fixture_untouched`)], [{ id: 7 }]);
  } finally {
    await isolated?.end();
    await child?.dispose();
    await source?.end();
    await parent?.dispose();
    await rm(target, { recursive: true });
  }
});

test("migrator and readiness reject skipped receipts without modifying the database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compasso-integration-history-"));
  let fixture, client;
  try {
    fixture = await createPostgresFixture(directory);
    client = postgres(fixture.url, { max: 1, prepare: false });
    const env = { ...process.env, DATABASE_URL: fixture.url };
    const migrate = () =>
      spawnSync(process.execPath, ["--import", "tsx", "packages/db/src/migrate.ts"], {
        cwd: workspace,
        env,
        encoding: "utf8",
        timeout: 60_000,
      });
    const ready = () => {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "-e",
          `
        import { checkSchemaReadiness } from './packages/db/src/readiness.ts';
        const result = await checkSchemaReadiness();
        console.log(JSON.stringify(result));
        await globalThis.__informachPg?.end();
      `,
        ],
        { cwd: workspace, env, encoding: "utf8", timeout: 15_000 },
      );
      assert.equal(result.status, 0, result.stderr);
      return JSON.parse(result.stdout.trim());
    };
    const initial = migrate();
    assert.equal(initial.status, 0, initial.stderr);
    assert.equal(ready().ok, true);
    const [before] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    assert.equal(migrate().status, 0);
    const [repeated] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    assert.equal(repeated.n, before.n);
    // A receipt newer than the build is allowed only with the complete known prefix.
    await client`insert into drizzle.__drizzle_migrations (hash, created_at)
      select 'future-fixture', max(created_at) + 1 from drizzle.__drizzle_migrations`;
    assert.equal(ready().ok, true);
    await client`delete from drizzle.__drizzle_migrations
      where id = (select id from drizzle.__drizzle_migrations order by created_at offset 1 limit 1)`;
    assert.equal(ready().reason, "inconsistent");
    const refused = migrate();
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /Migration history is inconsistent/);
    const [untouched] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    assert.equal(untouched.n, before.n);
    // Also reject the hole when max(created_at) matches the build exactly.
    await client`delete from drizzle.__drizzle_migrations where hash = 'future-fixture'`;
    assert.equal(ready().reason, "inconsistent");
    assert.notEqual(migrate().status, 0);
  } finally {
    await client?.end();
    await fixture?.dispose();
    await rm(directory, { recursive: true });
  }
});
