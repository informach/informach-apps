import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaStudentProfiles,
  agendaSubjectKits,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  familyPeople,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { expect, it } from "vitest";
import { lockAgendaProfileSchoolContexts } from "@/features/account/school-closure-repository";
import { deleteStudentProfileForUser } from "@/features/students/repository";
import { agendaFixture, schoolFixture } from "./compasso-fixture";

it("locks every historical school dependency beyond a UI page, then removes only the child's native history", async () => {
  const f = await agendaFixture(true),
    school = await schoolFixture();
  const [profile] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.id, f.profile.id));
  if (!profile) throw new Error("Missing native profile");
  const classes = await db
    .insert(agendaTurmas)
    .values(
      Array.from({ length: 105 }, (_, index) => ({
        code: randomUUID(),
        schoolInepCode: school,
        grade: "4ano" as const,
        year: 2026,
        classLetter: `C${index}`,
        createdByUserId: f.owner,
      })),
    )
    .returning();
  const [oldTask, oldKit] = classes;
  if (!oldTask || !oldKit) throw new Error("Missing historical classrooms");
  await db.insert(agendaTurmaMembers).values(
    classes.slice(2).map((row) => ({
      turmaId: row.id,
      studentProfileId: profile.id,
      enrolledByUserId: f.owner,
    })),
  );
  const subjects = await db
    .insert(agendaSubjects)
    .values([oldTask, oldKit].map((row) => ({ turmaId: row.id, name: "PRIVATE_SUBJECT" })))
    .returning();
  const taskSubject = subjects.find((row) => row.turmaId === oldTask.id),
    kitSubject = subjects.find((row) => row.turmaId === oldKit.id);
  if (!taskSubject || !kitSubject) throw new Error("Missing subjects");
  await db.insert(agendaTasks).values({
    profileId: profile.id,
    subjectId: taskSubject.id,
    type: "task",
    title: "PRIVATE_TASK",
    fingerprint: randomUUID(),
  });
  await db
    .insert(agendaSubjectKits)
    .values({ profileId: profile.id, subjectId: kitSubject.id, items: ["PRIVATE_KIT"] });
  const ids = classes.map((row) => row.id);
  await db.transaction(async (tx) => {
    const verify = await lockAgendaProfileSchoolContexts(tx, [profile.familyProfileId]);
    await lockFamilyMembership(tx, f.owner, f.actor.familyGroupId);
    await verify();
    expect(
      await db.transaction((other) =>
        other
          .select({ id: agendaTurmas.id })
          .from(agendaTurmas)
          .where(inArray(agendaTurmas.id, ids))
          .for("update", { skipLocked: true }),
      ),
    ).toEqual([]);
  });
  expect(await deleteStudentProfileForUser(f.actor, profile.id)).toBe(true);
  expect(await db.select().from(agendaTasks).where(eq(agendaTasks.profileId, profile.id))).toEqual(
    [],
  );
  expect(
    await db.select().from(agendaSubjectKits).where(eq(agendaSubjectKits.profileId, profile.id)),
  ).toEqual([]);
  expect(
    await db
      .select()
      .from(agendaTurmaMembers)
      .where(eq(agendaTurmaMembers.studentProfileId, profile.id)),
  ).toEqual([]);
  expect(await db.select().from(agendaTurmas).where(inArray(agendaTurmas.id, ids))).toHaveLength(
    105,
  );
  expect(
    await db.select().from(familyPeople).where(eq(familyPeople.id, f.target.personId)),
  ).toHaveLength(1);
});

it("rejects a class dependency added after observation instead of reversing the lock order", async () => {
  const f = await agendaFixture(true),
    school = await schoolFixture();
  const [profile] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.id, f.profile.id));
  const [classroom] = await db
    .insert(agendaTurmas)
    .values({
      code: randomUUID(),
      schoolInepCode: school,
      grade: "4ano",
      year: 2026,
      classLetter: "Late",
      createdByUserId: f.owner,
    })
    .returning();
  if (!profile || !classroom) throw new Error("Missing school fixture");
  await expect(
    db.transaction(async (tx) => {
      const verify = await lockAgendaProfileSchoolContexts(tx, [profile.familyProfileId]);
      await tx
        .insert(agendaTurmaMembers)
        .values({ turmaId: classroom.id, studentProfileId: profile.id, enrolledByUserId: f.owner });
      await lockFamilyMembership(tx, f.owner, f.actor.familyGroupId);
      await verify();
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  expect(
    await db
      .select()
      .from(agendaTurmaMembers)
      .where(eq(agendaTurmaMembers.studentProfileId, profile.id)),
  ).toEqual([]);
});
