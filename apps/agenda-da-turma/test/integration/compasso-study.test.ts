import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { agendaTasks } from "@informach/db/schema";
import { expect, it } from "vitest";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { createProfileSubject } from "@/features/profile-subjects/service";
import { replaceStudyPlan } from "@/features/study-plan/repository";
import { createStudyPlan, listStudySessions, removeStudyPlan } from "@/features/study-plan/service";
import { listSubjectKits, saveSubjectKit } from "@/features/subject-kits/service";
import { agendaFixture, family, value } from "./compasso-fixture";

async function exam(profileId: string, userId: string) {
  const [task] = await db
    .insert(agendaTasks)
    .values({
      profileId,
      createdByUserId: userId,
      type: "exam",
      title: "Synthetic exam",
      dueAt: addDaysIso(todayLocalIso(), 6),
      dateOrigin: "school",
      fingerprint: randomUUID(),
    })
    .returning();
  if (!task) throw new Error("Exam missing");
  return task;
}
it("requires current write rights for study planning and cancellation", async () => {
  const f = await agendaFixture();
  const task = await exam(f.profile.id, f.owner);
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  const input = { taskId: task.id, sessions: 3, minutesEach: 30 };
  expect(await createStudyPlan(f.visitor, input)).toMatchObject({ ok: false });
  expect(await listStudySessions(f.actor, task.id)).toEqual([]);
  await family.grantAccess(f.owner, { ...f.target, action: "write" });
  expect(await createStudyPlan(f.visitor, input)).toEqual({ ok: true, value: { sessions: 3 } });
  const sessions = await listStudySessions(f.visitor, task.id);
  expect(sessions).toHaveLength(3);
  expect(sessions.every((s) => s.dueAt && s.dueAt < (task.dueAt ?? ""))).toBe(true);
  await family.revokeAccess(f.owner, { ...f.target, action: "write" });
  expect(await removeStudyPlan(f.visitor, { taskId: task.id })).toMatchObject({ ok: false });
  expect(await listStudySessions(f.actor, task.id)).toHaveLength(3);
  expect(await removeStudyPlan(f.actor, { taskId: task.id })).toEqual({
    ok: true,
    value: { canceled: 3 },
  });
});
it("keeps the previous plan when the free pending capacity refuses replacement", async () => {
  const f = await agendaFixture();
  const task = await exam(f.profile.id, f.owner);
  value(await createStudyPlan(f.actor, { taskId: task.id, sessions: 2, minutesEach: 30 }));
  const before = await listStudySessions(f.actor, task.id);
  await db.insert(agendaTasks).values(
    Array.from({ length: 17 }, (_, i) => ({
      profileId: f.profile.id,
      createdByUserId: f.owner,
      type: "task" as const,
      title: `Chore ${i}`,
      fingerprint: randomUUID(),
    })),
  );
  expect(
    await createStudyPlan(f.actor, { taskId: task.id, sessions: 3, minutesEach: 30 }),
  ).toMatchObject({ ok: false, error: { code: "ACTIVITY_LIMIT_REACHED", current: 20 } });
  expect(await listStudySessions(f.actor, task.id)).toEqual(before);
});
it("does not replace a plan computed for an older exam revision", async () => {
  const f = await agendaFixture();
  const task = await exam(f.profile.id, f.owner);
  value(await createStudyPlan(f.actor, { taskId: task.id, sessions: 2, minutesEach: 30 }));
  const before = await listStudySessions(f.actor, task.id);
  await db
    .update(agendaTasks)
    .set({ version: task.version + 1 })
    .where(eq(agendaTasks.id, task.id));
  expect(await replaceStudyPlan(f.actor, task.id, task.version, [])).toEqual({ conflict: true });
  expect(await listStudySessions(f.actor, task.id)).toEqual(before);
});
it("authorizes material lists by child and rechecks the subject relationship on write", async () => {
  const f = await agendaFixture();
  const subject = value(
    await createProfileSubject(f.actor, { profileId: f.profile.id, name: "Music", classDays: [] }),
  );
  const input = {
    profileId: f.profile.id,
    subjectId: null,
    profileSubjectId: subject.id,
    items: ["Flute"],
  };
  expect(await saveSubjectKit(f.actor, input)).toMatchObject({ ok: true });
  expect(await listSubjectKits(f.visitor, [f.profile.id])).toEqual(new Map());
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  expect(
    (await listSubjectKits(f.visitor, [f.profile.id])).get(`${f.profile.id}:${subject.id}`),
  ).toEqual(["Flute"]);
  expect(await saveSubjectKit(f.visitor, { ...input, items: ["Other"] })).toMatchObject({
    ok: false,
  });
  await family.grantAccess(f.owner, { ...f.target, action: "write" });
  expect(await saveSubjectKit(f.visitor, { ...input, items: ["Flute", "Book"] })).toMatchObject({
    ok: true,
  });
  const other = await agendaFixture();
  const otherSubject = value(
    await createProfileSubject(other.actor, {
      profileId: other.profile.id,
      name: "Other",
      classDays: [],
    }),
  );
  expect(
    await saveSubjectKit(f.actor, { ...input, profileSubjectId: otherSubject.id }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_SUBJECT" } });
  expect(
    (await listSubjectKits(f.actor, [f.profile.id])).get(`${f.profile.id}:${subject.id}`),
  ).toEqual(["Flute", "Book"]);
});
