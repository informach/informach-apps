import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import type { Database } from "@informach/db";
import * as schema from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { activateProfileInTransaction } from "./context";
import {
  captureProfileDelegations,
  delegatedProfileAccessCondition,
  type ProfileDelegation,
} from "./delegation";
import { createFamilyService } from "./index";

const url = process.env.DATABASE_URL;
if (!url || (process.env.COMPASSO_ISOLATED_DATABASE !== "1" && process.env.CI !== "true"))
  throw new Error("Family integration tests require an explicitly isolated database.");
const parsed = new URL(url);
if (!["127.0.0.1", "localhost", "postgres"].includes(parsed.hostname))
  throw new Error("Family tests cannot connect to a remote database.");
const connection = postgres(url, { max: 10, prepare: false });
const db: Database = drizzle(connection, { schema });
const family = createFamilyService({ db });
const owner = `compasso-owner-${randomUUID()}`;
const guest = `compasso-guest-${randomUUID()}`;
const stranger = `compasso-stranger-${randomUUID()}`;
const email = (userId: string) => `${userId}@example.test`;
beforeAll(async () => {
  await db.insert(schema.users).values(
    [owner, guest, stranger].map((id) => ({
      id,
      name: "Test adult",
      email: email(id),
      emailVerified: true,
    })),
  );
});
afterAll(async () => {
  await connection.end();
});

describe("family identity and authorization in PostgreSQL", () => {
  it("does not count a frozen administrator as the remaining family administrator", async () => {
    const first = randomUUID(),
      second = randomUUID();
    await db
      .insert(schema.users)
      .values(
        [first, second].map((id) => ({ id, name: "Adult", email: email(id), emailVerified: true })),
      );
    const group = await family.createGroup(first, "Remaining administrator");
    await family.acceptInvitation(
      second,
      (await family.createInvitation(first, group.id, email(second))).token,
    );
    await db
      .update(schema.familyMembers)
      .set({ role: "administrator" })
      .where(
        and(eq(schema.familyMembers.groupId, group.id), eq(schema.familyMembers.userId, second)),
      );
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: second, operationId, expectedRevision: 0 }),
    );
    await expect(family.revokeMember(first, group.id, first)).rejects.toMatchObject({
      code: "LAST_ADMINISTRATOR",
    });
    await expect(family.transferAdministration(first, group.id, second)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: second, operationId, expectedRevision: 1 }),
    );
    await family.revokeMember(first, group.id, first);
    expect(await family.listGroups(second)).toContainEqual(
      expect.objectContaining({ id: group.id, role: "administrator" }),
    );
  });
  it("serializes invitation acceptance with email change before locking the invitation", async () => {
    const recipient = `email-race-${randomUUID()}`;
    await db
      .insert(schema.users)
      .values({ id: recipient, name: "Recipient", email: email(recipient), emailVerified: true });
    const group = await family.createGroup(owner, "Identity race");
    const invitation = await family.createInvitation(owner, group.id, email(recipient));
    const locked = deferred();
    const release = deferred();
    let pid = 0;
    const change = db.transaction(async (tx) => {
      await tx.select().from(schema.users).where(eq(schema.users.id, recipient)).for("update");
      const [backend] = await tx.execute(sql`select pg_backend_pid() as pid`);
      if (typeof backend?.pid !== "number") throw new Error("Missing fixture backend");
      pid = backend.pid;
      locked.resolve();
      await release.promise;
      await tx
        .update(schema.users)
        .set({ email: `changed-${recipient}@example.test` })
        .where(eq(schema.users.id, recipient));
    });
    await locked.promise;
    const acceptance = family.acceptInvitation(recipient, invitation.token).then(
      () => ({ accepted: true, error: null }),
      (error: unknown) => ({ accepted: false, error }),
    );
    try {
      // Observe an actual PostgreSQL lock wait, not a guessed scheduling delay.
      const deadline = Date.now() + 5000;
      let blocked = false;
      while (Date.now() < deadline && !blocked) {
        const rows =
          await connection`select 1 from pg_stat_activity where wait_event_type = 'Lock' and ${pid} = any(pg_blocking_pids(pid))`;
        blocked = rows.length > 0;
      }
      expect(blocked).toBe(true);
    } finally {
      release.resolve();
    }
    await change;
    expect(await acceptance).toMatchObject({
      accepted: false,
      error: { code: "INVITATION_INVALID" },
    });
    const replacement = `replacement-${randomUUID()}`;
    await db.insert(schema.users).values({
      id: replacement,
      name: "Other person",
      email: email(recipient),
      emailVerified: true,
    });
    await expect(family.acceptInvitation(replacement, invitation.token)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    expect(
      await db
        .select()
        .from(schema.familyMembers)
        .where(
          and(
            eq(schema.familyMembers.groupId, group.id),
            eq(schema.familyMembers.userId, recipient),
          ),
        ),
    ).toHaveLength(0);
  });

  it("rolls back every activation when a later domain setup in the same transaction fails", async () => {
    const group = await family.createGroup(owner, "Atomic onboarding");
    const first = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "First",
    });
    const second = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Second",
    });
    await expect(
      db.transaction(async (tx) => {
        await activateProfileInTransaction(
          tx,
          owner,
          { groupId: group.id, personId: first.id, app: "dia-de-estrela" },
          async () => null,
        );
        await activateProfileInTransaction(
          tx,
          owner,
          { groupId: group.id, personId: second.id, app: "dia-de-estrela" },
          async () => {
            throw new Error("Domain setup refused");
          },
        );
      }),
    ).rejects.toThrow("Domain setup refused");
    expect(
      await db
        .select()
        .from(schema.familyAppProfiles)
        .where(eq(schema.familyAppProfiles.groupId, group.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(schema.familyAccessGrants)
        .where(eq(schema.familyAccessGrants.groupId, group.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(schema.familyPeople).where(eq(schema.familyPeople.id, first.id)),
    ).toHaveLength(1);
    await expect(
      family.activateProfile(
        owner,
        { groupId: group.id, personId: first.id, app: "dia-de-estrela" },
        async () => "Created",
      ),
    ).resolves.toMatchObject({ value: "Created" });
  });

  it("changes delegated authority on revocation and archive, preserving it across a name change", async () => {
    const group = await family.createGroup(owner, "Device authority");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Student",
    });
    const target = { groupId: group.id, personId: child.id, app: "missao-saber" };
    const activation = await family.activateProfile(owner, target, async () => null);
    const invite = await family.createInvitation(owner, group.id, email(guest));
    await family.acceptInvitation(guest, invite.token);
    const grant = { ...target, userId: guest, action: "read" as const };
    const readGrant = async () => {
      const [row] = await db
        .select({ id: schema.familyAccessGrants.id })
        .from(schema.familyAccessGrants)
        .where(
          and(
            eq(schema.familyAccessGrants.profileId, activation.profileId),
            eq(schema.familyAccessGrants.userId, guest),
            eq(schema.familyAccessGrants.action, "read"),
          ),
        );
      return row?.id;
    };
    const generation = async () => {
      const [row] = await db
        .select({ key: schema.familyAppProfiles.delegationKey })
        .from(schema.familyAppProfiles)
        .where(eq(schema.familyAppProfiles.id, activation.profileId));
      if (!row) throw new Error("Missing activation");
      return row.key;
    };
    await family.grantAccess(owner, grant);
    await family.grantAccess(owner, { ...grant, action: "write" });
    const capture = async () => {
      const [claim] = await db.transaction((tx) =>
        captureProfileDelegations(tx, guest, target.app, group.id, [activation.profileId]),
      );
      if (!claim) throw new Error("Missing delegation");
      return claim;
    };
    const valid = async (claim: ProfileDelegation, actor = guest, app = target.app) => {
      const rows = await db
        .select({ id: schema.familyAppProfiles.id })
        .from(schema.familyAppProfiles)
        .where(
          and(
            eq(schema.familyAppProfiles.id, claim.profileId),
            delegatedProfileAccessCondition(actor, app, {
              profileId: sql`${claim.profileId}`,
              groupId: sql`${claim.groupId}`,
              delegationKey: sql`${claim.delegationKey}`,
              readGrantId: sql`${claim.readGrantId}`,
              writeGrantId: sql`${claim.writeGrantId}`,
            }),
          ),
        );
      return rows.length === 1;
    };
    const originalClaim = await capture();
    expect(await valid(originalClaim)).toBe(true);
    expect(await valid(originalClaim, stranger)).toBe(false);
    expect(await valid(originalClaim, guest, "bora-treinar")).toBe(false);
    expect(await valid({ ...originalClaim, groupId: randomUUID() })).toBe(false);
    expect(await valid({ ...originalClaim, writeGrantId: originalClaim.readGrantId })).toBe(false);
    const first = await readGrant();
    expect(first).toBeTruthy();
    await family.grantAccess(owner, grant);
    expect(await readGrant()).toBe(first);
    await family.revokeAccess(owner, grant);
    expect(await readGrant()).toBeUndefined();
    expect(await valid(originalClaim)).toBe(false);
    await family.grantAccess(owner, grant);
    expect(await readGrant()).not.toBe(first);
    expect(await valid(originalClaim)).toBe(false);
    const renewedClaim = await capture();
    expect(await valid(renewedClaim)).toBe(true);
    const key = await generation();
    await family.updatePerson(owner, {
      groupId: group.id,
      personId: child.id,
      expectedVersion: 1,
      displayName: "Student renamed",
      color: "#123456",
      avatar: "person",
    });
    expect(await generation()).toBe(key);
    expect(await valid(renewedClaim)).toBe(true);
    await family.archivePerson(owner, group.id, child.id);
    const archived = await generation();
    expect(archived).not.toBe(key);
    await family.restorePerson(owner, group.id, child.id);
    expect(await generation()).toBe(archived);
    expect(await generation()).not.toBe(key);
    expect(await valid(renewedClaim)).toBe(false);
    expect(await valid(await capture())).toBe(true);
    await family.revokeMember(owner, group.id, guest);
    expect(await valid(renewedClaim)).toBe(false);
  });

  it("projects only authorized identities and hides other people's permissions and invitation secrets", async () => {
    const group = await family.createGroup(owner, "Management");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Private child",
    });
    const target = { groupId: group.id, personId: child.id, app: "agenda-da-turma" };
    await family.activateProfile(owner, target, async () => null);
    await family.activateProfile(owner, { ...target, app: "missao-saber" }, async () => null);
    const invite = await family.createInvitation(owner, group.id, email(guest));
    const ownerView = await family.familyManagement(owner, group.id);
    expect(ownerView.invitations).toHaveLength(1);
    expect(JSON.stringify(ownerView)).not.toContain(invite.token);
    expect(JSON.stringify(ownerView)).not.toContain("tokenHash");
    await family.acceptInvitation(guest, invite.token);
    expect((await family.familyManagement(guest, group.id)).people.map((p) => p.id)).not.toContain(
      child.id,
    );
    await family.grantAccess(owner, { ...target, userId: guest, action: "read" });
    const guestView = await family.familyManagement(guest, group.id);
    expect(guestView.people.find((p) => p.id === child.id)?.canManageIdentity).toBe(false);
    expect(guestView.profiles).toHaveLength(1);
    expect(guestView.profiles[0]).toMatchObject({
      app: "agenda-da-turma",
      actions: ["read"],
      grants: [],
    });
    expect(guestView.invitations).toEqual([]);
    await expect(family.familyManagement(stranger, group.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await family.revokeMember(owner, group.id, guest);
    await expect(family.familyManagement(guest, group.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });

  it("restores a managed participation with capacity checks without reopening an independently archived app", async () => {
    const group = await family.createGroup(owner, "Restore");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Archived child",
    });
    const target = { groupId: group.id, personId: child.id, app: "agenda-da-turma" };
    await family.activateProfile(owner, target, async () => null);
    const study = await family.activateProfile(
      owner,
      { ...target, app: "missao-saber" },
      async () => null,
    );
    await db
      .update(schema.familyAppProfiles)
      .set({ archivedAt: new Date() })
      .where(eq(schema.familyAppProfiles.id, study.profileId));
    await family.archivePerson(owner, group.id, child.id);
    expect(
      (await family.familyManagement(owner, group.id)).archivedPeople.map((p) => p.id),
    ).toContain(child.id);
    const replacement = [];
    for (let n = 0; n < 4; n++)
      replacement.push(
        await family.createPerson(owner, {
          groupId: group.id,
          kind: "dependent",
          displayName: `Child ${n}`,
        }),
      );
    await expect(family.restorePerson(owner, group.id, child.id)).rejects.toMatchObject({
      code: "CAPACITY_EXCEEDED",
    });
    await expect(family.restorePerson(stranger, group.id, child.id)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    const first = replacement[0];
    if (!first) throw new Error("Missing replacement");
    await family.archivePerson(owner, group.id, first.id);
    await family.restorePerson(owner, group.id, child.id);
    await expect(
      family.assertPersonAccess(owner, { ...target, action: "read" }),
    ).resolves.toBeDefined();
    await expect(
      family.assertPersonAccess(owner, { ...target, app: "missao-saber", action: "read" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("invalidates a reissued invitation and refuses inviting an existing adult", async () => {
    const group = await family.createGroup(owner, "Invitation rotation");
    await expect(family.createInvitation(owner, group.id, email(owner))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const first = await family.createInvitation(owner, group.id, email(guest));
    const second = await family.createInvitation(owner, group.id, email(guest));
    await expect(family.acceptInvitation(guest, first.token)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    expect((await family.familyManagement(owner, group.id)).invitations).toHaveLength(1);
    await family.acceptInvitation(guest, second.token);
    expect((await family.listGroups(guest)).some((g) => g.id === group.id)).toBe(true);
  });

  it("reuses a person across apps while keeping separate activation and permissions", async () => {
    const group = await family.createGroup(owner, "Test group");
    const person = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const target = {
      groupId: group.id,
      personId: person.id,
      app: "agenda-da-turma",
      action: "read" as const,
    };
    const agenda = await family.activateProfile(
      owner,
      { groupId: group.id, personId: person.id, app: "agenda-da-turma" },
      async (_tx, profileId) => profileId,
    );
    const study = await family.activateProfile(
      owner,
      { groupId: group.id, personId: person.id, app: "missao-saber" },
      async (_tx, profileId) => profileId,
    );
    expect(agenda.profileId).not.toBe(study.profileId);
    const invitation = await family.createInvitation(owner, group.id, email(guest));
    await family.acceptInvitation(guest, invitation.token);
    await expect(family.assertPersonAccess(guest, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await family.grantAccess(owner, { ...target, userId: guest });
    await expect(family.assertPersonAccess(guest, target)).resolves.toEqual({
      id: agenda.profileId,
    });
    await expect(
      family.assertPersonAccess(guest, { ...target, app: "missao-saber" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(family.assertPersonAccess(stranger, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(
      family.grantAccess(guest, { ...target, action: "manage", userId: stranger }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await family.revokeMember(owner, group.id, guest);
    await expect(family.assertPersonAccess(guest, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    expect(await family.listPeople(guest, group.id)).toEqual([]);
  });

  it("enforces the shared person capacity under concurrent writes", async () => {
    const group = await family.createGroup(owner, "Capacity");
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, (_, n) =>
        family.createPerson(owner, {
          groupId: group.id,
          kind: "dependent",
          displayName: `Child ${n}`,
        }),
      ),
    );
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(4);
    expect(
      (await family.listPeople(owner, group.id)).filter((person) => person.kind === "dependent"),
    ).toHaveLength(4);
  });

  it("protects the last administrator and accepts an invitation only for its verified recipient", async () => {
    const group = await family.createGroup(owner, "Invitations");
    await expect(family.revokeMember(owner, group.id, owner)).rejects.toMatchObject({
      code: "LAST_ADMINISTRATOR",
    });
    const invite = await family.createInvitation(owner, group.id, email(guest));
    await expect(family.acceptInvitation(stranger, invite.token)).rejects.toMatchObject({
      code: "INVITATION_INVALID",
    });
    const accepted = await Promise.all([
      family.acceptInvitation(guest, invite.token),
      family.acceptInvitation(guest, invite.token),
    ]);
    expect(accepted).toEqual([{ groupId: group.id }, { groupId: group.id }]);
    const members = await db
      .select()
      .from(schema.familyMembers)
      .where(eq(schema.familyMembers.groupId, group.id));
    expect(members).toHaveLength(2);
    await expect(family.createInvitation(owner, group.id, email(stranger))).rejects.toMatchObject({
      code: "CAPACITY_EXCEEDED",
    });
  });

  it("rejects cross-context grant references at the database boundary", async () => {
    const first = await family.createGroup(owner, "First");
    const second = await family.createGroup(stranger, "Second");
    const child = await family.createPerson(owner, {
      groupId: first.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const profile = await family.activateProfile(
      owner,
      { groupId: first.id, personId: child.id, app: "bora-treinar" },
      async () => null,
    );
    await expect(
      db.insert(schema.familyAccessGrants).values({
        groupId: second.id,
        profileId: profile.profileId,
        userId: stranger,
        action: "read",
      }),
    ).rejects.toThrow();
    await expect(
      family.assertPersonAccess(stranger, {
        groupId: second.id,
        personId: child.id,
        app: "bora-treinar",
        action: "read",
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("frees the adult place on revocation and transfers administration without granting content", async () => {
    const group = await family.createGroup(owner, "Membership lifecycle");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const target = { groupId: group.id, personId: child.id, app: "agenda-da-turma" };
    await family.activateProfile(owner, target, async () => null);
    const first = await family.createInvitation(owner, group.id, email(guest));
    await family.acceptInvitation(guest, first.token);
    await family.grantAccess(owner, { ...target, userId: guest, action: "read" });
    await family.revokeMember(owner, group.id, guest);
    const second = await family.createInvitation(owner, group.id, email(stranger));
    await family.acceptInvitation(stranger, second.token);
    await family.transferAdministration(owner, group.id, stranger);
    await expect(
      family.assertPersonAccess(stranger, { ...target, action: "read" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await expect(family.revokeMember(owner, group.id, stranger)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await family.revokeMember(stranger, group.id, owner);
    expect(await family.listGroups(owner)).not.toContainEqual(
      expect.objectContaining({ id: group.id }),
    );
    const third = await family.createInvitation(stranger, group.id, email(guest));
    await family.acceptInvitation(guest, third.token);
    await expect(
      family.assertPersonAccess(guest, { ...target, action: "read" }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  });

  it("updates common identity with a version guard and archives only the context", async () => {
    const group = await family.createGroup(owner, "Identity");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const input = {
      groupId: group.id,
      personId: child.id,
      displayName: "Clara Maria",
      expectedVersion: 1,
      color: "#48785C",
      avatar: "person",
    };
    await family.updatePerson(owner, input);
    await expect(family.updatePerson(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });
    const target = {
      groupId: group.id,
      personId: child.id,
      app: "dia-de-estrela",
      action: "read" as const,
    };
    await family.activateProfile(
      owner,
      { groupId: group.id, personId: child.id, app: "dia-de-estrela" },
      async () => null,
    );
    await family.archivePerson(owner, group.id, child.id);
    await expect(family.assertPersonAccess(owner, target)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    const [preserved] = await db
      .select()
      .from(schema.familyPeople)
      .where(eq(schema.familyPeople.id, child.id));
    expect(preserved?.displayName).toBe("Clara Maria");
  });

  it("rolls back activation, grants and audit if the app data write fails", async () => {
    const group = await family.createGroup(owner, "Atomic activation");
    const child = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const input = { groupId: group.id, personId: child.id, app: "bora-treinar" };
    await expect(
      family.activateProfile(owner, input, async () => {
        throw new Error("domain write failed");
      }),
    ).rejects.toThrow("domain write failed");
    expect(await family.findPersonProfile(owner, input)).toBeNull();
  });

  it("associates a confirmed identity without changing the activation or widening shared access", async () => {
    const group = await family.createGroup(owner, "Association");
    const first = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const second = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Clara",
    });
    const profile = await family.activateProfile(
      owner,
      { groupId: group.id, personId: first.id, app: "agenda-da-turma" },
      async () => null,
    );
    await family.activateProfile(
      owner,
      { groupId: group.id, personId: second.id, app: "missao-saber" },
      async () => null,
    );
    const invite = await family.createInvitation(owner, group.id, email(guest));
    await family.acceptInvitation(guest, invite.token);
    const access = {
      groupId: group.id,
      personId: first.id,
      app: "agenda-da-turma",
      action: "read" as const,
      userId: guest,
    };
    await family.grantAccess(owner, access);
    const input = {
      groupId: group.id,
      personId: second.id,
      sourcePersonId: first.id,
      app: "agenda-da-turma",
      expectedSourceVersion: 1,
      expectedTargetVersion: 1,
      confirmed: true as const,
    };
    await expect(family.associateProfile(guest, input)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(family.associateProfile(owner, input)).rejects.toMatchObject({ code: "CONFLICT" });
    await family.revokeAccess(owner, access);
    await expect(
      family.associateProfile(owner, { ...input, expectedTargetVersion: 2 }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await family.associateProfile(owner, input)).toEqual({
      profileId: profile.profileId,
      personId: second.id,
    });
    const profiles = await db
      .select()
      .from(schema.familyAppProfiles)
      .where(eq(schema.familyAppProfiles.groupId, group.id));
    expect(profiles).toHaveLength(2);
    expect(new Set(profiles.map((p) => p.personId))).toEqual(new Set([second.id]));
    expect(
      (await family.listPeople(owner, group.id)).filter((p) => p.kind === "dependent"),
    ).toHaveLength(1);
  });

  it("requires classification of imported fitness people before expanding the family", async () => {
    const group = await family.createGroup(owner, "Classification");
    const person = await family.createPerson(owner, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Legacy profile",
    });
    await db
      .update(schema.familyPeople)
      .set({ kind: "unclassified" })
      .where(eq(schema.familyPeople.id, person.id));
    await expect(
      family.createPerson(owner, {
        groupId: group.id,
        kind: "dependent",
        displayName: "New child",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      family.classifyPerson(guest, {
        groupId: group.id,
        personId: person.id,
        expectedVersion: 1,
        kind: "dependent",
      }),
    ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
    await family.classifyPerson(owner, {
      groupId: group.id,
      personId: person.id,
      expectedVersion: 1,
      kind: "dependent",
    });
    await expect(
      family.classifyPerson(owner, {
        groupId: group.id,
        personId: person.id,
        expectedVersion: 1,
        kind: "adult",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      family.createPerson(owner, {
        groupId: group.id,
        kind: "dependent",
        displayName: "New child",
      }),
    ).resolves.toMatchObject({ kind: "dependent" });
  });
});

function deferred() {
  let resolve: () => void = () => {
    throw new Error("Uninitialized fixture gate");
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
