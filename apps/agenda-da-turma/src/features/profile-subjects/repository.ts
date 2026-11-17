import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, asc, count, db, eq, inArray, ne } from "@informach/db";
import {
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
} from "@informach/db/schema";
import { type FamilyTransaction, requireFamilyCondition } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import type { AgendaAuthority } from "@/features/family/authority";
import { agendaProfileCondition } from "@/features/family/scope";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import { pickAvailableColorIndex } from "@/features/subjects/utils";
import { activeMembershipCondition } from "@/features/turmas/access";
import { FREE_PROFILE_SUBJECT_LIMIT, PRO_PROFILE_SUBJECT_LIMIT } from "./limits";
import type {
  CreateProfileSubjectInput,
  SetProfileSubjectStatusInput,
  UpdateProfileSubjectInput,
} from "./schemas";
import type { ProfileSubject } from "./types";

function visibleProfiles(actor: AgendaAuthority) {
  return db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(agendaProfileCondition(actor));
}
function subjectScope(actor: AgendaAuthority) {
  return inArray(agendaProfileSubjects.profileId, visibleProfiles(actor));
}

async function colorsInTransaction(tx: FamilyTransaction, profileId: string) {
  const [profile] = await tx
    .select({ turmaId: agendaStudentProfiles.activeTurmaId })
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.id, profileId), activeMembershipCondition()));
  const extras = await tx
    .select({ colorIndex: agendaProfileSubjects.colorIndex })
    .from(agendaProfileSubjects)
    .where(
      and(
        eq(agendaProfileSubjects.profileId, profileId),
        eq(agendaProfileSubjects.status, "active"),
      ),
    );
  const school = profile?.turmaId
    ? await tx
        .select({ colorIndex: agendaSubjects.colorIndex })
        .from(agendaSubjects)
        .where(eq(agendaSubjects.turmaId, profile.turmaId))
    : [];
  return [...extras, ...school].map((row) => row.colorIndex);
}
export function insertProfileSubjectWithinLimit(
  actor: AgendaAuthority,
  input: CreateProfileSubjectInput,
) {
  return atomicAgendaResult(async (tx) => {
    const access = await lockAgendaUse(tx, actor, [input.profileId]);
    const limit = access.enabled ? PRO_PROFILE_SUBJECT_LIMIT : FREE_PROFILE_SUBJECT_LIMIT;
    const [total] = await tx
      .select({ total: count() })
      .from(agendaProfileSubjects)
      .where(eq(agendaProfileSubjects.profileId, input.profileId));
    const current = Number(total?.total ?? 0);
    if (current >= limit)
      return err({ code: "PLAN_LIMIT_REACHED", current, limit, isPro: access.enabled } as const);
    const colorIndex = pickAvailableColorIndex(
      input.name,
      await colorsInTransaction(tx, input.profileId),
    );
    const [subject] = await tx
      .insert(agendaProfileSubjects)
      .values({
        profileId: input.profileId,
        name: input.name,
        classDays: input.classDays,
        colorIndex,
      })
      .onConflictDoNothing({
        target: [agendaProfileSubjects.profileId, agendaProfileSubjects.name],
      })
      .returning();
    return subject ? ok(subject) : err({ code: "DUPLICATE_NAME" } as const);
  });
}
async function lockSubject(tx: FamilyTransaction, actor: AgendaAuthority, id: string) {
  await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
  const [observed] = await tx
    .select()
    .from(agendaProfileSubjects)
    .where(and(eq(agendaProfileSubjects.id, id), subjectScope(actor)));
  requireFamilyCondition(observed);
  await lockAgendaUse(tx, actor, [observed.profileId]);
  const [current] = await tx
    .select()
    .from(agendaProfileSubjects)
    .where(
      and(
        eq(agendaProfileSubjects.id, id),
        eq(agendaProfileSubjects.profileId, observed.profileId),
      ),
    )
    .for("update");
  requireFamilyCondition(current);
  return current;
}
export function updateProfileSubjectById(actor: AgendaAuthority, input: UpdateProfileSubjectInput) {
  return atomicAgendaResult(async (tx) => {
    const current = await lockSubject(tx, actor, input.id);
    const [duplicate] = await tx
      .select({ id: agendaProfileSubjects.id })
      .from(agendaProfileSubjects)
      .where(
        and(
          eq(agendaProfileSubjects.profileId, current.profileId),
          eq(agendaProfileSubjects.name, input.name),
          ne(agendaProfileSubjects.id, input.id),
        ),
      );
    if (duplicate) return err({ code: "DUPLICATE_NAME" } as const);
    const [subject] = await tx
      .update(agendaProfileSubjects)
      .set({ name: input.name, classDays: input.classDays, updatedAt: new Date() })
      .where(eq(agendaProfileSubjects.id, input.id))
      .returning();
    requireFamilyCondition(subject);
    return ok(subject);
  });
}
export function deleteProfileSubjectById(actor: AgendaAuthority, id: string) {
  return db.transaction(async (tx) => {
    await lockSubject(tx, actor, id);
    await tx.delete(agendaProfileSubjects).where(eq(agendaProfileSubjects.id, id));
    return ok(true as const);
  });
}
export function setProfileSubjectStatus(
  actor: AgendaAuthority,
  input: SetProfileSubjectStatusInput,
  pausedAt: string | null,
) {
  return db.transaction(async (tx) => {
    const current = await lockSubject(tx, actor, input.id);
    if (current.status === input.status)
      return ok({ subject: current, previousStatus: current.status });
    const [subject] = await tx
      .update(agendaProfileSubjects)
      .set({ status: input.status, pausedAt, updatedAt: new Date() })
      .where(eq(agendaProfileSubjects.id, input.id))
      .returning();
    requireFamilyCondition(subject);
    return ok({ subject, previousStatus: current.status });
  });
}
export async function findProfileSubjectByIdForUser(
  actor: AgendaAuthority,
  id: string,
): Promise<ProfileSubject | null> {
  const [row] = await db
    .select()
    .from(agendaProfileSubjects)
    .where(and(eq(agendaProfileSubjects.id, id), subjectScope(actor)));
  return row ?? null;
}
export function listProfileSubjectsForProfile(actor: AgendaAuthority, profileId: string) {
  return db
    .select()
    .from(agendaProfileSubjects)
    .where(and(eq(agendaProfileSubjects.profileId, profileId), subjectScope(actor)))
    .orderBy(asc(agendaProfileSubjects.status), asc(agendaProfileSubjects.name));
}
export function listActiveProfileSubjectsForProfile(actor: AgendaAuthority, profileId: string) {
  return listActiveProfileSubjectsForProfiles(actor, [profileId]);
}
export function listActiveProfileSubjectsForProfiles(actor: AgendaAuthority, profileIds: string[]) {
  if (!profileIds.length) return Promise.resolve([]);
  return db
    .select()
    .from(agendaProfileSubjects)
    .where(
      and(
        inArray(agendaProfileSubjects.profileId, profileIds),
        subjectScope(actor),
        eq(agendaProfileSubjects.status, "active"),
      ),
    )
    .orderBy(asc(agendaProfileSubjects.name));
}
export async function loadActivityCountsForProfileSubjects(
  actor: AgendaAuthority,
  ids: readonly string[],
) {
  const map = new Map<string, { pending: number; done: number }>();
  if (!ids.length) return map;
  const rows = await db
    .select({
      profileSubjectId: agendaTasks.profileSubjectId,
      status: agendaTasks.status,
      total: count(),
    })
    .from(agendaTasks)
    .where(
      and(
        inArray(agendaTasks.profileSubjectId, ids),
        inArray(agendaTasks.profileId, visibleProfiles(actor)),
      ),
    )
    .groupBy(agendaTasks.profileSubjectId, agendaTasks.status);
  for (const row of rows) {
    if (!row.profileSubjectId) continue;
    const value = map.get(row.profileSubjectId) ?? { pending: 0, done: 0 };
    if (row.status === "pending") value.pending = Number(row.total);
    if (row.status === "done") value.done = Number(row.total);
    map.set(row.profileSubjectId, value);
  }
  return map;
}
