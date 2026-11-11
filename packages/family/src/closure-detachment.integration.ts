import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq, inArray } from "@informach/db";
import * as schema from "@informach/db/schema";
import { beforeAll, expect, it } from "vitest";
import { type FrozenFamilyActor, lockAppClosureScope, removeClosureProfileLinks } from "./closure";
import {
  detachClosedFamilyActor,
  lockFamilyDetachmentScope,
  prepareFamilyResumption,
} from "./closure-detachment";
import { createFamilyService } from "./index";

beforeAll(() => {
  if (
    process.env.COMPASSO_ISOLATED_DATABASE !== "1" ||
    !["localhost", "127.0.0.1", "postgres"].includes(
      new URL(process.env.DATABASE_URL ?? "").hostname,
    )
  )
    throw new Error("Disposable PostgreSQL required");
});
const family = createFamilyService({ db });
async function actor() {
  const id = randomUUID();
  await db
    .insert(schema.users)
    .values({ id, name: "Family closure", email: `${id}@example.test`, emailVerified: true });
  return id;
}
async function fixture(shared = false) {
  const owner = await actor(),
    guest = await actor();
  const group = await family.createGroup(owner, "Family closure");
  if (shared) {
    await family.acceptInvitation(
      guest,
      (await family.createInvitation(owner, group.id, `${guest}@example.test`)).token,
    );
    // Fixture has two administrators, a valid persisted state independent of transfer UI.
    await db
      .update(schema.familyMembers)
      .set({ role: "administrator" })
      .where(
        and(eq(schema.familyMembers.groupId, group.id), eq(schema.familyMembers.userId, guest)),
      );
  }
  const child = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "PRIVATE_COMMON_IDENTITY",
  });
  const target = { groupId: group.id, personId: child.id, app: "bora-treinar" };
  const profile = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [row] = await tx
      .insert(schema.boraProfiles)
      .values({ userId: owner, familyProfileId })
      .returning();
    if (!row) throw new Error("Missing native fixture");
    return row.id;
  });
  return { owner, guest, group, child, target, profile };
}
async function freeze(userId: string): Promise<FrozenFamilyActor> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId, operationId, expectedRevision: 0 }),
  );
  return { userId, operationId, expectedRevision: 1 };
}
const inspect = (authority: FrozenFamilyActor) =>
  db.transaction((tx) => lockFamilyDetachmentScope(tx, authority));
const detach = (authority: FrozenFamilyActor, fingerprint: string) =>
  db.transaction((tx) => detachClosedFamilyActor(tx, authority, fingerprint));
async function finishApp(authority: FrozenFamilyActor) {
  await db.transaction(async (tx) => {
    const scope = await lockAppClosureScope(tx, authority, "bora-treinar");
    if (scope.remove.length)
      await tx.delete(schema.boraProfiles).where(
        inArray(
          schema.boraProfiles.familyProfileId,
          scope.remove.map((p) => p.id),
        ),
      );
    await removeClosureProfileLinks(tx, authority, "bora-treinar", scope.fingerprint);
  });
}

it("waits for native app erasure, then removes exclusive common identities without deleting global login or financial provenance", async () => {
  const f = await fixture();
  await db.insert(schema.collectionAccounts).values({
    collection: "compasso",
    groupId: f.group.id,
    payerUserId: f.owner,
    closedAt: new Date(),
  });
  await db.insert(schema.creditLedger).values({
    app: "compasso",
    ownerType: "family",
    ownerId: f.group.id,
    entryType: "purchase",
    amount: 100,
  });
  const authority = await freeze(f.owner),
    plan = await inspect(authority);
  expect(plan.blocked).toBe(false);
  expect(plan.removePeople.map((p) => p.id)).toEqual([f.child.id]);
  expect(JSON.stringify(plan)).not.toContain("PRIVATE_COMMON_IDENTITY");
  await expect(detach(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "changed_authority",
  });
  expect(
    (
      await db.select().from(schema.familyMembers).where(eq(schema.familyMembers.userId, f.owner))
    )[0]?.revokedAt,
  ).toBeNull();
  await finishApp(authority);
  expect((await inspect(authority)).fingerprint).toBe(plan.fingerprint);
  await detach(authority, plan.fingerprint);
  expect(
    await db.select().from(schema.familyPeople).where(eq(schema.familyPeople.id, f.child.id)),
  ).toEqual([]);
  expect(
    (await db.select().from(schema.familyGroups).where(eq(schema.familyGroups.id, f.group.id)))[0]
      ?.archivedAt,
  ).toBeInstanceOf(Date);
  expect(await db.select().from(schema.users).where(eq(schema.users.id, f.owner))).toHaveLength(1);
  expect(
    await db
      .select()
      .from(schema.collectionAccounts)
      .where(eq(schema.collectionAccounts.payerUserId, f.owner)),
  ).toHaveLength(1);
  expect(
    (
      await db.select().from(schema.creditLedger).where(eq(schema.creditLedger.ownerId, f.group.id))
    )[0]?.amount,
  ).toBe(100);
});

it("preserves another adult's custody, grants and shared child/adult histories while revoking only the departing member", async () => {
  const f = await fixture(true);
  await db.insert(schema.familyPersonManagers).values({ personId: f.child.id, userId: f.guest });
  for (const action of ["read", "manage"] as const)
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action });
  const [adult] = await db
    .select()
    .from(schema.familyPeople)
    .where(eq(schema.familyPeople.userId, f.owner));
  if (!adult) throw new Error("Missing adult identity");
  const adultTarget = { ...f.target, personId: adult.id };
  await family.activateProfile(f.owner, adultTarget, async () => null);
  for (const action of ["read", "manage"] as const)
    await family.grantAccess(f.owner, { ...adultTarget, userId: f.guest, action });
  const authority = await freeze(f.owner),
    plan = await inspect(authority);
  expect(plan.blocked).toBe(false);
  expect(plan.removePeople).toEqual([]);
  await detach(authority, plan.fingerprint);
  expect(
    await db.select().from(schema.boraProfiles).where(eq(schema.boraProfiles.id, f.profile.value)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(schema.familyPersonManagers)
      .where(eq(schema.familyPersonManagers.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(schema.familyAccessGrants)
      .where(eq(schema.familyAccessGrants.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(schema.familyPersonManagers)
      .where(eq(schema.familyPersonManagers.userId, f.guest)),
  ).toHaveLength(1);
  expect((await family.listPeople(f.guest, f.group.id)).map((p) => p.id)).toEqual(
    expect.arrayContaining([f.child.id, adult.id]),
  );
  expect(
    (await db.select().from(schema.familyGroups).where(eq(schema.familyGroups.id, f.group.id)))[0]
      ?.archivedAt,
  ).toBeNull();
});

it.each(["custody", "administrator", "unavailable"] as const)(
  "refuses to strand responsibility when the remaining %s is missing",
  async (kind) => {
    const f = await fixture(true);
    for (const action of ["read", "manage"] as const)
      await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action });
    if (kind !== "custody")
      await db
        .insert(schema.familyPersonManagers)
        .values({ personId: f.child.id, userId: f.guest });
    if (kind === "administrator")
      await db
        .update(schema.familyMembers)
        .set({ role: "member" })
        .where(
          and(
            eq(schema.familyMembers.groupId, f.group.id),
            eq(schema.familyMembers.userId, f.guest),
          ),
        );
    if (kind === "unavailable") await freeze(f.guest);
    const authority = await freeze(f.owner),
      plan = await inspect(authority);
    expect(plan.blocked).toBe(true);
    await expect(detach(authority, plan.fingerprint)).rejects.toMatchObject({
      code: "changed_authority",
    });
    expect(
      await db
        .select()
        .from(schema.familyPersonManagers)
        .where(eq(schema.familyPersonManagers.userId, f.owner)),
    ).toHaveLength(1);
  },
);

it("rejects stale authority and preserves a new profile created by the other adult after preparation", async () => {
  const f = await fixture(true);
  const authority = await freeze(f.owner),
    plan = await inspect(authority);
  await finishApp(authority);
  const otherChild = await family.createPerson(f.guest, {
    groupId: f.group.id,
    kind: "dependent",
    displayName: "Another child",
  });
  const otherProfile = await family.activateProfile(
    f.guest,
    { ...f.target, personId: otherChild.id },
    async () => null,
  );
  await expect(detach(authority, plan.fingerprint)).rejects.toMatchObject({
    code: "changed_authority",
  });
  expect(
    await db.select().from(schema.familyPeople).where(eq(schema.familyPeople.id, f.child.id)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(schema.familyAppProfiles)
      .where(eq(schema.familyAppProfiles.id, otherProfile.profileId)),
  ).toHaveLength(1);
  await expect(inspect({ ...authority, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
});

it("includes archived identities beyond one page and custody left in a former group", async () => {
  const f = await fixture();
  const many = Array.from({ length: 251 }, () => ({
    id: randomUUID(),
    kind: "dependent" as const,
    displayName: "Archived fixture",
    archivedAt: new Date(),
  }));
  await db.insert(schema.familyPeople).values(many);
  await db
    .insert(schema.familyGroupPeople)
    .values(many.map((p) => ({ groupId: f.group.id, personId: p.id, archivedAt: new Date() })));
  await db
    .insert(schema.familyPersonManagers)
    .values(many.map((p) => ({ userId: f.owner, personId: p.id })));
  // No active membership is needed to retain an old common-identity responsibility.
  await db
    .update(schema.familyMembers)
    .set({ revokedAt: new Date() })
    .where(eq(schema.familyMembers.userId, f.owner));
  await db.delete(schema.boraProfiles).where(eq(schema.boraProfiles.id, f.profile.value));
  await db
    .delete(schema.familyAppProfiles)
    .where(eq(schema.familyAppProfiles.id, f.profile.profileId));
  const authority = await freeze(f.owner),
    plan = await inspect(authority);
  expect(plan.blocked).toBe(false);
  expect(plan.removePeople).toHaveLength(252);
  await detach(authority, plan.fingerprint);
  expect(
    await db
      .select()
      .from(schema.familyPersonManagers)
      .where(eq(schema.familyPersonManagers.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(schema.familyPeople)
      .where(
        inArray(
          schema.familyPeople.id,
          many.map((p) => p.id),
        ),
      ),
  ).toEqual([]);
});

it("resume invalidates old invitations/transfers but retains data and cannot revoke capabilities from a later participation", async () => {
  const f = await fixture(true);
  const transfer = await family.requestPersonTransfer(f.owner, {
    groupId: f.group.id,
    personId: f.child.id,
    targetUserId: f.guest,
    expectedVersion: f.child.version,
  });
  const solo = await family.createGroup(f.owner, "Invitations");
  const oldInvite = await family.createInvitation(f.owner, solo.id, `${f.guest}@example.test`);
  const authority = await freeze(f.owner);
  await db.transaction((tx) => prepareFamilyResumption(tx, authority));
  expect(
    (
      await db
        .select()
        .from(schema.familyPersonTransfers)
        .where(eq(schema.familyPersonTransfers.id, transfer.id))
    )[0]?.outcome,
  ).toBe("revoked");
  expect(
    (
      await db
        .select()
        .from(schema.familyInvitations)
        .where(eq(schema.familyInvitations.id, oldInvite.id))
    )[0]?.revokedAt,
  ).toBeInstanceOf(Date);
  expect(
    (
      await db
        .select()
        .from(schema.familyMembers)
        .where(
          and(
            eq(schema.familyMembers.groupId, f.group.id),
            eq(schema.familyMembers.userId, f.owner),
          ),
        )
    )[0]?.revokedAt,
  ).toBeNull();
  expect(
    await db.select().from(schema.boraProfiles).where(eq(schema.boraProfiles.id, f.profile.value)),
  ).toHaveLength(1);
  await db.transaction((tx) => resumeWebParticipation(tx, authority));
  const newInvite = await family.createInvitation(f.owner, solo.id, `${f.guest}@example.test`);
  await expect(
    db.transaction((tx) => prepareFamilyResumption(tx, authority)),
  ).rejects.toMatchObject({ code: "stale-revision" });
  expect(
    (
      await db
        .select()
        .from(schema.familyInvitations)
        .where(eq(schema.familyInvitations.id, newInvite.id))
    )[0]?.revokedAt,
  ).toBeNull();
});
