import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { type Database, eq } from "@informach/db";
import * as schema from "@informach/db/schema";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, expect, it } from "vitest";
import { type FrozenFamilyActor, lockAppClosureScope, removeClosureProfileLinks } from "./closure";
import { createFamilyService } from "./index";

const url = process.env.DATABASE_URL;
if (
  !url ||
  process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
  !["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)
)
  throw new Error("Disposable PostgreSQL required");
const connection = postgres(url, { max: 4, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
afterAll(() => connection.end());
async function actor() {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, email: `${id}@example.test`, name: "Closure adult", emailVerified: true });
  return id;
}
async function fixture() {
  const owner = await actor(),
    guest = await actor();
  const group = await family.createGroup(owner, "Closure family");
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(owner, group.id, `${guest}@example.test`)).token,
  );
  const child = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "PRIVATE_CHILD",
  });
  const target = { groupId: group.id, personId: child.id, app: "bora-treinar" };
  const activation = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [profile] = await tx
      .insert(schema.boraProfiles)
      .values({ userId: owner, familyProfileId })
      .returning({ id: schema.boraProfiles.id });
    if (!profile) throw new Error("Missing native profile");
    return profile.id;
  });
  return { owner, guest, group, child, target, activation };
}
async function freeze(userId: string): Promise<FrozenFamilyActor> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId, operationId, expectedRevision: 0 }),
  );
  return { userId, operationId, expectedRevision: 1 };
}
const inspect = (actor: FrozenFamilyActor) =>
  db.transaction((tx) => lockAppClosureScope(tx, actor, "bora-treinar"));

it("locks app dependencies before family contexts and rechecks them under canonical locks", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner);
  let verified = false;
  const lockable = () =>
    db.transaction((tx) =>
      tx
        .select({ id: schema.familyGroups.id })
        .from(schema.familyGroups)
        .where(eq(schema.familyGroups.id, f.group.id))
        .for("update", { skipLocked: true }),
    );
  await db.transaction((tx) =>
    lockAppClosureScope(tx, authority, "bora-treinar", async (metadata) => {
      expect(metadata).toEqual({ profileIds: [f.activation.profileId], groupIds: [f.group.id] });
      expect(await lockable()).toHaveLength(1);
      return async () => {
        expect(await lockable()).toEqual([]);
        verified = true;
      };
    }),
  );
  expect(verified).toBe(true);
  await expect(
    db.transaction((tx) =>
      lockAppClosureScope(tx, authority, "bora-treinar", async () => async () => {
        throw new Error("School dependency changed");
      }),
    ),
  ).rejects.toThrow("School dependency changed");
});

it("includes archived exclusive histories and refuses to orphan native data or erase another app", async () => {
  const f = await fixture();
  const otherApp = await family.activateProfile(
    f.owner,
    { ...f.target, app: "missao-saber" },
    async () => null,
  );
  await family.archivePerson(f.owner, f.group.id, f.child.id);
  const authority = await freeze(f.owner);
  const scope = await inspect(authority);
  expect(scope.remove.map((profile) => profile.id)).toEqual([f.activation.profileId]);
  expect(scope.preserve).toEqual([]);
  expect(scope.blocked).toBe(false);
  expect(JSON.stringify(scope)).not.toContain("PRIVATE");
  await expect(
    db.transaction((tx) =>
      removeClosureProfileLinks(tx, authority, "bora-treinar", scope.fingerprint),
    ),
  ).rejects.toThrow();
  expect(
    await db
      .select()
      .from(schema.boraProfiles)
      .where(eq(schema.boraProfiles.id, f.activation.value)),
  ).toHaveLength(1);
  await db.transaction(async (tx) => {
    await lockAppClosureScope(tx, authority, "bora-treinar");
    await tx
      .delete(schema.boraProfiles)
      .where(eq(schema.boraProfiles.familyProfileId, f.activation.profileId));
    await removeClosureProfileLinks(tx, authority, "bora-treinar", scope.fingerprint);
  });
  expect(
    await db
      .select()
      .from(schema.familyAppProfiles)
      .where(eq(schema.familyAppProfiles.id, f.activation.profileId)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(schema.familyAppProfiles)
      .where(eq(schema.familyAppProfiles.id, otherApp.profileId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(schema.familyPeople).where(eq(schema.familyPeople.id, f.child.id)),
  ).toHaveLength(1);
});

it("a suspended reader still protects shared history and cannot be left as its only responsible adult", async () => {
  const f = await fixture();
  await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
  const authority = await freeze(f.owner);
  await freeze(f.guest);
  const scope = await inspect(authority);
  expect(scope.remove).toEqual([]);
  expect(scope.preserve.map((profile) => profile.id)).toEqual([f.activation.profileId]);
  expect(scope.blocked).toBe(true);
  await expect(
    db.transaction((tx) =>
      removeClosureProfileLinks(tx, authority, "bora-treinar", scope.fingerprint),
    ),
  ).rejects.toMatchObject({ code: "changed_authority" });
  expect(
    await db
      .select()
      .from(schema.boraProfiles)
      .where(eq(schema.boraProfiles.id, f.activation.value)),
  ).toHaveLength(1);
});

it("preserves another manager's history and revalidates availability and the exact frozen operation", async () => {
  const f = await fixture();
  await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "manage" });
  const authority = await freeze(f.owner);
  const first = await inspect(authority);
  expect(first.blocked).toBe(false);
  expect(first.remove).toEqual([]);
  const guestAuthority = await freeze(f.guest);
  const suspended = await inspect(authority);
  expect(suspended.blocked).toBe(true);
  expect(suspended.preserve.map((profile) => profile.id)).toEqual([f.activation.profileId]);
  await expect(
    db.transaction((tx) =>
      removeClosureProfileLinks(tx, authority, "bora-treinar", first.fingerprint),
    ),
  ).rejects.toMatchObject({ code: "changed_authority" });
  await expect(inspect({ ...authority, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
  await db.transaction((tx) => resumeWebParticipation(tx, guestAuthority));
  expect(await inspect(authority)).toEqual(first);
});

it("historical creation and read permission never become authority to erase another adult's profile", async () => {
  const f = await fixture();
  const [person] = await db
    .select({ id: schema.familyPeople.id })
    .from(schema.familyPeople)
    .where(eq(schema.familyPeople.userId, f.guest));
  if (!person) throw new Error("Guest identity missing");
  const target = { groupId: f.group.id, personId: person.id, app: "bora-treinar" };
  const profile = await family.activateProfile(f.guest, target, async (tx, familyProfileId) => {
    // Historical creator points at the payer; canonical authority belongs to guest.
    await tx.insert(schema.boraProfiles).values({ userId: f.owner, familyProfileId });
  });
  await family.grantAccess(f.guest, { ...target, userId: f.owner, action: "read" });
  const authority = await freeze(f.owner);
  const scope = await inspect(authority);
  expect(scope.preserve.map((item) => item.id)).toContain(profile.profileId);
  expect(scope.remove.map((item) => item.id)).not.toContain(profile.profileId);
  expect(scope.blocked).toBe(false);
});
