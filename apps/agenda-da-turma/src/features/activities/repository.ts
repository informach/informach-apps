import "server-only";

import { and, asc, type Database, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { actionFingerprint } from "@/features/notices/write-repository";
import { activeMembershipCondition } from "@/features/turmas/access";
import { todayLocalIso } from "../dashboard/date";
import type { Activity, PendingSharedActivity } from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function findActivityById(id: string): Promise<Activity | null> {
  const [row] = await db
    .select()
    .from(agendaActivities)
    .where(eq(agendaActivities.id, id))
    .limit(1);
  return row ?? null;
}

// Confirma que a matéria pertence à turma. Pequena guarda contra payload
// adulterado — o form sempre escolhe matéria filtrada por turma, mas o
// service nunca confia.
async function listActiveProfilesOfUserInTurma(
  client: Database | Tx,
  userId: string,
  turmaId: string,
): Promise<Array<{ id: string }>> {
  return client
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(
      and(
        eq(agendaStudentProfiles.userId, userId),
        eq(agendaStudentProfiles.activeTurmaId, turmaId),
        activeMembershipCondition(),
      ),
    );
}

export async function userHasActiveProfileInTurma(
  userId: string,
  turmaId: string,
): Promise<boolean> {
  const [profile] = await listActiveProfilesOfUserInTurma(db, userId, turmaId);
  return profile !== undefined;
}

// Existe aceite de outra família? A UI usa para explicar a revisão e o
// cancelamento preservado, sem bloquear correções pelo criador.
/**
 * A tarefa que executa um fato publicado, para uma criança.
 *
 * Os campos que a turma define (tipo, matéria, título, prazo) vêm da
 * atividade; os que são da família (hora, local, responsável, lembrete)
 * nascem vazios e passam a ser editáveis — antes não existiam para a
 * atividade escolar.
 */
function taskFromActivity(activity: Activity, profileId: string) {
  return {
    sharedActivityId: activity.id,
    profileId,
    createdByUserId: activity.createdByUserId,
    type: activity.type,
    subjectId: activity.subjectId,
    title: activity.title,
    description: activity.description,
    dueAt: activity.dueAt,
    dateOrigin: "school" as const,
    fingerprint: actionFingerprint(activity),
  };
}

// Upsert da resposta + (quando accepted=true) uma tarefa pra cada criança
// ativa do user na turma. Idempotente: ON CONFLICT DO NOTHING nas tarefas
// e DO UPDATE na acceptance pra permitir mudar de mente (aceitar depois de
// rejeitar, ou vice-versa).
export async function upsertAcceptanceAndTasks(
  activityId: string,
  userId: string,
  accepted: boolean,
  turmaId: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [group] = await tx
      .select({ id: agendaTurmas.id })
      .from(agendaTurmas)
      .where(eq(agendaTurmas.id, turmaId))
      .for("update");
    if (!group) return false;
    const [activity] = await tx
      .select()
      .from(agendaActivities)
      .where(eq(agendaActivities.id, activityId))
      .for("update");
    if (
      !activity ||
      activity.canceledAt ||
      activity.visibility !== "shared_with_turma" ||
      activity.turmaId !== turmaId ||
      activity.dueAt < todayLocalIso()
    )
      return false;
    const profiles = await listActiveProfilesOfUserInTurma(tx, userId, turmaId);
    if (!profiles.length) return false;
    await tx
      .insert(agendaActivityAcceptances)
      .values({ activityId, userId, accepted })
      .onConflictDoUpdate({
        target: [agendaActivityAcceptances.activityId, agendaActivityAcceptances.userId],
        set: { accepted, respondedAt: new Date() },
      });
    if (!accepted) return true;
    await tx
      .insert(agendaTasks)
      .values(profiles.map((p) => taskFromActivity(activity, p.id)))
      .onConflictDoNothing({
        target: [agendaTasks.sharedActivityId, agendaTasks.profileId],
        where: sql`${agendaTasks.sharedActivityId} IS NOT NULL`,
      });
    return true;
  });
}

// Widget de aceite no dashboard (Pro). Atividades compartilhadas:
//   - criadas por outro user
//   - user tem ≥1 perfil ativo na mesma turma
//   - user ainda não respondeu (aceitar nem rejeitar)
//   - prazo ainda não passou (dueAt >= hoje em São Paulo) — sem isso o widget
//     pareceria fantasma após entrar numa turma com histórico longo (mostraria
//     dezenas de atividades vencidas que o user não tem como cumprir).
export async function listPendingSharedActivitiesForUser(
  userId: string,
): Promise<PendingSharedActivity[]> {
  const today = todayLocalIso();
  return db
    .select({
      activityId: agendaActivities.id,
      turmaId: agendaActivities.turmaId,
      type: agendaActivities.type,
      title: agendaActivities.title,
      description: agendaActivities.description,
      dueAt: agendaActivities.dueAt,
      subjectName: agendaSubjects.name,
      subjectColorIndex: agendaSubjects.colorIndex,
      schoolName: agendaSchools.name,
      grade: agendaTurmas.grade,
      classLetter: agendaTurmas.classLetter,
      year: agendaTurmas.year,
      createdByUserId: agendaActivities.createdByUserId,
      createdByUserName: users.name,
    })
    .from(agendaActivities)
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaActivities.subjectId))
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaActivities.turmaId))
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .innerJoin(users, eq(users.id, agendaActivities.createdByUserId))
    .where(
      and(
        eq(agendaActivities.visibility, "shared_with_turma"),
        sql`${agendaActivities.canceledAt} IS NULL`,
        sql`${agendaActivities.createdByUserId} <> ${userId}`,
        sql`${agendaActivities.dueAt} >= ${today}`,
        sql`EXISTS (
          SELECT 1 FROM ${agendaStudentProfiles} sp
          INNER JOIN ${agendaTurmaMembers} membership ON membership.student_profile_id = sp.id
            AND membership.turma_id = sp.active_turma_id
          WHERE sp.user_id = ${userId} AND sp.active_turma_id = ${agendaActivities.turmaId}
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM ${agendaActivityAcceptances} aa
          WHERE aa.activity_id = ${agendaActivities.id} AND aa.user_id = ${userId}
        )`,
      ),
    )
    .orderBy(asc(agendaActivities.dueAt), asc(agendaActivities.createdAt));
}
