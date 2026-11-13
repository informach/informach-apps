import { randomUUID } from "node:crypto";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { startCompassoTrial } from "@informach/billing/compasso";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaCalendarFeeds,
  agendaStudentProfiles,
  agendaTasks,
  familyAccessGrants,
  familyAppProfiles,
  familyMembers,
  familyPeople,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { describe, expect, it } from "vitest";
import { readCalendarTasks, replaceCalendarFeed } from "@/features/calendar-feed/repository";
import { hashFamilyToken } from "@/features/family/tokens";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  createStudentProfile,
  deleteStudentProfile,
  updateStudentProfile,
} from "@/features/students/service";
import { findTaskForUser } from "@/features/unified-activities/task-repository";

const family = createFamilyService({ db });
function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}
async function fixture(paid = false) {
  const owner = randomUUID(),
    guest = randomUUID();
  await db.insert(users).values(
    [owner, guest].map((id) => ({
      id,
      name: "Synthetic adult",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const group = await family.createGroup(owner, "School context");
  const actor = { userId: owner, familyGroupId: group.id };
  const visitor = { ...actor, userId: guest };
  const invite = await family.createInvitation(owner, group.id, `${guest}@example.test`);
  await family.acceptInvitation(guest, invite.token);
  if (paid)
    await startCompassoTrial(
      { db, trialHashSecret: "agenda-isolated-trial-secret".repeat(3) },
      owner,
      group.id,
    );
  const person = await family.createPerson(owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Clara",
  });
  const target = { groupId: group.id, personId: person.id, app: "agenda-da-turma" };
  const profile = value(
    await createStudentProfile(actor, { personId: person.id, birthDate: null }),
  );
  return { owner, guest, group, actor, visitor, person, target, profile };
}

describe("Agenda canonical identity and capabilities", () => {
  it("requires a fresh calendar link after suspension without deleting another adult's school data", async () => {
    const f = await fixture(true);
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
    const [task] = await db
      .insert(agendaTasks)
      .values({
        profileId: f.profile.id,
        title: "Preserved task",
        type: "task",
        dueAt: "2026-11-12",
        dateOrigin: "family",
        fingerprint: randomUUID(),
      })
      .returning();
    if (!task) throw new Error("Missing task");
    const token = randomUUID().replaceAll("-", "").repeat(2);
    value(await replaceCalendarFeed(f.visitor, token));
    expect(await readCalendarTasks(token, "2026-01-01", "2027-01-01")).toHaveLength(1);
    const operationId = randomUUID();
    await db.transaction((tx) =>
      freezeWebParticipation(tx, { userId: f.guest, operationId, expectedRevision: 0 }),
    );
    expect(await readCalendarTasks(token, "2026-01-01", "2027-01-01")).toBeNull();
    expect(await findTaskForUser(f.actor, task.id)).not.toBeNull();
    await db.transaction((tx) =>
      resumeWebParticipation(tx, { userId: f.guest, operationId, expectedRevision: 1 }),
    );
    expect(await readCalendarTasks(token, "2026-01-01", "2027-01-01")).toBeNull();
    const fresh = randomUUID().replaceAll("-", "").repeat(2);
    value(await replaceCalendarFeed(f.visitor, fresh));
    expect(await readCalendarTasks(fresh, "2026-01-01", "2027-01-01")).toHaveLength(1);
  });
  it("separates reading, editing, context and shared identity", async () => {
    const f = await fixture();
    expect(await findStudentProfileByIdForUser(f.visitor, f.profile.id)).toBeNull();
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
    const [task] = await db
      .insert(agendaTasks)
      .values({
        profileId: f.profile.id,
        createdByUserId: f.owner,
        type: "task",
        title: "School work",
        fingerprint: randomUUID(),
      })
      .returning();
    if (!task) throw new Error("Task missing");
    expect(await findTaskForUser(f.visitor, task.id)).toMatchObject({
      canWrite: false,
      familyGroupId: f.group.id,
    });

    expect(await findStudentProfileByIdForUser(f.visitor, f.profile.id)).toMatchObject({
      name: "Clara",
      canWrite: false,
      canManage: false,
    });
    expect(
      await updateStudentProfile(f.visitor, f.profile.id, { birthDate: "2017-03-15" }),
    ).toMatchObject({ ok: false });
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "write" });
    expect(await findTaskForUser(f.visitor, task.id)).toMatchObject({ canWrite: true });
    expect(
      await updateStudentProfile(f.visitor, f.profile.id, { birthDate: "2017-03-15" }),
    ).toMatchObject({ ok: true });
    await family.updatePerson(f.owner, {
      groupId: f.group.id,
      personId: f.person.id,
      expectedVersion: 1,
      displayName: "Clara compartilhada",
      color: "#123456",
      avatar: "person",
    });
    expect(await findStudentProfileByIdForUser(f.visitor, f.profile.id)).toMatchObject({
      name: "Clara compartilhada",
    });
    const other = await family.createGroup(f.owner, "Other context");
    expect(
      await findStudentProfileByIdForUser({ ...f.actor, familyGroupId: other.id }, f.profile.id),
    ).toBeNull();
    expect(await deleteStudentProfile(f.visitor, f.profile.id)).toMatchObject({ ok: false });
    await family.archivePerson(f.owner, f.group.id, f.person.id);
    expect(await deleteStudentProfile(f.actor, f.profile.id)).toMatchObject({ ok: true });
    expect(
      await db.select().from(familyPeople).where(eq(familyPeople.id, f.person.id)),
    ).toHaveLength(1);
  });

  it("serializes free capacity and rolls back the losing activation", async () => {
    const owner = randomUUID();
    await db
      .insert(users)
      .values({ id: owner, name: "Capacity", email: `${owner}@example.test`, emailVerified: true });
    const group = await family.createGroup(owner, "Capacity");
    const people = await Promise.all(
      ["One", "Two"].map((displayName) =>
        family.createPerson(owner, { groupId: group.id, kind: "dependent", displayName }),
      ),
    );
    const results = await Promise.all(
      people.map((p) =>
        createStudentProfile(
          { userId: owner, familyGroupId: group.id },
          { personId: p.id, birthDate: null },
        ),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toMatchObject([
      { error: { code: "PLAN_LIMIT_REACHED", current: 1, limit: 1 } },
    ]);
    expect(
      await db
        .select()
        .from(familyAppProfiles)
        .where(
          and(
            eq(familyAppProfiles.groupId, group.id),
            eq(familyAppProfiles.app, "agenda-da-turma"),
          ),
        ),
    ).toHaveLength(1);
  });

  it("rechecks a write grant after waiting for revocation", async () => {
    const f = await fixture();
    for (const action of ["read", "write"] as const)
      await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action });
    let pending: ReturnType<typeof updateStudentProfile> | undefined;
    await db.transaction(async (tx) => {
      await lockFamilyMembership(tx, f.owner, f.group.id);
      pending = updateStudentProfile(f.visitor, f.profile.id, { birthDate: "2017-03-15" });
      await expect
        .poll(async () => {
          const rows = await db.execute(
            sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%family%groups%'`,
          );
          return rows.length > 0;
        })
        .toBe(true);
      await tx
        .delete(familyAccessGrants)
        .where(
          and(
            eq(familyAccessGrants.profileId, f.profile.familyProfileId ?? ""),
            eq(familyAccessGrants.userId, f.guest),
            eq(familyAccessGrants.action, "write"),
          ),
        );
    });
    expect(await pending).toMatchObject({ ok: false });
    expect(await findStudentProfileByIdForUser(f.actor, f.profile.id)).toMatchObject({
      birthDate: null,
    });
  });

  it("rolls back a rejected batch including its earlier domain writes", async () => {
    const f = await fixture();
    const result = await atomicAgendaResult(async (tx) => {
      await tx
        .update(agendaStudentProfiles)
        .set({ birthDate: "2017-03-15" })
        .where(eq(agendaStudentProfiles.id, f.profile.id));
      return { ok: false as const, error: { code: "LATER_ROW_REFUSED" } };
    });
    expect(result).toMatchObject({ ok: false });
    expect(await findStudentProfileByIdForUser(f.actor, f.profile.id)).toMatchObject({
      birthDate: null,
    });
  });

  it("issues read-only calendar snapshots without adding future children or resurrecting grants", async () => {
    const f = await fixture(true);
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
    await db.insert(agendaTasks).values({
      profileId: f.profile.id,
      title: "First private task",
      type: "task",
      dueAt: "2026-11-12",
      dateOrigin: "family",
      fingerprint: randomUUID(),
    });
    let token = randomUUID().replaceAll("-", "").repeat(2);
    value(await replaceCalendarFeed(f.visitor, token));
    const rows = () => readCalendarTasks(token, "2026-01-01", "2027-01-01");
    expect(await rows()).toHaveLength(1);
    const second = await family.createPerson(f.owner, {
      groupId: f.group.id,
      kind: "dependent",
      displayName: "Sibling",
    });
    const other = value(
      await createStudentProfile(f.actor, { personId: second.id, birthDate: null }),
    );
    await family.grantAccess(f.owner, {
      groupId: f.group.id,
      personId: second.id,
      app: "agenda-da-turma",
      userId: f.guest,
      action: "read",
    });
    await db.insert(agendaTasks).values({
      profileId: other.id,
      title: "Later child",
      type: "task",
      dueAt: "2026-11-12",
      dateOrigin: "family",
      fingerprint: randomUUID(),
    });
    expect(await rows()).toHaveLength(1);
    await family.revokeAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
    expect(await rows()).toBeNull();
    await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
    expect(await rows()).toBeNull();
    token = randomUUID().replaceAll("-", "").repeat(2);
    value(await replaceCalendarFeed(f.visitor, token));
    expect(await rows()).toHaveLength(2);
    await db
      .update(agendaCalendarFeeds)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(agendaCalendarFeeds.tokenHash, hashFamilyToken(token)));
    expect(await rows()).toBeNull();
  });
});

it("closes a calendar capability when membership is revoked while waiting for the family", async () => {
  const f = await fixture(true);
  await family.grantAccess(f.owner, { ...f.target, userId: f.guest, action: "read" });
  const token = randomUUID();
  await replaceCalendarFeed(f.visitor, token);
  let pending: ReturnType<typeof readCalendarTasks> | undefined;
  await db.transaction(async (tx) => {
    await lockFamilyMembership(tx, f.owner, f.group.id);
    pending = readCalendarTasks(token, "2026-01-01", "2027-01-01");
    await expect
      .poll(async () => {
        const rows = await db.execute(
          sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%family%groups%'`,
        );
        return rows.length > 0;
      })
      .toBe(true);
    await tx
      .update(familyMembers)
      .set({ revokedAt: new Date() })
      .where(and(eq(familyMembers.groupId, f.group.id), eq(familyMembers.userId, f.guest)));
  });
  expect(await pending).toBeNull();
});
