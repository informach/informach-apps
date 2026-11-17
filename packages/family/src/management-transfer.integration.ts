import { randomUUID } from "node:crypto";
import { and, type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { createFamilyService } from "./index";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable database required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(() => connection.end());

it("serializes custody with an identity mutation in another family", async () => {
  const f = await fixture();
  const other = await family.createGroup(f.source, "Outro contexto da mesma pessoa");
  await db.insert(schema.familyGroupPeople).values({ groupId: other.id, personId: f.person.id });
  const request = await family.requestPersonTransfer(f.source, f.input);
  let release = () => {};
  let locked = () => {};
  const releasing = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locking = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const blocker = db.transaction(async (tx) => {
    await tx
      .select()
      .from(schema.familyPeople)
      .where(eq(schema.familyPeople.id, f.person.id))
      .for("update");
    locked();
    await releasing;
  });
  await locking;
  const accepted = family.resolvePersonTransfer(f.target, request.id, "accept");
  let archived: Promise<unknown> | undefined;
  async function waitForLockCount(expected: number) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const [row] =
        await connection`select count(*)::integer as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`;
      if (row?.waiting === expected) return;
    }
    throw new Error("Expected PostgreSQL lock wait was not observed");
  }
  try {
    await waitForLockCount(1);
    archived = family.archivePerson(f.source, other.id, f.person.id).then(
      () => ({ ok: true }),
      (error: unknown) => ({ ok: false, error }),
    );
    await waitForLockCount(2);
  } finally {
    release();
  }
  await blocker;
  await accepted;
  expect(await archived).toMatchObject({ ok: false, error: { code: "ACCESS_DENIED" } });
  const [link] = await db
    .select()
    .from(schema.familyGroupPeople)
    .where(
      and(
        eq(schema.familyGroupPeople.groupId, other.id),
        eq(schema.familyGroupPeople.personId, f.person.id),
      ),
    );
  expect(link?.archivedAt).toBeNull();
});

async function fixture() {
  const source = randomUUID();
  const target = randomUUID();
  const stranger = randomUUID();
  await db.insert(schema.users).values(
    [source, target, stranger].map((id) => ({
      id,
      name: "Adulto sintético",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const group = await family.createGroup(source, "Família sintética");
  const invitation = await family.createInvitation(source, group.id, `${target}@example.test`);
  await family.acceptInvitation(target, invitation.token);
  const person = await family.createPerson(source, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Cadastro sintético",
  });
  const input = {
    groupId: group.id,
    personId: person.id,
    expectedVersion: person.version,
    targetUserId: target,
  };
  return { source, target, stranger, group, person, input };
}

it("requires the named adult's acceptance, preserving app grants and auditing the handoff", async () => {
  const f = await fixture();
  await family.activateProfile(
    f.source,
    { groupId: f.group.id, personId: f.person.id, app: "agenda-da-turma" },
    async () => null,
  );
  const beforeGrants = await db
    .select()
    .from(schema.familyAccessGrants)
    .where(eq(schema.familyAccessGrants.groupId, f.group.id));
  const request = await family.requestPersonTransfer(f.source, f.input);
  expect((await family.requestPersonTransfer(f.source, f.input)).id).toBe(request.id);
  expect((await family.familyManagement(f.target, f.group.id)).transfers[0]?.personName).toBe(
    f.person.displayName,
  );
  expect((await family.listPeople(f.target, f.group.id)).some((p) => p.id === f.person.id)).toBe(
    false,
  );
  await expect(
    family.resolvePersonTransfer(f.stranger, request.id, "accept"),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(family.resolvePersonTransfer(f.source, request.id, "accept")).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await family.resolvePersonTransfer(f.target, request.id, "accept");
  expect(
    (await family.listPeople(f.target, f.group.id)).find((p) => p.id === f.person.id)
      ?.canManageIdentity,
  ).toBe(true);
  expect(
    (await family.listPeople(f.source, f.group.id)).find((p) => p.id === f.person.id)
      ?.canManageIdentity,
  ).toBe(false);
  expect(
    await db
      .select()
      .from(schema.familyAccessGrants)
      .where(eq(schema.familyAccessGrants.groupId, f.group.id)),
  ).toEqual(beforeGrants);
  await expect(family.resolvePersonTransfer(f.target, request.id, "accept")).rejects.toMatchObject({
    code: "CONFLICT",
  });
  const audit = await db
    .select()
    .from(schema.familyEvents)
    .where(eq(schema.familyEvents.personId, f.person.id));
  expect(audit.filter((event) => event.event === "person.transfer_accepted")).toHaveLength(1);
  expect(JSON.stringify(audit)).not.toContain(f.person.displayName);
});

it("rejects changed identity and expires requests; revocation survives leaving and rejoining", async () => {
  const f = await fixture();
  await expect(family.requestPersonTransfer(f.stranger, f.input)).rejects.toMatchObject({
    code: "ACCESS_DENIED",
  });
  await expect(
    family.requestPersonTransfer(f.source, { ...f.input, targetUserId: f.stranger }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const request = await family.requestPersonTransfer(f.source, f.input);
  await family.updatePerson(f.source, {
    groupId: f.group.id,
    personId: f.person.id,
    expectedVersion: f.person.version,
    displayName: "Nome atualizado",
    color: f.person.color,
    avatar: f.person.avatar,
  });
  await expect(family.resolvePersonTransfer(f.target, request.id, "accept")).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect((await family.familyManagement(f.target, f.group.id)).transfers).toHaveLength(0);
  const next = await family.requestPersonTransfer(f.source, {
    ...f.input,
    expectedVersion: f.person.version + 1,
  });
  const future = createFamilyService({ db, now: () => new Date(next.expiresAt.getTime() + 1) });
  await expect(future.resolvePersonTransfer(f.target, next.id, "accept")).rejects.toMatchObject({
    code: "CONFLICT",
  });
  await family.revokeMember(f.source, f.group.id, f.target);
  const invitation = await family.createInvitation(
    f.source,
    f.group.id,
    `${f.target}@example.test`,
  );
  await family.acceptInvitation(f.target, invitation.token);
  await expect(family.resolvePersonTransfer(f.target, next.id, "accept")).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(
    (
      await db
        .select()
        .from(schema.familyPersonManagers)
        .where(eq(schema.familyPersonManagers.personId, f.person.id))
    )[0]?.userId,
  ).toBe(f.source);
});

it("transfers archived identity without restoring content, and only one concurrent acceptance wins", async () => {
  const f = await fixture();
  await family.archivePerson(f.source, f.group.id, f.person.id);
  const [person] = await db
    .select()
    .from(schema.familyPeople)
    .where(eq(schema.familyPeople.id, f.person.id));
  if (!person) throw new Error("Missing fixture person");
  const request = await family.requestPersonTransfer(f.source, {
    ...f.input,
    expectedVersion: person.version,
  });
  const results = await Promise.allSettled([
    family.resolvePersonTransfer(f.target, request.id, "accept"),
    family.resolvePersonTransfer(f.target, request.id, "accept"),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  const [link] = await db
    .select()
    .from(schema.familyGroupPeople)
    .where(
      and(
        eq(schema.familyGroupPeople.groupId, f.group.id),
        eq(schema.familyGroupPeople.personId, person.id),
      ),
    );
  expect(link?.archivedAt).toBeInstanceOf(Date);
  expect(
    (await family.familyManagement(f.target, f.group.id)).archivedPeople.map((p) => p.id),
  ).toContain(person.id);
});

it("allows either party to revoke and refuses transfer of an adult's own account", async () => {
  const f = await fixture();
  const request = await family.requestPersonTransfer(f.source, f.input);
  await family.resolvePersonTransfer(f.target, request.id, "revoke");
  await family.resolvePersonTransfer(f.target, request.id, "revoke");
  await expect(family.resolvePersonTransfer(f.target, request.id, "accept")).rejects.toMatchObject({
    code: "CONFLICT",
  });
  const again = await family.requestPersonTransfer(f.source, f.input);
  await family.resolvePersonTransfer(f.source, again.id, "revoke");
  const adult = (await family.listPeople(f.source, f.group.id)).find(
    (p) => p.accountId === f.source,
  );
  if (!adult) throw new Error("Missing account person");
  await expect(
    family.requestPersonTransfer(f.source, {
      ...f.input,
      personId: adult.id,
      expectedVersion: adult.version,
    }),
  ).rejects.toThrow();
});
