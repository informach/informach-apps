import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { createCiPostgresFixture, createPostgresFixture } from "./postgres-fixture.mjs";

const postgres = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
  "postgres",
);
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
