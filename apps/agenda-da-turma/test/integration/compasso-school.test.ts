import { randomUUID } from "node:crypto";
import { freezeWebParticipation } from "@informach/auth/web-participation";
import { and, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaStudentProfiles,
  agendaSubjectKits,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { applyTaskStatusOnce } from "@/features/offline-queue/repository";
import { listGroupAdults, removeGroupAdult, rotateGroupCode } from "@/features/turmas/group-access";
import { findTurmaWithSchoolById, listTurmasForUser } from "@/features/turmas/repository";
import {
  createOrJoinTurma,
  deleteTurma,
  joinTurmaByCode,
  leaveTurma,
  setActiveTurma,
  updateTurma,
} from "@/features/turmas/service";
import {
  agendaFixture,
  classroomFixture as classroom,
  family,
  schoolFixture as school,
  value,
} from "./compasso-fixture";

it("denies classroom administration and invitation reads after the owner's web suspension", async () => {
  const f = await agendaFixture(true),
    c = await classroom(f);
  await db.transaction((tx) =>
    freezeWebParticipation(tx, { userId: f.owner, operationId: randomUUID(), expectedRevision: 0 }),
  );
  expect(await listGroupAdults(f.owner, c.turma.id)).toBeNull();
  expect(await rotateGroupCode(f.owner, c.turma.id)).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await removeGroupAdult(f.owner, c.turma.id, f.visitor.userId)).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
  expect(await findTurmaWithSchoolById(f.actor, c.turma.id)).toBeNull();
  expect(await listTurmasForUser(f.actor)).toEqual([]);
  expect(
    (await db.select().from(agendaTurmas).where(eq(agendaTurmas.id, c.turma.id)))[0]?.code,
  ).toBe(c.code);
});

it("keeps classroom ownership separate, enrolls canonically and conceals the invitation from a reader", async () => {
  const f = await agendaFixture(true);
  const c = await classroom(f);
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  expect(await findTurmaWithSchoolById(f.visitor, c.turma.id)).toMatchObject({
    id: c.turma.id,
    code: null,
  });
  expect((await listTurmasForUser(f.visitor))[0]).toMatchObject({
    code: null,
    members: [{ profileName: "Child", canManage: false }],
  });
  expect(
    await setActiveTurma(f.visitor, { profileId: f.profile.id, turmaId: c.turma.id }),
  ).toMatchObject({ ok: false });
  expect(await rotateGroupCode(f.visitor.userId, c.turma.id)).toMatchObject({ ok: false });
  await family.grantAccess(f.owner, { ...f.target, action: "manage" });
  expect(
    await setActiveTurma(f.visitor, { profileId: f.profile.id, turmaId: c.turma.id }),
  ).toMatchObject({ ok: true });
  expect(await findTurmaWithSchoolById(f.visitor, c.turma.id)).toMatchObject({ code: null });
  const wrong = { ...f.actor, familyGroupId: (await agendaFixture()).actor.familyGroupId };
  expect(await leaveTurma(wrong, { profileId: f.profile.id, turmaId: c.turma.id })).toMatchObject({
    ok: false,
  });
  await family.revokeAccess(f.owner, { ...f.target, action: "read" });
  expect(await findTurmaWithSchoolById(f.visitor, c.turma.id)).toBeNull();
});
it("rolls back a class created before profile authorization is refused and deduplicates concurrent creation", async () => {
  const f = await agendaFixture();
  const schoolInepCode = await school();
  const input = {
    schoolInepCode,
    grade: "4ano" as const,
    year: 2026,
    classLetter: "A",
    profileId: f.profile.id,
  };
  expect(await createOrJoinTurma(f.visitor, input)).toMatchObject({ ok: false });
  expect(
    await db.select().from(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, schoolInepCode)),
  ).toHaveLength(0);
  const results = await Promise.all([
    createOrJoinTurma(f.actor, input),
    createOrJoinTurma(f.actor, input),
  ]);
  expect(
    results
      .map(value)
      .map((r) => r.created)
      .sort(),
  ).toEqual([false, true]);
  expect(new Set(results.map(value).map((r) => r.turma.id)).size).toBe(1);
});
it("records the enrolling adult without conferring classroom administration or leaking another family", async () => {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroom(host);
  await family.grantAccess(guest.owner, { ...guest.target, action: "read" });
  await family.grantAccess(guest.owner, { ...guest.target, action: "write" });
  await family.grantAccess(guest.owner, { ...guest.target, action: "manage" });
  value(await joinTurmaByCode(guest.visitor, { code: c.code, profileId: guest.profile.id }));
  expect(await findTurmaWithSchoolById(guest.visitor, c.turma.id)).toMatchObject({ code: c.code });
  expect(await findTurmaWithSchoolById(guest.actor, c.turma.id)).toMatchObject({ code: null });
  const listed = await listTurmasForUser(host.actor);
  expect(listed[0]?.members.map((m) => m.profileId)).toEqual([host.profile.id]);
  expect(listed[0]?.hasOtherFamilies).toBe(true);
  expect(await deleteTurma(host.actor, { turmaId: c.turma.id })).toMatchObject({
    ok: false,
    error: { code: "HAS_OTHER_MEMBERS" },
  });
  expect(await listGroupAdults(host.owner, c.turma.id)).toEqual([
    { id: guest.visitor.userId, name: "Synthetic" },
  ]);
  value(await removeGroupAdult(host.owner, c.turma.id, guest.visitor.userId));
  expect(await findTurmaWithSchoolById(guest.actor, c.turma.id)).toBeNull();
  expect(
    await joinTurmaByCode(guest.actor, { code: c.code, profileId: guest.profile.id }),
  ).toMatchObject({ ok: false });
});
it("rechecks the grant after a join waits for the classroom lock", async () => {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroom(host);
  for (const action of ["read", "manage"] as const)
    await family.grantAccess(guest.owner, { ...guest.target, action });
  let pending: ReturnType<typeof joinTurmaByCode> | undefined;
  await db.transaction(async (tx) => {
    await tx.select().from(agendaTurmas).where(eq(agendaTurmas.id, c.turma.id)).for("update");
    pending = joinTurmaByCode(guest.visitor, { code: c.code, profileId: guest.profile.id });
    await expect
      .poll(
        async () =>
          (
            await db.execute(
              sql`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query like '%turmas%'`,
            )
          ).length > 0,
      )
      .toBe(true);
    await family.revokeAccess(guest.owner, { ...guest.target, action: "manage" });
  });
  expect(await pending).toMatchObject({ ok: false });
  expect(
    await db
      .select()
      .from(agendaTurmaMembers)
      .where(
        and(
          eq(agendaTurmaMembers.turmaId, c.turma.id),
          eq(agendaTurmaMembers.studentProfileId, guest.profile.id),
        ),
      ),
  ).toHaveLength(0);
});
it("serializes incoming removal with an offline school update and retains private family work", async () => {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroom(host);
  value(await joinTurmaByCode(guest.actor, { code: c.code, profileId: guest.profile.id }));
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId: c.turma.id, name: "Math" })
    .returning();
  if (!subject) throw new Error("Missing subject");
  const [published] = await db
    .insert(agendaActivities)
    .values({
      turmaId: c.turma.id,
      familyGroupId: host.actor.familyGroupId,
      subjectId: subject.id,
      createdByUserId: host.owner,
      title: "Shared",
      type: "task",
      dueAt: "2026-11-12",
      visibility: "shared_with_turma",
    })
    .returning();
  if (!published) throw new Error("Missing activity");
  const [incoming] = await db
    .insert(agendaTasks)
    .values({
      profileId: guest.profile.id,
      subjectId: subject.id,
      sharedActivityId: published.id,
      title: "Shared",
      type: "task",
      dueAt: "2026-11-12",
      dateOrigin: "school",
      fingerprint: randomUUID(),
    })
    .returning();
  const [personal] = await db
    .insert(agendaTasks)
    .values({
      profileId: guest.profile.id,
      title: "Private",
      type: "task",
      dueAt: "2026-11-12",
      dateOrigin: "family",
      fingerprint: randomUUID(),
    })
    .returning();
  if (!incoming || !personal) throw new Error("Missing task");
  const results = await Promise.all([
    removeGroupAdult(host.owner, c.turma.id, guest.owner),
    applyTaskStatusOnce({
      key: randomUUID(),
      actor: guest.actor,
      input: { id: incoming.id, version: incoming.version, status: "done" },
    }),
  ]);
  expect(results[0]).toMatchObject({ ok: true });
  expect(await db.select().from(agendaTasks).where(eq(agendaTasks.id, incoming.id))).toHaveLength(
    0,
  );
  expect(await db.select().from(agendaTasks).where(eq(agendaTasks.id, personal.id))).toHaveLength(
    1,
  );
  expect(
    await db
      .select({ active: agendaStudentProfiles.activeTurmaId })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.id, guest.profile.id)),
  ).toEqual([{ active: null }]);
});

it("updates and deletes only a fresh classroom and checks natural-key collisions atomically", async () => {
  const f = await agendaFixture(true);
  const schoolInepCode = await school();
  const input = { schoolInepCode, grade: "4ano" as const, year: 2026, profileId: f.profile.id };
  const a = value(await createOrJoinTurma(f.actor, { ...input, classLetter: "A" }));
  const b = value(await createOrJoinTurma(f.actor, { ...input, classLetter: "B" }));
  const patch = { turmaId: a.turma.id, grade: "4ano" as const, year: 2026, classLetter: "B" };
  expect(await updateTurma(f.actor, patch)).toMatchObject({
    ok: false,
    error: { code: "CONFLICT_EXISTING_TURMA" },
  });
  expect(await updateTurma(f.visitor, { ...patch, classLetter: "C" })).toMatchObject({ ok: false });
  value(await updateTurma(f.actor, { ...patch, classLetter: "C" }));
  value(await deleteTurma(f.actor, { turmaId: a.turma.id }));
  expect(await findTurmaWithSchoolById(f.actor, a.turma.id)).toBeNull();
  expect(
    await db
      .select({ active: agendaStudentProfiles.activeTurmaId })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.id, f.profile.id)),
  ).toEqual([{ active: b.turma.id }]);
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId: b.turma.id, name: "School" })
    .returning();
  if (!subject) throw new Error("Missing subject");
  await db.insert(agendaTasks).values({
    profileId: f.profile.id,
    subjectId: subject.id,
    title: "Historical work",
    type: "task",
    dueAt: "2026-11-12",
    dateOrigin: "school",
    fingerprint: randomUUID(),
  });
  expect(await deleteTurma(f.actor, { turmaId: b.turma.id })).toMatchObject({
    ok: false,
    error: { code: "HAS_ACTIVITIES" },
  });
  expect(
    await updateTurma(f.actor, { ...patch, turmaId: b.turma.id, classLetter: "D" }),
  ).toMatchObject({ ok: false, error: { code: "HAS_ACTIVITIES" } });
});

it("preserves a classroom whose only stored child history is a materials list", async () => {
  const f = await agendaFixture(true),
    c = await classroom(f);
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId: c.turma.id, name: "Art" })
    .returning();
  if (!subject) throw new Error("Missing subject");
  await db
    .insert(agendaSubjectKits)
    .values({ profileId: f.profile.id, subjectId: subject.id, items: ["Paintbrush"] });
  expect(await deleteTurma(f.actor, { turmaId: c.turma.id })).toMatchObject({
    ok: false,
    error: { code: "HAS_ACTIVITIES" },
  });
  expect(
    await db.select().from(agendaSubjectKits).where(eq(agendaSubjectKits.subjectId, subject.id)),
  ).toHaveLength(1);
});
