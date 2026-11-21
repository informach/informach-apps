/** Synthetic source for the operational restore/upgrade image. GitHub only;
 * no production URL, seed command, consent or game-content claim. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { INFORMACH_MIGRATION_HISTORY } from "../migration-provenance";
import journal from "../migrations/meta/_journal.json" with { type: "json" };

const RELEASE = "d014bd90a895df452b83b9a2e6e683ac5749e0cb";
const MIGRATIONS = "packages/db/src/migrations";
const oldFile = (path: string) => execFileSync("git", ["show", `${RELEASE}:${path}`]);

async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, "true");
  assert.equal(process.env.CI, "true");
  assert.equal(process.platform, "linux");
  assert.equal(process.argv.length, 2);
  const historical = process.env.RECREIO_FIXTURE_HISTORY === "historical";
  assert.ok(["published", "historical"].includes(process.env.RECREIO_FIXTURE_HISTORY ?? ""));
  assert.ok(["present", "empty"].includes(process.env.RECREIO_FIXTURE_WORLDS ?? ""));
  const comMundos = process.env.RECREIO_FIXTURE_WORLDS === "present";
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.protocol, "postgres:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55431");
  assert.equal(url.pathname, "/fixture");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.ok(["postgres", "ci"].includes(url.username));
  assert.equal(url.password, "ci");
  const raw = postgres(url.href, { max: 1, prepare: false, onnotice: () => {} });
  const migrator = postgres(url.href, { max: 1, prepare: false, onnotice: () => {} });
  const folder = await mkdtemp(join(tmpdir(), "recreio-old-schema-"));
  let failure: unknown;
  try {
    const [empty] = await raw<{ total: number }[]>`select count(*)::int as total from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%'
        and n.nspname<>'information_schema' and c.relkind in ('r','p','m')`;
    assert.equal(empty?.total, 0, "Only an empty disposable fixture is admitted.");
    const oldJournal = oldFile(`${MIGRATIONS}/meta/_journal.json`);
    const prefix = { ...journal, entries: journal.entries.slice(0, 204) };
    assert.deepEqual(JSON.parse(oldJournal.toString("utf8")), prefix);
    await mkdir(join(folder, "meta"));
    await writeFile(join(folder, "meta/_journal.json"), oldJournal);
    // Verify exact original and later published Git blobs, independently of
    // the live history reader. Historical SQL is executed only while this
    // synthetic fixture is empty, before any profiles/content are inserted.
    const originals = new Map<number, Buffer>();
    for (const artifact of INFORMACH_MIGRATION_HISTORY.artifacts) {
      const entry = prefix.entries[artifact.index];
      assert.equal(entry?.tag, artifact.tag);
      assert.equal(entry?.when, artifact.folderMillis);
      const path = `${MIGRATIONS}/${artifact.tag}.sql`;
      const original = execFileSync("git", ["show", `${artifact.originalCommit}:${path}`]);
      assert.equal(
        createHash("sha256").update(original).digest("hex"),
        artifact.historicalSqlSha256,
      );
      assert.equal(
        createHash("sha256").update(oldFile(path)).digest("hex"),
        artifact.publishedSqlSha256,
      );
      originals.set(artifact.index, original);
    }
    for (const entry of prefix.entries) {
      const sql = oldFile(`${MIGRATIONS}/${entry.tag}.sql`);
      assert.deepEqual(
        sql,
        await readFile(fileURLToPath(new URL(`../migrations/${entry.tag}.sql`, import.meta.url))),
      );
      await writeFile(
        join(folder, `${entry.tag}.sql`),
        historical ? (originals.get(entry.idx) ?? sql) : sql,
      );
    }
    await migrate(drizzle(migrator), { migrationsFolder: folder });
    await raw.begin(async (tx) => {
      for (let n = 0; n < 2; n++) {
        const user = randomUUID(),
          group = randomUUID(),
          profile = randomUUID(),
          world = randomUUID();
        const key = randomUUID(),
          bytes = Buffer.from(`opaque-synthetic-progress-${n}`);
        const hash = createHash("sha256").update(bytes).digest("hex");
        await tx`insert into core.users(id,name,email,email_verified) values(${user},'Synthetic',${`${user}@example.test`},true)`;
        await tx`insert into recreio.groups(id,owner_user_id) values(${group},${user})`;
        await tx`insert into recreio.profiles(id,user_id,group_id,kind,nickname,avatar)
          values(${profile},${user},${group},'adult','Synthetic','padrao')`;
        await tx`insert into recreio.profile_data_keys(id,profile_id,game_id,key,revision)
          values(${key},${profile},'prova-upgrade','marco',1)`;
        await tx`insert into recreio.profile_data_versions(data_id,profile_id,game_id,base_revision,revision,kind,bytes,digest)
          values(${key},${profile},'prova-upgrade',0,1,'accepted',${bytes},${hash})`;
        await tx`insert into recreio.profile_achievements(profile_id,game_id,achievement_id,key_hash)
          values(${profile},'prova-upgrade','marca',${hash})`;
        if (comMundos) {
          await tx`insert into recreio.spaces(id,game_id,steward_profile_id,created_by_profile_id,name,content_policy,status,revision,journal_seq,lease_epoch)
            values(${world},'morada',${profile},${profile},'Synthetic','todas_as_idades','hibernating',5,2,7)`;
          await tx`insert into recreio.space_members(space_id,profile_id,role,state,participation)
            values(${world},${profile},'steward','active','synthetic')`;
          for (let revision = 1; revision <= 5; revision++)
            await tx`insert into recreio.space_snapshots(space_id,revision,fence,schema_version,journal_seq,tick,kind,storage,data,byte_size,sha256)
              values(${world},${revision},7,2,1,12,'hibernate','pg',${bytes},${bytes.length},${hash})`;
          for (let seq = 1; seq <= 2; seq++)
            await tx`insert into recreio.space_journal(space_id,seq,fence,tick,fact_id,payload,byte_size)
              values(${world},${seq},7,${12 + seq},${`synthetic-${n}-${seq}`},${bytes},${bytes.length})`;
        }
      }
      await tx.unsafe("create schema upgrade_foreign_fixture");
      await tx.unsafe(
        "create table upgrade_foreign_fixture.sentinel(id int primary key,body jsonb not null,bytes bytea not null,at timestamptz not null)",
      );
      await tx`insert into upgrade_foreign_fixture.sentinel values(1,'{"synthetic":true,"nested":[1,null,"á"]}',decode('0001ff','hex'),'2026-11-20T01:02:03.123456Z')`;
    });
    const [receipts] = await raw<
      { total: number }[]
    >`select count(*)::int as total from drizzle.__drizzle_migrations`;
    assert.equal(receipts?.total, 204);
    console.log(
      JSON.stringify({
        syntheticSource: true,
        release: RELEASE,
        receipts: 204,
        worlds: comMundos ? 2 : 0,
        snapshots: comMundos ? 10 : 0,
        publishedSqlAndJournalPrefixUnchanged: true,
        historicalReceiptVariantsExecutedInEmptyFixture: historical ? originals.size : 0,
        gameContentValidated: false,
        productionAccess: false,
      }),
    );
  } catch (error) {
    failure = error;
  }
  const cleanup = await Promise.allSettled([
    raw.end({ timeout: 5 }),
    migrator.end({ timeout: 5 }),
    rm(folder, { recursive: true }),
  ]);
  if (cleanup.some((r) => r.status === "rejected")) throw new Error("FIXTURE_CLEANUP_FAILED");
  if (failure) throw failure;
}

void main().catch(() => {
  console.error(JSON.stringify({ ok: false, code: "SYNTHETIC_UPGRADE_SOURCE_NOT_PREPARED" }));
  process.exitCode = 1;
});
