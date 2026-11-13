import { randomUUID } from "node:crypto";
import type { WebClosureAuthority } from "@informach/account/closure";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaCalendarFeeds,
  agendaIdempotentWrites,
  agendaNotices,
  agendaNotificationDeliveries,
  agendaPushSubscriptions,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  creditReservations,
  familyAppProfiles,
  familyPeople,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { executeAgendaClosure, prepareAgendaClosure } from "@/features/account/closure-repository";
import { agendaAiBilling } from "@/features/ai/wallet-repository";
import { applyTaskStatusOnce } from "@/features/offline-queue/repository";
import { deleteStudentProfileForUser } from "@/features/students/repository";
import { createStudentProfile, deleteStudentProfile } from "@/features/students/service";
import { agendaFixture, classroomFixture, family, value } from "./compasso-fixture";

async function freeze(actorId: string): Promise<WebClosureAuthority> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: actorId, operationId, expectedRevision: 0 }),
  );
  return { actorId, operationId, frozenRevision: 1 };
}
async function secondProfile(f: Awaited<ReturnType<typeof agendaFixture>>, shared = false) {
  const person = await family.createPerson(f.owner, {
    groupId: f.actor.familyGroupId,
    kind: "dependent",
    displayName: "Second child",
  });
  const profile = value(
    await createStudentProfile(f.actor, { personId: person.id, birthDate: null }),
  );
  if (shared)
    await family.grantAccess(f.owner, { ...f.target, personId: person.id, action: "manage" });
  return profile;
}
async function task(
  profileId: string,
  owner: string,
  extra: Partial<typeof agendaTasks.$inferInsert> = {},
) {
  const [row] = await db
    .insert(agendaTasks)
    .values({
      profileId,
      createdByUserId: owner,
      title: "PRIVATE_TASK",
      type: "task",
      fingerprint: randomUUID(),
      ...extra,
    })
    .returning();
  if (!row) throw new Error("Missing task");
  return row;
}
async function notice(
  f: Awaited<ReturnType<typeof agendaFixture>>,
  extra: Partial<typeof agendaNotices.$inferInsert> = {},
) {
  const [row] = await db
    .insert(agendaNotices)
    .values({
      familyGroupId: f.actor.familyGroupId,
      captureProfileId: f.profile.id,
      createdByUserId: f.owner,
      source: "other",
      contentHash: randomUUID(),
      text: "PRIVATE_ORIGINAL",
      status: "confirmed",
      sourceProfileIds: [f.profile.id],
      ...extra,
    })
    .returning();
  if (!row) throw new Error("Missing notice");
  return row;
}
async function push(userId: string) {
  const [row] = await db
    .insert(agendaPushSubscriptions)
    .values({
      userId,
      endpoint: `https://example.test/${randomUUID()}`,
      p256dh: "fixture",
      auth: "fixture",
    })
    .returning();
  if (!row) throw new Error("Missing push");
  return row;
}

it("erases exclusive histories and private originals while preserving another manager's child and classroom publications", async () => {
  const f = await agendaFixture(true);
  const preserved = await secondProfile(f, true);
  const { turma: classroom } = await classroomFixture(f);
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId: classroom.id, name: "Shared subject", createdByUserId: f.owner })
    .returning();
  if (!subject) throw new Error("Missing subject");
  const [publication] = await db
    .insert(agendaActivities)
    .values({
      turmaId: classroom.id,
      subjectId: subject.id,
      familyGroupId: f.actor.familyGroupId,
      createdByUserId: f.owner,
      type: "task",
      title: "SHARED_PUBLICATION",
      dueAt: "2030-09-14",
      visibility: "shared_with_turma",
    })
    .returning();
  if (!publication) throw new Error("Missing publication");
  const privateOriginal = await notice(f);
  await task(f.profile.id, f.owner, {
    noticeId: privateOriginal.id,
    sharedActivityId: publication.id,
  });
  const keptTask = await task(preserved.id, f.owner, {
    noticeId: privateOriginal.id,
    sharedActivityId: publication.id,
  });
  const retainedOriginal = await notice(f, {
    captureProfileId: preserved.id,
    sourceProfileIds: [preserved.id],
    sharedWithinFamily: true,
  });
  const ownPush = await push(f.owner),
    otherPush = await push(f.visitor.userId);
  const [native] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.id, f.profile.id));
  if (!native) throw new Error("Missing native profile");
  const authority = await freeze(f.owner);
  const plan = await db.transaction((tx) => prepareAgendaClosure(tx, authority));
  expect(plan.blockers).toEqual([]);
  expect(JSON.stringify(plan)).not.toContain("PRIVATE");
  await db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db.select().from(agendaStudentProfiles).where(eq(agendaStudentProfiles.id, f.profile.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(familyAppProfiles)
      .where(eq(familyAppProfiles.id, native.familyProfileId)),
  ).toEqual([]);
  expect(
    await db.select().from(familyPeople).where(eq(familyPeople.id, f.target.personId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(agendaNotices).where(eq(agendaNotices.id, privateOriginal.id)),
  ).toEqual([]);
  expect(
    await db.select().from(agendaNotices).where(eq(agendaNotices.id, retainedOriginal.id)),
  ).toHaveLength(1);
  const [kept] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, keptTask.id));
  expect(kept).toMatchObject({
    noticeId: null,
    title: "PRIVATE_TASK",
    sharedActivityId: publication.id,
  });
  expect(
    await db.select().from(agendaActivities).where(eq(agendaActivities.id, publication.id)),
  ).toHaveLength(1);
  const [room] = await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, classroom.id));
  expect(room?.createdByUserId).toBeNull();
  expect(
    await db
      .select()
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.id, ownPush.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.id, otherPush.id)),
  ).toHaveLength(1);
});

it.each(["mixed", "private-other"])(
  "refuses an original (%s) both in ordinary deletion and closure without partially erasing histories",
  async (kind) => {
    const f = await agendaFixture(true),
      preserved = await secondProfile(f, true);
    const original = await notice(f, {
      sourceProfileIds: [f.profile.id, preserved.id],
      sharedWithinFamily: kind === "mixed",
      createdByUserId: kind === "mixed" ? f.owner : f.visitor.userId,
    });
    await expect(deleteStudentProfileForUser(f.actor, f.profile.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(await deleteStudentProfile(f.actor, f.profile.id)).toMatchObject({
      ok: false,
      error: { code: "SHARED_ORIGINAL" },
    });
    const authority = await freeze(f.owner);
    const plan = await db.transaction((tx) => prepareAgendaClosure(tx, authority));
    expect(plan.blockers).toContain("responsibilities");
    await expect(
      db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "erase", plan })),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(agendaStudentProfiles)
        .where(eq(agendaStudentProfiles.id, f.profile.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(agendaNotices).where(eq(agendaNotices.id, original.id)),
    ).toHaveLength(1);
  },
);

it("removes the departing adult's private original from a former family without erasing its task copy", async () => {
  const f = await agendaFixture(true);
  const original = await notice(f, { createdByUserId: f.visitor.userId });
  const kept = await task(f.profile.id, f.owner, { noticeId: original.id });
  await family.revokeMember(f.owner, f.actor.familyGroupId, f.visitor.userId);
  const authority = await freeze(f.visitor.userId);
  const plan = await db.transaction((tx) => prepareAgendaClosure(tx, authority));
  expect(plan.blockers).toEqual([]);
  await db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "erase", plan }));
  expect(await db.select().from(agendaNotices).where(eq(agendaNotices.id, original.id))).toEqual(
    [],
  );
  expect(
    await db.select().from(agendaStudentProfiles).where(eq(agendaStudentProfiles.id, f.profile.id)),
  ).toHaveLength(1);
  const [copy] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, kept.id));
  expect(copy).toMatchObject({ title: "PRIVATE_TASK", noticeId: null });
});

it("blocks an orphan credit reservation even after its deadline until billing actually releases it", async () => {
  const f = await agendaFixture(true);
  const { billing, owner } = await agendaAiBilling(f.actor, f.profile.id);
  const reservation = await billing.reserveCredits({
    owner,
    app: "agenda-da-turma",
    feature: "fixture",
    estimatedAmount: 4,
  });
  await db
    .update(creditReservations)
    .set({ expiresAt: new Date(Date.now() - 1000) })
    .where(eq(creditReservations.id, reservation.id));
  const authority = await freeze(f.owner);
  expect((await db.transaction((tx) => prepareAgendaClosure(tx, authority))).blockers).toContain(
    "pending_operations",
  );
  await expect(
    db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "resume", plan: null })),
  ).rejects.toThrow();
  await billing.releaseReservation({ reservationId: reservation.id, reason: "timeout" });
  expect((await db.transaction((tx) => prepareAgendaClosure(tx, authority))).blockers).toEqual([]);
});

it("waits for live delivery, then resumes without old credentials or replaying an offline mutation", async () => {
  const f = await agendaFixture(true),
    entry = await task(f.profile.id, f.owner);
  const key = randomUUID();
  await applyTaskStatusOnce({
    key,
    actor: f.actor,
    input: { id: entry.id, version: 1, status: "done" },
  });
  const ownPush = await push(f.owner);
  await db
    .insert(agendaCalendarFeeds)
    .values({ userId: f.owner, familyGroupId: f.actor.familyGroupId, tokenHash: randomUUID() });
  const [delivery] = await db
    .insert(agendaNotificationDeliveries)
    .values({
      userId: f.owner,
      familyGroupId: f.actor.familyGroupId,
      channel: "email",
      messageKey: randomUUID(),
      status: "processing",
      lastAttemptAt: new Date(),
    })
    .returning();
  if (!delivery) throw new Error("Missing delivery");
  const authority = await freeze(f.owner);
  const plan = await db.transaction((tx) => prepareAgendaClosure(tx, authority));
  expect(plan.blockers).toContain("pending_operations");
  await expect(
    db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "resume", plan: null })),
  ).rejects.toThrow();
  await db
    .update(agendaNotificationDeliveries)
    .set({ lastAttemptAt: sql`clock_timestamp() - interval '11 minutes'` })
    .where(eq(agendaNotificationDeliveries.id, delivery.id));
  await db.transaction((tx) =>
    executeAgendaClosure(tx, { ...authority, phase: "resume", plan: null }),
  );
  const [receipt] = await db
    .select()
    .from(agendaIdempotentWrites)
    .where(eq(agendaIdempotentWrites.key, key));
  expect(receipt?.result).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  expect(
    await db
      .select()
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.id, ownPush.id)),
  ).toEqual([]);
  expect(
    await db.select().from(agendaCalendarFeeds).where(eq(agendaCalendarFeeds.userId, f.owner)),
  ).toEqual([]);
  await db.transaction((tx) =>
    resumeWebParticipation(tx, {
      userId: f.owner,
      operationId: authority.operationId,
      expectedRevision: 1,
    }),
  );
  expect(
    await applyTaskStatusOnce({
      key,
      actor: f.actor,
      input: { id: entry.id, version: 1, status: "done" },
    }),
  ).toMatchObject({ replayed: true, result: { ok: false } });
  const [kept] = await db.select().from(agendaTasks).where(eq(agendaTasks.id, entry.id));
  expect(kept).toMatchObject({ status: "done", version: 2 });
  const freshPush = await push(f.owner);
  await expect(
    db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "resume", plan: null })),
  ).rejects.toThrow();
  expect(
    await db
      .select()
      .from(agendaPushSubscriptions)
      .where(eq(agendaPushSubscriptions.id, freshPush.id)),
  ).toHaveLength(1);
});

it("rejects stale plans and wrong frozen operations", async () => {
  const f = await agendaFixture(true);
  const original = await notice(f);
  const authority = await freeze(f.owner);
  const plan = await db.transaction((tx) => prepareAgendaClosure(tx, authority));
  await db
    .update(agendaNotices)
    .set({ updatedAt: new Date(Date.now() + 1000) })
    .where(eq(agendaNotices.id, original.id));
  await expect(
    db.transaction((tx) => executeAgendaClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toThrow();
  await expect(
    db.transaction((tx) => prepareAgendaClosure(tx, { ...authority, operationId: randomUUID() })),
  ).rejects.toThrow();
  expect(
    await db.select().from(agendaNotices).where(eq(agendaNotices.id, original.id)),
  ).toHaveLength(1);
});
