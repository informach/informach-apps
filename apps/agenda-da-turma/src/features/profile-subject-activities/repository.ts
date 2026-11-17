import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, asc, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivityRevisions,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaTasks,
} from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { FREE_ACTIVITY_LIMIT } from "@/features/activities/limits";
import { countPendingActivities } from "@/features/activities/pending-limit";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import {
  actionFingerprint,
  setNoticeActionStatusWithinTx,
} from "@/features/notices/write-repository";
import {
  assertTaskSchoolContexts,
  lockTaskSchoolContexts,
} from "@/features/turmas/transaction-repository";
import type {
  CreateProfileSubjectActivityInput,
  DeleteProfileSubjectActivityInput,
  SetProfileSubjectActivityStatusInput,
  UpdateProfileSubjectActivityInput,
} from "./schemas";
import type { ProfileSubjectActivity } from "./types";

function toActivity(row: typeof agendaTasks.$inferSelect): ProfileSubjectActivity {
  return {
    id: row.id,
    version: row.version,
    profileId: row.profileId,
    // A condição de leitura garante o vínculo; o tipo do schema é nullable
    // porque a mesma coluna serve às tarefas sem matéria.
    profileSubjectId: row.profileSubjectId ?? "",
    createdByUserId: row.createdByUserId,
    type: row.type,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function visibleProfiles(actor: AgendaAuthority) {
  return db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(agendaProfileCondition(actor));
}
const extraCondition = sql`${agendaTasks.profileSubjectId} IS NOT NULL`;
async function lockExtra(tx: FamilyTransaction, actor: AgendaAuthority, id: string) {
  const schoolLocks = await lockTaskSchoolContexts(tx, { taskIds: [id] });
  await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
  const [candidate] = await tx
    .select({ profileId: agendaTasks.profileId })
    .from(agendaTasks)
    .where(
      and(
        eq(agendaTasks.id, id),
        extraCondition,
        inArray(agendaTasks.profileId, visibleProfiles(actor)),
      ),
    );
  requireFamilyCondition(candidate);
  await lockAgendaUse(tx, actor, [candidate.profileId]);
  const [task] = await tx
    .select()
    .from(agendaTasks)
    .where(
      and(eq(agendaTasks.id, id), eq(agendaTasks.profileId, candidate.profileId), extraCondition),
    )
    .for("update");
  requireFamilyCondition(task);
  await assertTaskSchoolContexts(tx, schoolLocks, { taskIds: [id] });
  return { task, schoolLocks };
}
export async function findProfileSubjectActivityForUser(actor: AgendaAuthority, id: string) {
  const [task] = await db
    .select()
    .from(agendaTasks)
    .where(
      and(
        eq(agendaTasks.id, id),
        extraCondition,
        inArray(agendaTasks.profileId, visibleProfiles(actor)),
      ),
    );
  return task ? toActivity(task) : null;
}
export function insertProfileSubjectActivity(
  actor: AgendaAuthority,
  input: CreateProfileSubjectActivityInput,
) {
  return atomicAgendaResult(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const [subject] = await tx
      .select()
      .from(agendaProfileSubjects)
      .where(
        and(
          eq(agendaProfileSubjects.id, input.profileSubjectId),
          inArray(agendaProfileSubjects.profileId, visibleProfiles(actor)),
        ),
      );
    if (!subject) return err({ code: "PROFILE_SUBJECT_NOT_FOUND" } as const);
    const access = await lockAgendaUse(tx, actor, [subject.profileId]);
    const [currentSubject] = await tx
      .select()
      .from(agendaProfileSubjects)
      .where(eq(agendaProfileSubjects.id, subject.id));
    if (currentSubject?.status !== "active")
      return err({ code: "PROFILE_SUBJECT_NOT_FOUND" } as const);
    if (!access.enabled) {
      const current = await countPendingActivities(tx, actor);
      if (current >= FREE_ACTIVITY_LIMIT)
        return err({
          code: "ACTIVITY_LIMIT_REACHED",
          current,
          limit: FREE_ACTIVITY_LIMIT,
        } as const);
    }
    const [row] = await tx
      .insert(agendaTasks)
      .values({
        ...input,
        description: input.description ?? null,
        profileId: subject.profileId,
        createdByUserId: actor.userId,
        dateOrigin: "family",
        fingerprint: actionFingerprint(input),
      })
      .returning();
    requireFamilyCondition(row);
    return ok(toActivity(row));
  });
}
export function updateProfileSubjectActivityById(
  actor: AgendaAuthority,
  input: UpdateProfileSubjectActivityInput,
) {
  return atomicAgendaResult(async (tx) => {
    const { task: previous } = await lockExtra(tx, actor, input.id);
    if (previous.version !== input.version || previous.status === "canceled")
      return err({ code: "VERSION_CONFLICT" } as const);
    // A shared school fact must be edited through its complete form, which propagates corrections.
    if (previous.sharedActivityId) return err({ code: "SHARED_ACTIVITY" } as const);
    const [current] = await tx
      .update(agendaTasks)
      .set({
        type: input.type,
        title: input.title,
        description: input.description ?? null,
        dueAt: input.dueAt,
        dateOrigin: "family",
        fingerprint: actionFingerprint(input),
        version: previous.version + 1,
        updatedAt: new Date(),
      })
      .where(eq(agendaTasks.id, input.id))
      .returning();
    requireFamilyCondition(current);
    await tx.insert(agendaActivityRevisions).values({
      taskId: input.id,
      actorId: actor.userId,
      version: current.version,
      previous,
      current,
    });
    return ok(toActivity(current));
  });
}
export function deleteProfileSubjectActivityById(
  actor: AgendaAuthority,
  input: DeleteProfileSubjectActivityInput,
) {
  return atomicAgendaResult(async (tx) => {
    const { task } = await lockExtra(tx, actor, input.id);
    if (task.version !== input.version) return err({ code: "VERSION_CONFLICT" } as const);
    if (task.sharedActivityId) return err({ code: "SHARED_ACTIVITY" } as const);
    await tx.delete(agendaTasks).where(eq(agendaTasks.id, input.id));
    return ok(true as const);
  });
}
export function setProfileSubjectActivityStatus(
  actor: AgendaAuthority,
  input: SetProfileSubjectActivityStatusInput,
) {
  return atomicAgendaResult(async (tx) => {
    const { schoolLocks } = await lockExtra(tx, actor, input.id);
    const result = await setNoticeActionStatusWithinTx(tx, actor, input, schoolLocks);
    return result.ok
      ? ok({ id: input.id, status: input.status, version: result.value.version })
      : result;
  });
}
export async function listProfileSubjectActivitiesForSubject(
  actor: AgendaAuthority,
  profileSubjectId: string,
) {
  const rows = await db
    .select()
    .from(agendaTasks)
    .where(
      and(
        eq(agendaTasks.profileSubjectId, profileSubjectId),
        inArray(agendaTasks.profileId, visibleProfiles(actor)),
      ),
    )
    .orderBy(asc(agendaTasks.dueAt));
  return rows.map(toActivity);
}
