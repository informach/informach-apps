import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import {
  agendaActivities,
  agendaCities,
  agendaNotices,
  agendaSchools,
  agendaStates,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  familyAccessGrants,
} from "@informach/db/schema";
import { expect, it } from "vitest";
import { getNoticeSource } from "@/features/notices/repository";
import { actionFieldsSchema, confirmNoticeSchema } from "@/features/notices/schemas";
import { confirmNotice } from "@/features/notices/service";
import { actionFingerprint } from "@/features/notices/write-repository";
import { createStudentProfile } from "@/features/students/service";
import { agendaFixture, family, value } from "./compasso-fixture";

function action(profileId: string, title: string, dueAt = "2026-11-12") {
  return actionFieldsSchema.parse({
    profileId,
    type: "task",
    title,
    description: null,
    dueAt,
    dateOrigin: "school",
    time: null,
    location: null,
    sourceExcerpt: null,
  });
}
it("requires read and write for the complete reviewed source without a creator bypass", async () => {
  const f = await agendaFixture(true);
  const person = await family.createPerson(f.owner, {
    groupId: f.actor.familyGroupId,
    kind: "dependent",
    displayName: "Sibling",
  });
  const sibling = value(
    await createStudentProfile(f.actor, { personId: person.id, birthDate: null }),
  );
  const [notice] = await db
    .insert(agendaNotices)
    .values({
      familyGroupId: f.actor.familyGroupId,
      createdByUserId: f.owner,
      captureProfileId: f.profile.id,
      source: "other",
      text: "Private original for both children",
      contentHash: randomUUID(),
      status: "ready",
    })
    .returning();
  if (!notice) throw new Error("Notice missing");
  value(
    await confirmNotice(
      f.actor,
      confirmNoticeSchema.parse({
        noticeId: notice.id,
        shareOriginal: true,
        sourceReviewed: true,
        sourceProfileIds: [f.profile.id, sibling.id],
        actions: [action(f.profile.id, "First child task")],
      }),
    ),
  );
  await family.grantAccess(f.owner, { ...f.target, action: "read" });
  expect(await getNoticeSource(f.visitor, notice.id)).toBeNull();
  const siblingGrant = { ...f.target, personId: person.id };
  await family.grantAccess(f.owner, { ...siblingGrant, action: "read" });
  expect(await getNoticeSource(f.visitor, notice.id)).not.toBeNull();
  await family.grantAccess(f.owner, { ...f.target, action: "write" });
  const second = confirmNoticeSchema.parse({
    noticeId: notice.id,
    sourceReviewed: true,
    sourceProfileIds: [f.profile.id, sibling.id],
    actions: [action(sibling.id, "Sibling task")],
  });
  expect(await confirmNotice(f.visitor, second)).toMatchObject({ ok: false });
  expect(
    await db.select().from(agendaTasks).where(eq(agendaTasks.noticeId, notice.id)),
  ).toHaveLength(1);
  await family.grantAccess(f.owner, { ...siblingGrant, action: "write" });
  expect(await confirmNotice(f.visitor, second)).toMatchObject({ ok: true });
  expect(
    await db.select().from(agendaTasks).where(eq(agendaTasks.noticeId, notice.id)),
  ).toHaveLength(2);
  if (!f.profile.familyProfileId) throw new Error("Activation missing");
  await db
    .delete(familyAccessGrants)
    .where(
      and(
        eq(familyAccessGrants.profileId, f.profile.familyProfileId),
        eq(familyAccessGrants.userId, f.owner),
        eq(familyAccessGrants.action, "read"),
      ),
    );
  expect(await getNoticeSource(f.actor, notice.id)).toBeNull();
});
it("rolls back the first insert when a later shared correction is refused", async () => {
  const f = await agendaFixture();
  const state = `state-${randomUUID()}`,
    city = randomUUID(),
    school = randomUUID();
  await db.insert(agendaStates).values({ uf: state, ibgeCode: randomUUID(), name: "Synthetic" });
  await db.insert(agendaCities).values({ ibgeCode: city, stateUf: state, name: "Synthetic" });
  await db
    .insert(agendaSchools)
    .values({ inepCode: school, cityIbgeCode: city, name: "Synthetic" });
  const [turma] = await db
    .insert(agendaTurmas)
    .values({
      schoolInepCode: school,
      code: randomUUID(),
      grade: "4ano",
      year: 2026,
      classLetter: "A",
      createdByUserId: f.visitor.userId,
    })
    .returning();
  if (!turma) throw new Error("Class missing");
  const [subject] = await db
    .insert(agendaSubjects)
    .values({ turmaId: turma.id, name: "Synthetic" })
    .returning();
  if (!subject) throw new Error("Subject missing");
  const previousAction = action(f.profile.id, "Received task");
  const [published] = await db
    .insert(agendaActivities)
    .values({
      familyGroupId: f.actor.familyGroupId,
      turmaId: turma.id,
      subjectId: subject.id,
      createdByUserId: f.visitor.userId,
      type: "task",
      title: previousAction.title,
      dueAt: "2026-11-12",
      visibility: "shared_with_turma",
    })
    .returning();
  if (!published) throw new Error("Publication missing");
  const [previous] = await db
    .insert(agendaTasks)
    .values({
      profileId: f.profile.id,
      createdByUserId: f.visitor.userId,
      sharedActivityId: published.id,
      type: "task",
      title: previousAction.title,
      dueAt: previousAction.dueAt,
      dateOrigin: "school",
      fingerprint: actionFingerprint(previousAction),
    })
    .returning();
  if (!previous) throw new Error("Task missing");
  const result = await confirmNotice(
    f.actor,
    confirmNoticeSchema.parse({
      noticeId: null,
      actions: [
        action(f.profile.id, "Must roll back"),
        action(f.profile.id, "Received task", "2026-11-14"),
      ],
      resolutions: [
        { index: 1, kind: "replace", actionId: previous.id, version: previous.version },
      ],
    }),
  );
  expect(result).toMatchObject({ ok: false, error: { code: "SHARE_NOT_YOURS" } });
  const rows = await db.select().from(agendaTasks).where(eq(agendaTasks.profileId, f.profile.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    id: previous.id,
    dueAt: "2026-11-12",
    version: previous.version,
  });
});

it("keeps a confirmed original private unless the author explicitly shares its complete child scope", async () => {
  const f = await agendaFixture(true);
  for (const permission of ["read", "write"] as const)
    await family.grantAccess(f.owner, { ...f.target, action: permission });
  const [notice] = await db
    .insert(agendaNotices)
    .values({
      familyGroupId: f.actor.familyGroupId,
      captureProfileId: f.profile.id,
      createdByUserId: f.owner,
      source: "other",
      text: "Synthetic private source",
      contentHash: randomUUID(),
      status: "ready",
    })
    .returning();
  if (!notice) throw new Error("Missing notice");
  const fields = {
    noticeId: notice.id,
    sourceProfileIds: [f.profile.id],
    actions: [action(f.profile.id, "Private homework")],
  };
  expect(confirmNoticeSchema.safeParse(fields).success).toBe(false);
  const input = confirmNoticeSchema.parse({ ...fields, sourceReviewed: true });
  value(await confirmNotice(f.actor, input));
  expect(await getNoticeSource(f.actor, notice.id)).not.toBeNull();
  expect(await getNoticeSource(f.visitor, notice.id)).toBeNull();
  value(await confirmNotice(f.actor, { ...input, shareOriginal: true }));
  expect(await getNoticeSource(f.visitor, notice.id)).not.toBeNull();
  // Applying an already shared original does not let another adult change its audience.
  value(await confirmNotice(f.visitor, input));
  expect(await getNoticeSource(f.visitor, notice.id)).not.toBeNull();
  value(await confirmNotice(f.actor, input));
  expect(await getNoticeSource(f.visitor, notice.id)).toBeNull();
});
