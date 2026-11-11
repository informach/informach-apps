import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { z } from "zod";

// This rehearsal owns an ephemeral local Docker container; it never reads .env,
// connects to Railway, or accepts a database URL or container name from input.
const token = randomBytes(12).toString("hex");
const containerName = `compasso-restore-${token}`;
const password = randomBytes(32).toString("hex");
const childEnv: NodeJS.ProcessEnv = {
  ...process.env,
  POSTGRES_PASSWORD: password,
  PGPASSWORD: password,
};
// Ignore inherited Docker endpoint overrides, then verify the selected local context.
delete childEnv.DOCKER_HOST;
delete childEnv.DOCKER_CONTEXT;
const migrations = fileURLToPath(new URL("../../db/src/migrations/", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "compasso-restore-"));
let phase = "preflight";
let created = false;
const connections: ReturnType<typeof postgres>[] = [];
const notices = new Map<string, number>();

function docker(args: string[], allowFailure = false) {
  const result = spawnSync("docker", args, { env: childEnv, windowsHide: true, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`Docker command failed during ${phase}`);
  }
  return result.stdout.trim();
}
function ownedContainer() {
  const identity = docker(
    [
      "inspect",
      "--format",
      '{{.Name}}|{{index .Config.Labels "informach.compasso.restore"}}',
      containerName,
    ],
    true,
  );
  return identity === `/${containerName}|${token}`;
}
function connect(port: number, database: string) {
  if (!/^(postgres|compasso_source|compasso_restore)$/.test(database))
    throw new Error("Unexpected fixture database");
  const client = postgres({
    host: "127.0.0.1",
    port,
    database,
    username: "postgres",
    password,
    max: 1,
    prepare: false,
    onnotice: (notice) => {
      const key = notice.code ?? "unknown";
      notices.set(key, (notices.get(key) ?? 0) + 1);
    },
  });
  connections.push(client);
  return client;
}
function pgTool(args: string[]) {
  docker(["exec", "-e", "PGPASSWORD", containerName, ...args]);
}
async function prefixMigrations() {
  const journal = z
    .object({
      entries: z.array(
        z
          .object({
            idx: z.number().int().nonnegative(),
            tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(JSON.parse(await readFile(join(migrations, "meta", "_journal.json"), "utf8")));
  if (!journal.entries.some((entry) => entry.idx === 79))
    throw new Error("Historical migration boundary missing");
  const directory = join(root, "prefix");
  await mkdir(join(directory, "meta"), { recursive: true });
  const entries = journal.entries.filter((entry) => entry.idx <= 79);
  await writeFile(
    join(directory, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries }),
  );
  for (const entry of entries)
    await copyFile(join(migrations, `${entry.tag}.sql`), join(directory, `${entry.tag}.sql`));
  return directory;
}

async function seed(sql: ReturnType<typeof postgres>) {
  const owner = randomUUID(),
    guest = randomUUID(),
    training = randomUUID(),
    session = randomUUID();
  for (const id of [owner, guest])
    await sql`insert into core.users(id,name,email,email_verified) values (${id},'Fixture',${`${id}@example.test`},true)`;
  await sql`insert into bora_treinar.families(user_id) values (${owner})`;
  await sql`insert into missao_saber.families(user_id,consent_version) values (${owner},'fixture')`;
  await sql`insert into dia_de_estrela.families(user_id) values (${owner})`;
  const [school] =
    await sql`insert into agenda.student_profiles(user_id,name) values (${owner},'Clara') returning id`;
  await sql`insert into bora_treinar.profiles(id,user_id,name,color,weekly_goal) values (${training},${owner},'Clara','#123456',5)`;
  await sql`insert into bora_treinar.sessions(id,user_id,profile_id,workout_ref,workout_name,started_at,duration_seconds,mode)
    values (${session},${owner},${training},'fixture','Treino preservado',now(),90,'manual')`;
  const [study] =
    await sql`insert into missao_saber.profiles(user_id,nickname,grade,grade_year,course_id,avatar)
    values (${owner},'Clara',6,2026,'olitef-n1','cometa') returning id`;
  const [child] = await sql`insert into dia_de_estrela.children(user_id,name,color,position)
    values (${owner},'Clara','#654321',2) returning id`;
  const [member] =
    await sql`insert into agenda.family_members(owner_user_id,user_id) values (${owner},${guest}) returning id`;
  if (!school || !study || !child || !member) throw new Error("Historical fixture incomplete");
  await sql`insert into agenda.family_profile_access(member_id,profile_id) values (${member.id},${school.id})`;
  await sql`insert into cozya.recipes(user_id,name,ingredients,preparation) values (${owner},'Receita preservada','Ingrediente','Preparo')`;
  await sql`insert into billing.credit_ledger(owner_type,owner_id,app,entry_type,amount,expires_at)
    values ('user',${owner},'cozya','promo_grant',17,'2028-01-01T00:00:00Z')`;
  return { owner, guest, school: school.id, training, session, study: study.id, child: child.id };
}
type Fixture = Awaited<ReturnType<typeof seed>>;
async function historical(sql: ReturnType<typeof postgres>, f: Fixture) {
  return {
    school: await sql`select id,name from agenda.student_profiles where id=${f.school}`,
    training:
      await sql`select id,name,weekly_goal from bora_treinar.profiles where id=${f.training}`,
    study: await sql`select id,nickname,grade from missao_saber.profiles where id=${f.study}`,
    child: await sql`select id,name,color from dia_de_estrela.children where id=${f.child}`,
    session:
      await sql`select id,profile_id,workout_name from bora_treinar.sessions where id=${f.session}`,
    permissions:
      await sql`select a.profile_id from agenda.family_profile_access a join agenda.family_members m on m.id=a.member_id where m.user_id=${f.guest}`,
    recipe:
      await sql`select name,ingredients,preparation from cozya.recipes where user_id=${f.owner}`,
    credits:
      await sql`select amount,to_char(expires_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as expiry_utc from billing.credit_ledger where owner_id=${f.owner} and app='cozya'`,
  };
}
async function migrated(sql: ReturnType<typeof postgres>, f: Fixture) {
  const [identities] =
    await sql`select count(distinct p.id)::integer as profiles,count(distinct p.person_id)::integer as people,
      count(distinct p.person_id) filter (where person.display_name='Clara')::integer as named
    from family.app_profiles p join family.migration_sources s on s.group_id=p.group_id
    join family.people person on person.id=p.person_id
    where s.source_owner_id=${f.owner}`;
  const [links] = await sql`select
    (select family_profile_id is not null from agenda.student_profiles where id=${f.school}) as school,
    (select family_profile_id is not null from bora_treinar.profiles where id=${f.training}) as training,
    (select family_profile_id is not null from missao_saber.profiles where id=${f.study}) as study,
    (select family_profile_id is not null from dia_de_estrela.children where id=${f.child}) as child`;
  return {
    identities,
    links,
    school: await sql`select id from agenda.student_profiles where id=${f.school}`,
    training: await sql`select id,weekly_goal from bora_treinar.profiles where id=${f.training}`,
    session:
      await sql`select id,profile_id,workout_name from bora_treinar.sessions where id=${f.session}`,
    recipe:
      await sql`select name,ingredients,preparation from cozya.recipes where user_id=${f.owner}`,
    credits:
      await sql`select amount,to_char(expires_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS.US') as expiry_utc from billing.credit_ledger where owner_id=${f.owner} and app='cozya'`,
    permissions: await sql`select count(*)::integer as n from family.access_grants g
      join family.app_profiles p on p.id=g.profile_id where g.user_id=${f.guest} and g.action='read' and p.source_key=${f.school}`,
  };
}
function compareRecords(
  label: string,
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
) {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());
  for (const [key, value] of Object.entries(expected)) {
    phase = `compare ${label} ${key}`;
    assert.equal(JSON.stringify(actual[key]), JSON.stringify(value));
  }
}
try {
  const context = docker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  if (!context?.startsWith("npipe:////./pipe/")) throw new Error("Docker must be local on Windows");
  const image = docker(["image", "inspect", "postgres:18-alpine", "--format", "{{.Id}}"]);
  if (!image || !/^sha256:[a-f0-9]{64}$/.test(image))
    throw new Error("PostgreSQL 18 image unavailable locally");
  phase = "start isolated PostgreSQL";
  docker([
    "run",
    "--detach",
    "--name",
    containerName,
    "--label",
    `informach.compasso.restore=${token}`,
    "--env",
    "POSTGRES_PASSWORD",
    "--env",
    "PGDATA=/var/lib/postgresql/data",
    "--publish",
    "127.0.0.1::5432",
    "--tmpfs",
    "/var/lib/postgresql:rw",
    "--memory",
    "768m",
    "--cpus",
    "1",
    "--pull",
    "never",
    image,
  ]);
  created = true;
  if (!ownedContainer()) throw new Error("Container ownership verification failed");
  const binding = docker(["port", containerName, "5432/tcp"]);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(binding ?? "");
  if (!match) throw new Error("Unexpected PostgreSQL network binding");
  const port = Number(match[1]);
  const deadline = Date.now() + 60_000;
  while (docker(["exec", containerName, "pg_isready", "-U", "postgres"], true) === null) {
    if (Date.now() >= deadline) throw new Error("Disposable PostgreSQL did not become ready");
    await new Promise((done) => setTimeout(done, 1000));
  }
  const admin = connect(port, "postgres");
  const [version] = await admin`select current_setting('server_version_num')::integer as number`;
  const dumpVersion = docker(["exec", containerName, "pg_dump", "--version"]);
  if (
    Math.floor((version?.number ?? 0) / 10_000) !== 18 ||
    !/^pg_dump \(PostgreSQL\) 18\./.test(dumpVersion ?? "")
  )
    throw new Error("PostgreSQL server and dump utility must both use major version 18");
  await admin`create database compasso_source`;
  await admin`create database compasso_restore`;
  const source = connect(port, "compasso_source"),
    restored = connect(port, "compasso_restore");
  phase = "historical migration and fixtures";
  await migrate(drizzle(source), { migrationsFolder: await prefixMigrations() });
  const fixture = await seed(source);
  const expectedBefore = await historical(source, fixture);
  phase = "backup and restore";
  pgTool([
    "pg_dump",
    "-h",
    "127.0.0.1",
    "-U",
    "postgres",
    "-Fc",
    "--no-owner",
    "--no-acl",
    "-f",
    "/tmp/compasso-before.dump",
    "compasso_source",
  ]);
  pgTool([
    "pg_restore",
    "-h",
    "127.0.0.1",
    "-U",
    "postgres",
    "--exit-on-error",
    "--no-owner",
    "--no-acl",
    "-d",
    "compasso_restore",
    "/tmp/compasso-before.dump",
  ]);
  // Compare record values, not postgres-js result metadata tied to each connection.
  compareRecords("historical", await historical(restored, fixture), expectedBefore);
  phase = "upgrade both restored and original databases";
  await migrate(drizzle(source), { migrationsFolder: migrations });
  await migrate(drizzle(restored), { migrationsFolder: migrations });
  const expectedAfter = await migrated(source, fixture);
  compareRecords("migrated", await migrated(restored, fixture), expectedAfter);
  assert.deepEqual(expectedAfter.links, { school: true, training: true, study: true, child: true });
  assert.equal(expectedAfter.identities?.profiles, 4);
  assert.equal(expectedAfter.identities?.people, 4);
  assert.equal(expectedAfter.identities?.named, 4);
  assert.equal(expectedAfter.permissions[0]?.n, 1);
  assert.equal(expectedAfter.credits[0]?.amount, 17);
  assert.equal(expectedAfter.credits[0]?.expiry_utc, "2028-01-01 00:00:00.000000");
  assert.equal(expectedAfter.training[0]?.weekly_goal, 5);
  assert.equal(expectedAfter.session[0]?.workout_name, "Treino preservado");
  assert.equal(expectedAfter.recipe[0]?.name, "Receita preservada");
  process.stdout.write(
    `Restoration rehearsal passed on PostgreSQL 18; notices by code: ${JSON.stringify(Object.fromEntries(notices))}\n`,
  );
} catch (error) {
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    /^[A-Z0-9_]{1,30}$/.test(error.code)
      ? error.code
      : "verification_failed";
  process.stderr.write(`Restoration rehearsal failed during ${phase} (${code}).\n`);
  process.exitCode = 1;
} finally {
  for (const connection of connections.reverse()) {
    try {
      await connection.end({ timeout: 5 });
    } catch {
      process.stderr.write("Unable to close a fixture database connection.\n");
      process.exitCode = 1;
    }
  }
  if (created || ownedContainer()) {
    if (!ownedContainer()) {
      process.stderr.write("Refusing to remove an unverified Docker container.\n");
      process.exitCode = 1;
    } else if (docker(["rm", "--force", "--volumes", containerName], true) === null) {
      process.stderr.write("Unable to remove the owned Docker fixture.\n");
      process.exitCode = 1;
    }
  }
  const target = resolve(root);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("compasso-restore-")) {
    process.stderr.write("Refusing to remove an unverified temporary directory.\n");
    process.exitCode = 1;
  } else await rm(target, { recursive: true });
}
