import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { countUnresolvedCheckouts } from "./checkout-inventory.mjs";
import { createPostgresFixture } from "./postgres-fixture.mjs";

const postgres = createRequire(new URL("../../packages/db/package.json", import.meta.url))(
  "postgres",
);

test("conta apenas intenções sem recibo da mesma sessão e cliente, antes e depois da migration", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compasso-checkout-inventory-"));
  if (
    dirname(resolve(directory)) !== resolve(tmpdir()) ||
    !basename(directory).startsWith("compasso-checkout-inventory-")
  )
    throw new Error("Unexpected checkout inventory fixture directory");
  let fixture;
  let db;
  try {
    fixture = await createPostgresFixture(directory);
    db = postgres(fixture.url, { max: 1, prepare: false });
    await db`create schema billing`;
    assert.equal(await countUnresolvedCheckouts(db, ["cozya"]), 0);
    await db`create table billing.customers (id text primary key, app text not null)`;
    await db`create table billing.checkout_intents (customer_id text not null, provider_session_id text)`;
    await db`insert into billing.customers values ('a', 'agenda-da-turma'), ('b', 'cozya'), ('e', 'edi')`;
    await db`insert into billing.checkout_intents values ('a', 's1'), ('b', 's2'), ('b', null), ('e', 's3')`;
    const apps = ["agenda-da-turma", "cozya"];
    assert.equal(await countUnresolvedCheckouts(db, apps), 3);
    await db`create table billing.legacy_checkout_resolutions (provider_session_id text primary key, customer_id text not null)`;
    await db`insert into billing.legacy_checkout_resolutions values ('s1', 'b')`;
    assert.equal(await countUnresolvedCheckouts(db, apps), 3);
    await db`update billing.legacy_checkout_resolutions set customer_id = 'a' where provider_session_id = 's1'`;
    assert.equal(await countUnresolvedCheckouts(db, apps), 2);
    await db`insert into billing.legacy_checkout_resolutions values ('s2', 'b')`;
    assert.equal(await countUnresolvedCheckouts(db, apps), 1);
  } finally {
    await db?.end();
    await fixture?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
