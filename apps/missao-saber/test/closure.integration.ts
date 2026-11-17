import { randomUUID } from "node:crypto";
import type { WebClosureAuthority } from "@informach/account/closure";
import { freezeWebParticipation, resumeWebParticipation } from "@informach/auth/web-participation";
import { db, eq } from "@informach/db";
import {
  familyAppProfiles,
  familyPeople,
  missaoCompetitions,
  missaoCompetitionTurns,
  missaoCompetitors,
  missaoExperiments,
  missaoFamilies,
  missaoFamilyChallenges,
  missaoNotes,
  missaoProfiles,
  missaoReports,
  missaoReportUpdates,
  missaoSessions,
  missaoStudyCodes,
  missaoStudyDevices,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, it } from "vitest";
import { executeMissaoClosure, prepareMissaoClosure } from "@/features/account/closure-repository";
import { fixtureAuthority, seedStudent } from "./canonical-fixture";

const family = createFamilyService({ db });
async function actor() {
  const id = randomUUID();
  await db
    .insert(users)
    .values({ id, email: `${id}@example.test`, name: "Closure fixture", emailVerified: true });
  await db.insert(missaoFamilies).values({ userId: id, consentVersion: "fixture-v1" });
  return id;
}
async function profile(owner: string) {
  const native = await seedStudent({
    userId: owner,
    nickname: "PRIVATE_STUDENT",
    grade: 6,
    courseId: "olitef-n1",
  });
  const [activation] = await db
    .select()
    .from(familyAppProfiles)
    .where(eq(familyAppProfiles.id, native.familyProfileId));
  if (!activation) throw new Error("Missing activation");
  await db.insert(missaoSessions).values({
    profileId: native.id,
    lessonId: "fixture-lesson",
    version: 1,
    mode: "mission",
    snapshot: { private: "PRIVATE_STUDY" },
    requestKey: randomUUID(),
  });
  await db.insert(missaoNotes).values({ profileId: native.id, text: "PRIVATE_NOTE" });
  await db
    .insert(missaoExperiments)
    .values({ profileId: native.id, kind: "bars", state: { private: "PRIVATE_LAB" } });
  await report(owner, native.id);
  return { native, activation };
}
async function report(userId: string, profileId: string | null) {
  const [row] = await db
    .insert(missaoReports)
    .values({
      userId,
      profileId,
      lessonId: "fixture-lesson",
      version: 1,
      itemId: "fixture-item",
      detail: "PRIVATE_REPORT",
    })
    .returning();
  if (!row) throw new Error("Missing report");
  await db
    .insert(missaoReportUpdates)
    .values({ reportId: row.id, actorId: userId, status: "investigating", note: "PRIVATE_REPLY" });
  return row;
}
async function device(userId: string, familyGroupId: string) {
  const [row] = await db
    .insert(missaoStudyDevices)
    .values({
      userId,
      familyGroupId,
      tokenHash: randomUUID(),
      label: "Fixture device",
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .returning();
  if (!row) throw new Error("Missing device");
  await db
    .insert(missaoStudyCodes)
    .values({ deviceId: row.id, codeHash: randomUUID(), expiresAt: row.expiresAt });
  return row;
}
async function fixture() {
  const owner = await actor(),
    parent = await fixtureAuthority(owner);
  const first = await profile(owner),
    second = await profile(owner);
  await db.insert(missaoFamilyChallenges).values({
    userId: owner,
    familyGroupId: parent.familyGroupId,
    weekStart: "2026-11-09",
    goal: 8,
  });
  return { owner, parent, first, second, device: await device(owner, parent.familyGroupId) };
}
async function guestOf(f: Awaited<ReturnType<typeof fixture>>, profiles: (typeof f.first)[]) {
  const guest = await actor();
  await family.acceptInvitation(
    guest,
    (await family.createInvitation(f.owner, f.parent.familyGroupId, `${guest}@example.test`)).token,
  );
  for (const p of profiles)
    await family.grantAccess(f.owner, {
      groupId: f.parent.familyGroupId,
      personId: p.activation.personId,
      app: "missao-saber",
      userId: guest,
      action: "manage",
    });
  return guest;
}
async function competition(f: Awaited<ReturnType<typeof fixture>>) {
  const [row] = await db
    .insert(missaoCompetitions)
    .values({
      familyGroupId: f.parent.familyGroupId,
      userId: f.owner,
      title: "PRIVATE_EVENT",
      area: "matematica",
      problemCount: 0,
      challengeCount: 1,
      problemSeconds: 60,
      challengeSeconds: 120,
      seed: 1,
      requestKey: randomUUID(),
    })
    .returning();
  if (!row) throw new Error("Missing competition");
  const participants = await db
    .insert(missaoCompetitors)
    .values(
      [f.first, f.second].map((p, seat) => ({
        competitionId: row.id,
        profileId: p.native.id,
        seat,
        nickname: "PRIVATE_COPY",
        avatar: "cometa",
        grade: 6,
        level: "fixture",
        band: "c" as const,
      })),
    )
    .returning();
  await db.insert(missaoCompetitionTurns).values(
    participants.map((p, position) => ({
      competitionId: row.id,
      competitorId: p.id,
      position,
      kind: "challenge" as const,
      puzzleId: "fixture-puzzle",
      seconds: 120,
      answer: "PRIVATE_ANSWER",
    })),
  );
  return row;
}
async function freeze(actorId: string): Promise<WebClosureAuthority> {
  const operationId = randomUUID();
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: actorId, operationId, expectedRevision: 0 }),
  );
  return { actorId, operationId, frozenRevision: 1 };
}
const prepare = (authority: WebClosureAuthority) =>
  db.transaction((tx) => prepareMissaoClosure(tx, authority));

it("removes exclusive school history, orphan personal reports and issuer devices without erasing shared study", async () => {
  const f = await fixture(),
    guest = await guestOf(f, [f.second]);
  const otherDevice = await device(guest, f.parent.familyGroupId);
  const personalReport = await report(f.owner, null);
  await family.archivePerson(f.owner, f.parent.familyGroupId, f.first.activation.personId);
  const authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan).toMatchObject({
    personalRecords: 3,
    sharedRecords: 2,
    credentials: 1,
    blockers: [],
  });
  expect(JSON.stringify(plan)).not.toContain("PRIVATE");
  await db.transaction((tx) => executeMissaoClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db.select().from(missaoProfiles).where(eq(missaoProfiles.id, f.first.native.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoSessions).where(eq(missaoSessions.profileId, f.first.native.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoNotes).where(eq(missaoNotes.profileId, f.first.native.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(missaoExperiments)
      .where(eq(missaoExperiments.profileId, f.first.native.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoReports).where(eq(missaoReports.id, personalReport.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(missaoReportUpdates)
      .where(eq(missaoReportUpdates.reportId, personalReport.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoReports).where(eq(missaoReports.userId, f.owner)),
  ).toHaveLength(1);
  expect(
    await db.select().from(missaoStudyDevices).where(eq(missaoStudyDevices.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoStudyCodes).where(eq(missaoStudyCodes.deviceId, f.device.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoStudyDevices).where(eq(missaoStudyDevices.id, otherDevice.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(missaoNotes).where(eq(missaoNotes.profileId, f.second.native.id)),
  ).toHaveLength(1);
  expect(await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, f.owner))).toEqual(
    [],
  );
  expect(
    await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, guest)),
  ).toHaveLength(1);
  expect(
    await db
      .select()
      .from(missaoFamilyChallenges)
      .where(eq(missaoFamilyChallenges.familyGroupId, f.parent.familyGroupId)),
  ).toHaveLength(1);
  expect(
    await db.select().from(familyPeople).where(eq(familyPeople.id, f.first.activation.personId)),
  ).toHaveLength(1);
});

it("removes exclusive competitions including copied identities and turns, even with another ungranted group member", async () => {
  const f = await fixture();
  await guestOf(f, []);
  const event = await competition(f),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  expect(plan.blockers).toEqual([]);
  await db.transaction((tx) => executeMissaoClosure(tx, { ...authority, phase: "erase", plan }));
  expect(
    await db.select().from(missaoCompetitions).where(eq(missaoCompetitions.id, event.id)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoCompetitors).where(eq(missaoCompetitors.competitionId, event.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(missaoCompetitionTurns)
      .where(eq(missaoCompetitionTurns.competitionId, event.id)),
  ).toEqual([]);
  const solo = await fixture(),
    soloEvent = await competition(solo),
    soloAuthority = await freeze(solo.owner),
    soloPlan = await prepare(soloAuthority);
  await db.transaction((tx) =>
    executeMissaoClosure(tx, { ...soloAuthority, phase: "erase", plan: soloPlan }),
  );
  expect(
    await db
      .select()
      .from(missaoFamilyChallenges)
      .where(eq(missaoFamilyChallenges.familyGroupId, solo.parent.familyGroupId)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoCompetitions).where(eq(missaoCompetitions.id, soloEvent.id)),
  ).toEqual([]);
});

it("preserves fully shared competitions and refuses to partially erase a mixed competition", async () => {
  const mixed = await fixture();
  await guestOf(mixed, [mixed.second]);
  const event = await competition(mixed),
    authority = await freeze(mixed.owner),
    plan = await prepare(authority);
  expect(plan.blockers).toEqual(["responsibilities"]);
  await expect(
    db.transaction((tx) => executeMissaoClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  expect(
    await db.select().from(missaoCompetitors).where(eq(missaoCompetitors.competitionId, event.id)),
  ).toHaveLength(2);
  expect(
    await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, mixed.owner)),
  ).toHaveLength(1);
  const shared = await fixture();
  await guestOf(shared, [shared.first, shared.second]);
  const sharedEvent = await competition(shared),
    sharedAuthority = await freeze(shared.owner),
    sharedPlan = await prepare(sharedAuthority);
  expect(sharedPlan.blockers).toEqual([]);
  await db.transaction((tx) =>
    executeMissaoClosure(tx, { ...sharedAuthority, phase: "erase", plan: sharedPlan }),
  );
  expect(
    await db
      .select()
      .from(missaoCompetitors)
      .where(eq(missaoCompetitors.competitionId, sharedEvent.id)),
  ).toHaveLength(2);
  expect(
    await db
      .select()
      .from(missaoCompetitionTurns)
      .where(eq(missaoCompetitionTurns.competitionId, sharedEvent.id)),
  ).toHaveLength(2);
});

it("rejects a changed plan and old operation, while resumption removes only credentials", async () => {
  const f = await fixture(),
    authority = await freeze(f.owner),
    plan = await prepare(authority);
  await report(f.owner, null);
  await expect(
    db.transaction((tx) => executeMissaoClosure(tx, { ...authority, phase: "erase", plan })),
  ).rejects.toMatchObject({ code: "stale-plan" });
  await expect(prepare({ ...authority, operationId: randomUUID() })).rejects.toMatchObject({
    code: "stale-revision",
  });
  await db.transaction((tx) =>
    executeMissaoClosure(tx, { ...authority, phase: "resume", plan: null }),
  );
  expect(
    await db.select().from(missaoStudyDevices).where(eq(missaoStudyDevices.userId, f.owner)),
  ).toEqual([]);
  expect(
    await db.select().from(missaoNotes).where(eq(missaoNotes.profileId, f.first.native.id)),
  ).toHaveLength(1);
  expect(
    await db.select().from(missaoFamilies).where(eq(missaoFamilies.userId, f.owner)),
  ).toHaveLength(1);
  await db.transaction((tx) =>
    resumeWebParticipation(tx, {
      userId: f.owner,
      operationId: authority.operationId,
      expectedRevision: 1,
    }),
  );
  const fresh = await device(f.owner, f.parent.familyGroupId);
  await expect(
    db.transaction((tx) => executeMissaoClosure(tx, { ...authority, phase: "resume", plan: null })),
  ).rejects.toMatchObject({ code: "stale-revision" });
  expect(
    await db.select().from(missaoStudyDevices).where(eq(missaoStudyDevices.id, fresh.id)),
  ).toHaveLength(1);
});
