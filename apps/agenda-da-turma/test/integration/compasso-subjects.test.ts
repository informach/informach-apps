import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { agendaSubjects, agendaTasks } from "@informach/db/schema";
import { expect, it } from "vitest";
import { attachAlternatingSlots, listSubjectsForTurma } from "@/features/subjects/repository";
import { createSubjectInputSchema, updateSubjectInputSchema } from "@/features/subjects/schemas";
import {
  createSubject,
  createSubjectsBatch,
  deleteSubject,
  getSubjectsForUserAndTurma,
  updateSubject,
} from "@/features/subjects/service";
import { joinTurmaByCode, leaveTurma } from "@/features/turmas/service";
import { agendaFixture, classroomFixture, family, value } from "./compasso-fixture";

function subject(turmaId: string, name = "Matemática") {
  return createSubjectInputSchema.parse({ turmaId, name, classDays: [] });
}
it("uses current classroom authority, merges blanks across families and never overwrites established data", async () => {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroomFixture(host);
  const input = subject(c.turma.id);
  expect(await createSubject(guest.actor, input)).toMatchObject({ ok: false });
  const initial = value(await createSubject(host.actor, input));
  expect(initial).toMatchObject({ status: "created", subject: { colorIndex: 1 } });
  value(await joinTurmaByCode(guest.actor, { code: c.code, profileId: guest.profile.id }));
  const merged = value(
    await createSubject(guest.actor, { ...input, teacherName: "Teacher A", classDays: ["mon"] }),
  );
  expect(merged).toMatchObject({
    status: "merged_filled",
    filled: { teacherName: true, classDays: true },
    subject: { id: initial.subject.id },
  });
  expect(
    value(
      await createSubject(host.actor, { ...input, teacherName: "Teacher B", classDays: ["tue"] }),
    ),
  ).toMatchObject({
    status: "merged_noop",
    subject: { teacherName: "Teacher A", classDays: ["mon"] },
  });
  value(await leaveTurma(guest.actor, { profileId: guest.profile.id, turmaId: c.turma.id }));
  expect(await getSubjectsForUserAndTurma(guest.actor, c.turma.id)).toMatchObject({ ok: false });
  expect(await attachAlternatingSlots(guest.actor, [initial.subject])).toEqual([]);
});
it("does not promote a reader to a classroom contributor, and withdrawal also blocks that author's later edits", async () => {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroomFixture(host);
  value(await joinTurmaByCode(guest.actor, { code: c.code, profileId: guest.profile.id }));
  await family.grantAccess(guest.owner, { ...guest.target, action: "read" });
  const input = subject(c.turma.id, "Science");
  expect(value(await getSubjectsForUserAndTurma(guest.visitor, c.turma.id)).canCreateSubject).toBe(
    false,
  );
  expect(await createSubject(guest.visitor, input)).toMatchObject({ ok: false });
  await family.grantAccess(guest.owner, { ...guest.target, action: "write" });
  const created = value(await createSubject(guest.visitor, input)).subject;
  await family.revokeAccess(guest.owner, { ...guest.target, action: "write" });
  expect(
    await updateSubject(
      guest.visitor,
      updateSubjectInputSchema.parse({ ...input, id: created.id }),
    ),
  ).toMatchObject({ ok: false });
  expect(await deleteSubject(guest.visitor, { id: created.id })).toMatchObject({ ok: false });
  expect(await deleteSubject(host.actor, { id: created.id })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
});
it("rolls back a new subject on invalid pairing and keeps mirrored schedules atomic", async () => {
  const f = await agendaFixture(true);
  const c = await classroomFixture(f);
  const paired = value(
    await createSubject(f.actor, { ...subject(c.turma.id, "Music"), classDays: ["mon"] }),
  ).subject;
  const input = {
    ...subject(c.turma.id, "Arts"),
    classDays: ["mon" as const],
    alternatingSlots: [
      { dayOfWeek: "mon" as const, pairedSubjectId: randomUUID(), anchorDate: "2026-11-09" },
    ],
  };
  expect(await createSubject(f.actor, input)).toMatchObject({
    ok: false,
    error: { code: "INVALID_PAIRED_SUBJECT" },
  });
  expect((await listSubjectsForTurma(f.actor, c.turma.id)).map((s) => s.name)).toEqual(["Music"]);
  const arts = value(
    await createSubject(f.actor, {
      ...input,
      alternatingSlots: [
        { dayOfWeek: "mon", anchorDate: "2026-11-09", pairedSubjectId: paired.id },
      ],
    }),
  ).subject;
  const full = value(await getSubjectsForUserAndTurma(f.actor, c.turma.id)).subjects;
  expect(full.find((s) => s.id === paired.id)?.alternatingSlots).toMatchObject([
    { pairedSubjectId: arts.id, anchorDate: "2026-11-16" },
  ]);
  const badUpdate = updateSubjectInputSchema.parse({ ...input, name: "Changed", id: arts.id });
  expect(await updateSubject(f.actor, badUpdate)).toMatchObject({ ok: false });
  expect(
    value(await getSubjectsForUserAndTurma(f.actor, c.turma.id)).subjects.find(
      (s) => s.id === arts.id,
    )?.name,
  ).toBe("Arts");
  value(
    await updateSubject(
      f.actor,
      updateSubjectInputSchema.parse({ ...input, id: arts.id, alternatingSlots: [] }),
    ),
  );
  expect(
    value(await getSubjectsForUserAndTurma(f.actor, c.turma.id)).subjects.every(
      (s) => s.alternatingSlots.length === 0,
    ),
  ).toBe(true);
  value(await deleteSubject(f.actor, { id: arts.id }));
});
it("protects personal history as well as published work during delete and semantic renaming", async () => {
  const f = await agendaFixture(true);
  const c = await classroomFixture(f);
  const first = value(await createSubject(f.actor, subject(c.turma.id))).subject;
  const second = value(await createSubject(f.actor, subject(c.turma.id, "Redação"))).subject;
  expect(second.colorIndex).not.toBe(first.colorIndex);
  const input = updateSubjectInputSchema.parse({ ...subject(c.turma.id), id: first.id });
  expect(await updateSubject(f.actor, { ...input, name: second.name })).toMatchObject({
    ok: false,
    error: { code: "DUPLICATE" },
  });
  await db.insert(agendaTasks).values({
    profileId: f.profile.id,
    subjectId: first.id,
    title: "Private task",
    type: "task",
    dueAt: "2026-11-12",
    dateOrigin: "family",
    fingerprint: randomUUID(),
  });
  expect(await deleteSubject(f.actor, { id: first.id })).toMatchObject({
    ok: false,
    error: { code: "IN_USE" },
  });
  expect(await updateSubject(f.actor, { ...input, name: "Educação física" })).toMatchObject({
    ok: false,
    error: { code: "NAME_CHANGE_TOO_BIG" },
  });
  expect(
    await updateSubject(f.actor, { ...input, name: "matematica", teacherName: "New teacher" }),
  ).toMatchObject({ ok: true });
  expect(
    await db.select().from(agendaTasks).where(eq(agendaTasks.subjectId, first.id)),
  ).toHaveLength(1);
});
it("serializes concurrent batches and returns exact create/merge/no-op counts", async () => {
  const f = await agendaFixture(true);
  const c = await classroomFixture(f);
  value(await createSubject(f.actor, subject(c.turma.id, "Blank")));
  value(await createSubject(f.actor, { ...subject(c.turma.id, "Filled"), teacherName: "Keep" }));
  const input = {
    turmaId: c.turma.id,
    subjects: [
      { name: "New", teacherName: undefined, classDays: [] },
      { name: "Blank", teacherName: "Fill", classDays: [] },
      { name: "Filled", teacherName: "Ignored", classDays: [] },
    ],
  };
  const outcomes = (
    await Promise.all([createSubjectsBatch(f.actor, input), createSubjectsBatch(f.actor, input)])
  ).map(value);
  expect(outcomes.map((o) => o.counts)).toEqual(
    expect.arrayContaining([
      { created: 1, merged: 1, skipped: 1 },
      { created: 0, merged: 0, skipped: 3 },
    ]),
  );
  const rows = await db.select().from(agendaSubjects).where(eq(agendaSubjects.turmaId, c.turma.id));
  expect(rows).toHaveLength(3);
});
