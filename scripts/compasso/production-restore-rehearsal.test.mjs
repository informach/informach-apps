import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const require = createRequire(new URL("../../packages/db/package.json", import.meta.url));
const postgres = require("postgres");
const { drizzle } = require("drizzle-orm/postgres-js");
const { migrate } = require("drizzle-orm/postgres-js/migrator");
const workspace = resolve(import.meta.dirname, "../..");

test("production restore tool upgrades a historical synthetic source without changing it", {
  timeout: 180_000,
}, async () => {
  const name = `compasso-backup-source-${randomBytes(8).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  const env = { ...process.env, POSTGRES_PASSWORD: password };
  const directory = await mkdtemp(join(tmpdir(), "compasso-backup-source-"));
  let source,
    created = false;
  function docker(args) {
    const result = spawnSync("docker", args, { env, encoding: "utf8", timeout: 60_000 });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  try {
    docker([
      "run",
      "--detach",
      "--name",
      name,
      "--env",
      "POSTGRES_PASSWORD",
      "--publish",
      "127.0.0.1::5432",
      "postgres:18-alpine",
    ]);
    created = true;
    const deadline = Date.now() + 60_000;
    while (
      spawnSync("docker", ["exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"], {
        env,
        stdio: "ignore",
        timeout: 5000,
      }).status !== 0
    ) {
      assert.ok(Date.now() < deadline, "Synthetic PostgreSQL did not become ready");
      await new Promise((done) => setTimeout(done, 250));
    }
    const port = docker(["port", name, "5432/tcp"]).split(":").at(-1);
    assert.match(port, /^\d+$/);
    source = postgres(`postgres://postgres:${password}@127.0.0.1:${port}/postgres`, {
      max: 1,
      prepare: false,
      onnotice: () => {},
    });
    await source`select 1`;
    const migrations = join(workspace, "packages/db/src/migrations");
    const journal = JSON.parse(await readFile(join(migrations, "meta/_journal.json"), "utf8"));
    const boundary = journal.entries.find((entry) => entry.tag === "0080_recreio");
    assert.ok(boundary);
    const entries = journal.entries.filter((entry) => entry.idx <= boundary.idx);
    await mkdir(join(directory, "meta"));
    await writeFile(join(directory, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const entry of entries)
      await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
    await migrate(drizzle(source), { migrationsFolder: directory });
    const user = randomUUID();
    await source`insert into core.users(id,name,email,email_verified)
      values (${user},'Synthetic backup',${`${user}@example.test`},true)`;
    await source`insert into agenda.student_profiles(user_id,name) values (${user},'Synthetic child')`;
    await source`insert into billing.credit_ledger(owner_type,owner_id,app,entry_type,amount)
      values ('user',${user},'cozya','promo_grant',17)`;
    // Match an already populated production reference catalog without fetching
    // external IBGE data. These rows are synthetic and belong only to this DB.
    await source`insert into agenda.states(uf,ibge_code,name)
      select 'F' || n, n::text, 'Fixture state' from generate_series(1,27) n`;
    await source`insert into agenda.cities(ibge_code,state_uf,name)
      select n::text, 'F1', 'Fixture city' from generate_series(1,5500) n`;
    await source`insert into agenda.schools(inep_code,city_ibge_code,name)
      select n::text, '1', 'Fixture school' from generate_series(1,100000) n`;
    // pg_dump runs in a sibling container. Use only this owned container's
    // private address, never a production URL inherited by the test process.
    const host = docker([
      "inspect",
      "--format",
      "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
      name,
    ]);
    const result = spawnSync(
      process.execPath,
      ["scripts/compasso/production-restore-rehearsal.mjs"],
      {
        cwd: workspace,
        env: {
          ...env,
          DATABASE_PUBLIC_URL: `postgres://postgres:${password}@127.0.0.1:${port}/postgres`,
          COMPASSO_LOCAL_DUMP_HOST: host,
        },
        encoding: "utf8",
        timeout: 150_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.source.migrations.applied, entries.length);
    assert.equal(report.source.users, 1);
    assert.equal(report.restore.identical, true);
    assert.equal(report.migration.applied.applied, journal.entries.length);
    assert.ok(report.migration.family.people >= 1);
    assert.equal(report.repeat.unchanged, true);
    const [untouched] = await source`select
      (select count(*)::int from drizzle.__drizzle_migrations) as migrations,
      (select sum(amount)::int from billing.credit_ledger) as credits,
      (select count(*)::int from agenda.student_profiles where name = 'Synthetic child') as profiles`;
    assert.deepEqual({ ...untouched }, { migrations: entries.length, credits: 17, profiles: 1 });
    console.log(
      `Synthetic source: migration ${report.migration.firstRunMs}ms; repeat ${report.repeat.secondRunMs}ms`,
    );
  } finally {
    await source?.end();
    if (created) docker(["rm", "--force", "--volumes", name]);
    await rm(directory, { recursive: true });
  }
});
