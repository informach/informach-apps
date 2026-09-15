import "server-only";

import { and, asc, db, eq, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { countPendingActivities, lockPendingLimit } from "@/features/activities/pending-limit";
import type { ActivityStatusValue, ActivityType } from "@/features/activities/types";
import { accessibleProfileCondition } from "@/features/family/access";
import { actionFingerprint } from "@/features/notices/write-repository";
import type { ProfileSubjectActivity } from "./types";

/**
 * A atividade extracurricular é uma tarefa como qualquer outra.
 *
 * Ela morava em `agenda.profile_subject_activities`, uma terceira tabela com o
 * seu próprio contrato — prazo obrigatório, sem hora, sem local, sem
 * responsável, sem histórico. Depois da convergência é uma linha de
 * `agenda.tasks` com `profile_subject_id` preenchido, e por isso ganhou de
 * graça tudo o que só a providência de recado tinha.
 *
 * Este repositório existe para as telas que ainda falam em "matéria
 * extracurricular" (a página da matéria e o feed .ics). Ele não conhece mais
 * nenhuma tabela própria.
 */
export type NewProfileSubjectActivityPayload = {
  profileId: string;
  profileSubjectId: string;
  createdByUserId: string;
  type: ActivityType;
  title: string;
  description: string | null;
  // "YYYY-MM-DD"
  dueAt: string;
};

export type UpdateProfileSubjectActivityPayload = {
  type: ActivityType;
  title: string;
  description: string | null;
  dueAt: string;
};

// Só as tarefas extracurriculares: `profile_subject_id` preenchido e sem
// recado de origem. A tarefa que veio de um recado E foi vinculada a uma
// matéria extracurricular continua sendo do recado — ela aparece na lista
// geral, não na página da matéria.
const extraCondition = sql`${agendaTasks.profileSubjectId} IS NOT NULL`;

function toTaskValues(payload: NewProfileSubjectActivityPayload) {
  return {
    profileId: payload.profileId,
    profileSubjectId: payload.profileSubjectId,
    createdByUserId: payload.createdByUserId,
    type: payload.type,
    title: payload.title,
    description: payload.description,
    dueAt: payload.dueAt,
    dateOrigin: "family" as const,
    fingerprint: actionFingerprint(payload),
  };
}

function toActivity(row: typeof agendaTasks.$inferSelect): ProfileSubjectActivity {
  return {
    id: row.id,
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

// Garante que o user tem acesso à criança dona da atividade. Usado pelo
// service antes de update/delete/setStatus.
export async function findProfileSubjectActivityForUser(
  userId: string,
  id: string,
): Promise<ProfileSubjectActivity | null> {
  const [row] = await db
    .select({ task: agendaTasks })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(accessibleProfileCondition(userId), eq(agendaTasks.id, id), extraCondition))
    .limit(1);
  return row ? toActivity(row.task) : null;
}

// Insere a atividade. Pré-condição (verificada pelo service):
//   - profileSubject pertence ao perfil
//   - perfil pertence ao user
export async function insertProfileSubjectActivity(
  payload: NewProfileSubjectActivityPayload,
): Promise<ProfileSubjectActivity> {
  const [row] = await db.insert(agendaTasks).values(toTaskValues(payload)).returning();
  if (!row) throw new Error("agenda.tasks: insert returned no row");
  return toActivity(row);
}

// Variante Free: mesmo advisory lock e cap (`FREE_ACTIVITY_LIMIT`) das demais
// origens. Free pode criar 20 atividades no total, misturadas como quiser.
// Race-safety: lock por user serializa inserts concorrentes nesta conta.
export type InsertProfileSubjectActivityWithinLimitResult =
  | { ok: true; activity: ProfileSubjectActivity }
  | { ok: false; current: number };

export async function insertProfileSubjectActivityWithinFreeLimit(
  payload: NewProfileSubjectActivityPayload,
  limit: number,
): Promise<InsertProfileSubjectActivityWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      // O teto é da família dona da criança, não de quem digita. Contar por
      // quem digita daria zero para um segundo adulto e o limite passaria
      // batido — e o lock seria outro, sem serializar com os demais writers.
      const [owner] = await tx
        .select({ userId: agendaStudentProfiles.userId })
        .from(agendaStudentProfiles)
        .where(eq(agendaStudentProfiles.id, payload.profileId));
      if (!owner) throw new Error("agenda.tasks: profile not found for the free limit");
      await lockPendingLimit(tx, owner.userId);

      const current = await countPendingActivities(tx, owner.userId);
      if (current >= limit) {
        return { ok: false as const, current };
      }
      const [row] = await tx.insert(agendaTasks).values(toTaskValues(payload)).returning();
      if (!row) throw new Error("agenda.tasks: insert returned no row");
      return { ok: true as const, activity: toActivity(row) };
    },
    { isolationLevel: "read committed" },
  );
}

export async function updateProfileSubjectActivityById(
  id: string,
  payload: UpdateProfileSubjectActivityPayload,
): Promise<ProfileSubjectActivity | null> {
  const [row] = await db
    .update(agendaTasks)
    .set({
      type: payload.type,
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt,
      dateOrigin: "family",
      fingerprint: actionFingerprint(payload),
      version: sql`${agendaTasks.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(agendaTasks.id, id), extraCondition))
    .returning();
  return row ? toActivity(row) : null;
}

export async function deleteProfileSubjectActivityById(id: string): Promise<boolean> {
  const removed = await db
    .delete(agendaTasks)
    .where(and(eq(agendaTasks.id, id), extraCondition))
    .returning({ id: agendaTasks.id });
  return removed.length > 0;
}

export async function setProfileSubjectActivityStatus(
  id: string,
  status: ActivityStatusValue,
  actorId: string,
  freeLimit: number | null,
): Promise<boolean | { limitReached: number }> {
  const [candidate] = await db
    .select({ ownerId: agendaStudentProfiles.userId })
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .where(and(eq(agendaTasks.id, id), extraCondition, accessibleProfileCondition(actorId)));
  if (!candidate) return false;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${candidate.ownerId}`}))`,
    );
    await lockPendingLimit(tx, candidate.ownerId);
    const [current] = await tx
      .select({ task: agendaTasks })
      .from(agendaTasks)
      .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
      .where(and(eq(agendaTasks.id, id), extraCondition, accessibleProfileCondition(actorId)))
      .for("update");
    if (!current) return false;
    if (freeLimit !== null && status === "pending" && current.task.status === "done") {
      const total = await countPendingActivities(tx, candidate.ownerId);
      if (total >= freeLimit) return { limitReached: total };
    }
    await tx
      .update(agendaTasks)
      .set({
        status,
        completedAt: status === "done" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(agendaTasks.id, id));
    return true;
  });
}

// Atividades de uma matéria extracurricular, para a página da matéria.
export async function listProfileSubjectActivitiesForSubject(
  profileSubjectId: string,
): Promise<ProfileSubjectActivity[]> {
  const rows = await db
    .select()
    .from(agendaTasks)
    .where(eq(agendaTasks.profileSubjectId, profileSubjectId))
    .orderBy(asc(agendaTasks.dueAt));
  return rows.map(toActivity);
}
