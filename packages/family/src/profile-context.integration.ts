import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { profileAccessCondition } from "./access";
import { lockFamilyMembership, removeProfileInTransaction } from "./context";
import {
  captureProfileDelegations,
  captureProfileReadDelegations,
  delegatedProfileReadCondition,
} from "./delegation";
import type { ProfileReadDelegation } from "./delegation-contract";
import { createFamilyService } from "./index";
import { lockProfileAccess, lockProfilesAccess } from "./profile-context";
import type { FamilyTransaction } from "./types";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Profile integration tests require an explicitly isolated database.");
if (!["127.0.0.1", "localhost", "postgres"].includes(new URL(url).hostname))
  throw new Error("Profile tests cannot connect to a remote database.");
const connection = postgres(url, { max: 10, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
const owner = `profile-owner-${randomUUID()}`;
const guest = `profile-guest-${randomUUID()}`;
beforeAll(async () => {
  await db.insert(schema.users).values(
    [owner, guest].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: id,
      emailVerified: true,
    })),
  );
  await db.insert(schema.boraFamilies).values({ userId: owner });
});
afterAll(async () => connection.end());

async function fixture() {
  const group = await family.createGroup(owner, "Profile context");
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Same name",
  });
  const target = { groupId: group.id, personId: person.id, app: "bora-treinar" };
  const activation = await family.activateProfile(owner, target, async (tx, familyProfileId) => {
    const [profile] = await tx
      .insert(schema.boraProfiles)
      .values({ userId: owner, familyProfileId })
      .returning({ id: schema.boraProfiles.id });
    if (!profile) throw new Error("Missing fixture profile");
    return profile.id;
  });
  const invitation = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invitation.token);
  return { target, nativeId: activation.value, activationId: activation.profileId };
}

async function writeGoal(tx: FamilyTransaction, actorId: string, nativeId: string) {
  const [profile] = await tx
    .select({ activationId: schema.boraProfiles.familyProfileId })
    .from(schema.boraProfiles)
    .where(eq(schema.boraProfiles.id, nativeId));
  if (!profile?.activationId) throw new Error("Missing canonical activation");
  const scope = await lockProfileAccess(tx, actorId, "bora-treinar", profile.activationId);
  await tx
    .update(schema.boraProfiles)
    .set({ weeklyGoal: 5 })
    .where(eq(schema.boraProfiles.id, nativeId));
  return scope;
}

describe("authoritative profile writes", () => {
  it("freezes only the departing actor across family and profile permissions", async () => {
    const f = await fixture();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: guest, operationId, expectedRevision: 0 }),
    );
    try {
      expect(await family.listGroups(guest)).toEqual([]);
      expect(await family.listPeople(guest, f.target.groupId)).toEqual([]);
      await expect(family.createGroup(guest, "Cannot reopen while frozen")).rejects.toMatchObject({
        code: "unavailable",
      });
      await expect(db.transaction((tx) => writeGoal(tx, guest, f.nativeId))).rejects.toBeDefined();
      await expect(
        db.transaction((tx) => lockFamilyMembership(tx, guest, f.target.groupId)),
      ).rejects.toMatchObject({ code: "unavailable" });
      expect(
        await db
          .select({ id: schema.boraProfiles.id })
          .from(schema.boraProfiles)
          .where(
            and(
              eq(schema.boraProfiles.id, f.nativeId),
              profileAccessCondition(guest, "bora-treinar", schema.boraProfiles.familyProfileId),
            ),
          ),
      ).toEqual([]);
      await db.transaction((tx) => writeGoal(tx, owner, f.nativeId));
      expect(
        await db
          .select({ id: schema.boraProfiles.id })
          .from(schema.boraProfiles)
          .where(eq(schema.boraProfiles.id, f.nativeId)),
      ).toHaveLength(1);
    } finally {
      await db.transaction((tx) =>
        resumeWebParticipation(tx, { userId: guest, operationId, expectedRevision: 1 }),
      );
    }
  });

  it("uses the persisted app activation, without granting content to a member or another app", async () => {
    const f = await fixture();
    const read = () =>
      db
        .select({ id: schema.boraProfiles.id })
        .from(schema.boraProfiles)
        .where(
          and(
            eq(schema.boraProfiles.id, f.nativeId),
            profileAccessCondition(guest, "bora-treinar", schema.boraProfiles.familyProfileId),
          ),
        );
    expect(await read()).toEqual([]);
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect(await read()).toEqual([{ id: f.nativeId }]);
    await expect(db.transaction((tx) => writeGoal(tx, guest, f.nativeId))).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    await expect(
      db.transaction((tx) => lockProfileAccess(tx, guest, "missao-saber", f.activationId)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(db.transaction((tx) => writeGoal(tx, guest, f.nativeId))).resolves.toMatchObject({
      personId: f.target.personId,
    });
    await family.revokeMember(owner, f.target.groupId, guest);
    expect(await read()).toEqual([]);
    await expect(db.transaction((tx) => writeGoal(tx, guest, f.nativeId))).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });

  it("delegates only reads and never revives a calendar credential after grant replacement or restoration", async () => {
    const f = await fixture();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    const capture = () =>
      db.transaction((tx) =>
        captureProfileReadDelegations(tx, guest, "bora-treinar", f.target.groupId, [
          f.activationId,
        ]),
      );
    const [first] = await capture();
    if (!first) throw new Error("Missing read claim");
    expect(first).not.toHaveProperty("writeGrantId");
    await expect(
      db.transaction((tx) =>
        captureProfileDelegations(tx, guest, "bora-treinar", f.target.groupId, [f.activationId]),
      ),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const read = (claim: ProfileReadDelegation, app = "bora-treinar") =>
      db
        .select({ id: schema.boraProfiles.id })
        .from(schema.boraProfiles)
        .where(
          and(
            eq(schema.boraProfiles.id, f.nativeId),
            delegatedProfileReadCondition(guest, app, {
              profileId: schema.boraProfiles.familyProfileId,
              groupId: sql`${claim.groupId}::uuid`,
              delegationKey: sql`${claim.delegationKey}::uuid`,
              readGrantId: sql`${claim.readGrantId}::uuid`,
            }),
          ),
        );
    expect(await read(first)).toEqual([{ id: f.nativeId }]);
    expect(await read(first, "agenda-da-turma")).toEqual([]);
    expect(await read({ ...first, groupId: randomUUID() })).toEqual([]);
    await family.revokeAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect(await read(first)).toEqual([]);
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "read" });
    expect(await read(first)).toEqual([]);
    const [second] = await capture();
    if (!second) throw new Error("Missing renewed read claim");
    expect(await read(second)).toHaveLength(1);
    await family.archivePerson(owner, f.target.groupId, f.target.personId);
    await family.restorePerson(owner, f.target.groupId, f.target.personId);
    expect(await read(second)).toEqual([]);
    const [third] = await capture();
    if (!third) throw new Error("Missing restored read claim");
    expect(await read(third)).toHaveLength(1);
    await family.revokeMember(owner, f.target.groupId, guest);
    expect(await read(third)).toEqual([]);
    await expect(capture()).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("rejects a queued write when permission is revoked while it waits for the group lock", async () => {
    const f = await fixture();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "write" });
    let writerPid = 0;
    let writing: Promise<{ error?: unknown }> | undefined;
    await db.transaction(async (revocation) => {
      await lockFamilyMembership(revocation, owner, f.target.groupId);
      writing = db
        .transaction(async (tx) => {
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          writerPid = backend?.pid ?? 0;
          await writeGoal(tx, guest, f.nativeId);
        })
        .then(
          () => ({}),
          (error: unknown) => ({ error }),
        );
      await expect
        .poll(async () => {
          if (!writerPid) return false;
          const [row] = await connection<
            { waiting: boolean }[]
          >`select exists(select 1 from pg_locks where pid = ${writerPid} and not granted) as waiting`;
          return row?.waiting;
        })
        .toBe(true);
      await revocation
        .delete(schema.familyAccessGrants)
        .where(
          and(
            eq(schema.familyAccessGrants.profileId, f.activationId),
            eq(schema.familyAccessGrants.userId, guest),
            eq(schema.familyAccessGrants.action, "write"),
          ),
        );
    });
    expect((await writing)?.error).toMatchObject({ code: "ACCESS_DENIED" });
    const [profile] = await db
      .select({ goal: schema.boraProfiles.weeklyGoal })
      .from(schema.boraProfiles)
      .where(eq(schema.boraProfiles.id, f.nativeId));
    expect(profile?.goal).toBe(3);
  });

  it("refuses queued erasure after its manage grant is revoked, including archived participation", async () => {
    const f = await fixture();
    await family.grantAccess(owner, { ...f.target, userId: guest, action: "manage" });
    await family.archivePerson(owner, f.target.groupId, f.target.personId);
    let writerPid = 0;
    let writing: Promise<{ error?: unknown }> | undefined;
    await db.transaction(async (revocation) => {
      await lockFamilyMembership(revocation, owner, f.target.groupId);
      writing = db
        .transaction(async (tx) => {
          const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          writerPid = backend?.pid ?? 0;
          await removeProfileInTransaction(
            tx,
            guest,
            "bora-treinar",
            f.activationId,
            async (nested) => {
              await nested
                .delete(schema.boraProfiles)
                .where(eq(schema.boraProfiles.id, f.nativeId));
            },
          );
        })
        .then(
          () => ({}),
          (error: unknown) => ({ error }),
        );
      await expect
        .poll(async () => {
          if (!writerPid) return false;
          const [row] = await connection<
            { waiting: boolean }[]
          >`select exists(select 1 from pg_locks where pid = ${writerPid} and not granted) as waiting`;
          return row?.waiting;
        })
        .toBe(true);
      await revocation
        .delete(schema.familyAccessGrants)
        .where(
          and(
            eq(schema.familyAccessGrants.profileId, f.activationId),
            eq(schema.familyAccessGrants.userId, guest),
            eq(schema.familyAccessGrants.action, "manage"),
          ),
        );
    });
    expect((await writing)?.error).toMatchObject({ code: "ACCESS_DENIED" });
    const [profile] = await db
      .select({ goal: schema.boraProfiles.weeklyGoal })
      .from(schema.boraProfiles)
      .where(eq(schema.boraProfiles.id, f.nativeId));
    expect(profile?.goal).toBe(3);
  });

  it("keeps native history through explicit association and refuses archived participation", async () => {
    const f = await fixture();
    const person = await family.createPerson(owner, {
      groupId: f.target.groupId,
      kind: "dependent",
      displayName: "Same name",
    });
    await family.associateProfile(owner, {
      ...f.target,
      sourcePersonId: f.target.personId,
      personId: person.id,
      expectedSourceVersion: 1,
      expectedTargetVersion: 1,
      confirmed: true,
    });
    await expect(db.transaction((tx) => writeGoal(tx, owner, f.nativeId))).resolves.toMatchObject({
      profileId: f.activationId,
      personId: person.id,
    });
    await family.archivePerson(owner, f.target.groupId, person.id);
    await expect(db.transaction((tx) => writeGoal(tx, owner, f.nativeId))).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });

  it("serializes multi-profile operations in either input order without widening grants", async () => {
    const first = await fixture();
    const second = await fixture();
    const ids = [first.activationId, second.activationId];
    await Promise.all(
      [ids, [...ids].reverse()].map((order) =>
        db.transaction(async (tx) => {
          await tx.execute(sql`set local lock_timeout = '3s'`);
          expect(await lockProfilesAccess(tx, owner, "bora-treinar", order)).toHaveLength(2);
          for (const nativeId of [first.nativeId, second.nativeId])
            await tx
              .update(schema.boraProfiles)
              .set({ weeklyGoal: sql`${schema.boraProfiles.weeklyGoal} + 1` })
              .where(eq(schema.boraProfiles.id, nativeId));
        }),
      ),
    );
    await family.grantAccess(owner, { ...first.target, userId: guest, action: "write" });
    await expect(
      db.transaction((tx) => lockProfilesAccess(tx, guest, "bora-treinar", ids)),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    const [profile] = await db
      .select({ goal: schema.boraProfiles.weeklyGoal })
      .from(schema.boraProfiles)
      .where(eq(schema.boraProfiles.id, first.nativeId));
    expect(profile?.goal).toBe(5);
  });
});
