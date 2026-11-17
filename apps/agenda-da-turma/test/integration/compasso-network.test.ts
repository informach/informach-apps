import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import { agendaActivities, agendaActivityAcceptances, agendaTasks } from "@informach/db/schema";
import { expect, it } from "vitest";
import {
  getPendingSharedActivitiesForUser,
  respondSharedActivity,
} from "@/features/activities/service";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { actionFieldsSchema, confirmNoticeSchema } from "@/features/notices/schemas";
import { confirmNotice, updateNoticeAction } from "@/features/notices/service";
import { createStudentProfile } from "@/features/students/service";
import { createSubjectInputSchema } from "@/features/subjects/schemas";
import { createSubject } from "@/features/subjects/service";
import { joinTurmaByCode, leaveTurma } from "@/features/turmas/service";
import { taskToActionInput } from "@/features/unified-activities/edit-defaults";
import { findTaskForUser } from "@/features/unified-activities/task-repository";
import { agendaFixture, classroomFixture, family, value } from "./compasso-fixture";

async function publishedFixture() {
  const host = await agendaFixture(true),
    guest = await agendaFixture(true);
  const c = await classroomFixture(host);
  value(await joinTurmaByCode(guest.actor, { code: c.code, profileId: guest.profile.id }));
  const subject = value(
    await createSubject(
      host.actor,
      createSubjectInputSchema.parse({ turmaId: c.turma.id, name: "School" }),
    ),
  ).subject;
  const result = value(
    await confirmNotice(
      host.actor,
      confirmNoticeSchema.parse({
        noticeId: null,
        sourceReviewed: true,
        sourceProfileIds: [host.profile.id],
        actions: [
          actionFieldsSchema.parse({
            profileId: host.profile.id,
            subjectId: subject.id,
            type: "task",
            title: "Published homework",
            description: null,
            time: null,
            location: null,
            sourceExcerpt: null,
            dueAt: addDaysIso(todayLocalIso(), 3),
            dateOrigin: "school",
            shareWithTurma: true,
          }),
        ],
      }),
    ),
  );
  const id = result.ids[0];
  if (!id) throw new Error("Missing task");
  const task = await findTaskForUser(host.actor, id);
  if (!task?.sharedActivityId) throw new Error("Missing publication");
  return { host, guest, c, task, activityId: task.sharedActivityId };
}
it("accepts only children in the selected household with current read and write, and stays idempotent", async () => {
  const { host, guest, c, activityId } = await publishedFixture();
  await family.grantAccess(guest.owner, { ...guest.target, action: "read" });
  expect(await getPendingSharedActivitiesForUser(guest.visitor)).toEqual([]);
  expect(await respondSharedActivity(guest.visitor, { activityId, accepted: true })).toMatchObject({
    ok: false,
  });
  await family.grantAccess(guest.owner, { ...guest.target, action: "write" });
  expect(await getPendingSharedActivitiesForUser(guest.visitor)).toMatchObject([{ activityId }]);
  const second = await family.createPerson(guest.owner, {
    groupId: guest.actor.familyGroupId,
    kind: "dependent",
    displayName: "Hidden sibling",
  });
  const sibling = value(
    await createStudentProfile(guest.actor, { personId: second.id, birthDate: null }),
  );
  value(await joinTurmaByCode(guest.actor, { code: c.code, profileId: sibling.id }));
  const results = await Promise.all([
    respondSharedActivity(guest.visitor, { activityId, accepted: true }),
    respondSharedActivity(guest.visitor, { activityId, accepted: true }),
  ]);
  expect(results.every((r) => r.ok)).toBe(true);
  const rows = await db
    .select({ profile: agendaTasks.profileId })
    .from(agendaTasks)
    .where(eq(agendaTasks.sharedActivityId, activityId));
  expect(rows.map((r) => r.profile).sort()).toEqual([host.profile.id, guest.profile.id].sort());
  expect(await getPendingSharedActivitiesForUser(guest.visitor)).toEqual([]);
  expect(await respondSharedActivity(host.actor, { activityId, accepted: true })).toMatchObject({
    ok: false,
    error: { code: "FORBIDDEN" },
  });
});
it("keeps the same adult's responses independent across households", async () => {
  const { guest, c, activityId } = await publishedFixture();
  value(await respondSharedActivity(guest.actor, { activityId, accepted: false }));
  const group = await family.createGroup(guest.owner, "Second household");
  const secondActor = { userId: guest.owner, familyGroupId: group.id };
  const person = await family.createPerson(guest.owner, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Another child",
  });
  const child = value(
    await createStudentProfile(secondActor, { personId: person.id, birthDate: null }),
  );
  value(await joinTurmaByCode(secondActor, { code: c.code, profileId: child.id }));
  expect(await getPendingSharedActivitiesForUser(secondActor)).toMatchObject([{ activityId }]);
  value(await respondSharedActivity(secondActor, { activityId, accepted: true }));
  const responses = await db
    .select()
    .from(agendaActivityAcceptances)
    .where(
      and(
        eq(agendaActivityAcceptances.activityId, activityId),
        eq(agendaActivityAcceptances.userId, guest.owner),
      ),
    );
  expect(responses).toHaveLength(2);
  expect(responses.find((r) => r.familyGroupId === guest.actor.familyGroupId)?.accepted).toBe(
    false,
  );
  expect(responses.find((r) => r.familyGroupId === group.id)?.accepted).toBe(true);
});
it("propagates only school fields and stops further corrections after a child leaves the classroom", async () => {
  const { host, guest, c, task, activityId } = await publishedFixture();
  value(await respondSharedActivity(guest.actor, { activityId, accepted: true }));
  const [copy] = await db
    .select()
    .from(agendaTasks)
    .where(
      and(
        eq(agendaTasks.profileId, guest.profile.id),
        eq(agendaTasks.sharedActivityId, activityId),
      ),
    );
  if (!copy) throw new Error("Missing received task");
  await db
    .update(agendaTasks)
    .set({ time: "18:30", location: "Private home" })
    .where(eq(agendaTasks.id, copy.id));
  value(
    await updateNoticeAction(host.actor, {
      id: task.id,
      version: task.version,
      action: taskToActionInput(task, { title: "Corrected" }),
    }),
  );
  const received = await findTaskForUser(guest.actor, copy.id);
  expect(received).toMatchObject({ title: "Corrected", time: "18:30", location: "Private home" });
  value(await leaveTurma(guest.actor, { profileId: guest.profile.id, turmaId: c.turma.id }));
  const current = await findTaskForUser(host.actor, task.id);
  if (!current) throw new Error("Missing author task");
  value(
    await updateNoticeAction(host.actor, {
      id: task.id,
      version: current.version,
      action: taskToActionInput(current, { title: "Later correction" }),
    }),
  );
  expect(await findTaskForUser(guest.actor, copy.id)).toMatchObject({ title: "Corrected" });
  expect(await respondSharedActivity(guest.actor, { activityId, accepted: true })).toMatchObject({
    ok: false,
  });
});
it("refuses to move an existing publication into a different classroom", async () => {
  const { host, task } = await publishedFixture();
  const next = await classroomFixture(host);
  const subject = value(
    await createSubject(
      host.actor,
      createSubjectInputSchema.parse({ turmaId: next.turma.id, name: "New school" }),
    ),
  ).subject;
  expect(
    await updateNoticeAction(host.actor, {
      id: task.id,
      version: task.version,
      action: taskToActionInput(task, { subjectId: subject.id }),
    }),
  ).toMatchObject({ ok: false, error: { code: "INVALID_SUBJECT" } });
  expect(await findTaskForUser(host.actor, task.id)).toMatchObject({
    version: task.version,
    subjectId: task.subjectId,
  });
});

it("rejects missing, withdrawn, private and expired publications without creating a receipt", async () => {
  const { guest, activityId } = await publishedFixture();
  expect(
    await respondSharedActivity(guest.actor, { activityId: randomUUID(), accepted: true }),
  ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  await db
    .update(agendaActivities)
    .set({ visibility: "individual" })
    .where(eq(agendaActivities.id, activityId));
  expect(await respondSharedActivity(guest.actor, { activityId, accepted: true })).toMatchObject({
    ok: false,
    error: { code: "NOT_SHARED" },
  });
  await db
    .update(agendaActivities)
    .set({ visibility: "shared_with_turma", dueAt: addDaysIso(todayLocalIso(), -1) })
    .where(eq(agendaActivities.id, activityId));
  expect(await respondSharedActivity(guest.actor, { activityId, accepted: true })).toMatchObject({
    ok: false,
    error: { code: "DUE_DATE_PASSED" },
  });
  await db
    .update(agendaActivities)
    .set({ canceledAt: new Date() })
    .where(eq(agendaActivities.id, activityId));
  expect(await respondSharedActivity(guest.actor, { activityId, accepted: true })).toMatchObject({
    ok: false,
    error: { code: "NOT_FOUND" },
  });
  expect(
    await db
      .select()
      .from(agendaActivityAcceptances)
      .where(eq(agendaActivityAcceptances.activityId, activityId)),
  ).toHaveLength(0);
});
