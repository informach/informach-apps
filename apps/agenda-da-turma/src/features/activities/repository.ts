import "server-only";

import { and, asc, type Database, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaActivityStatuses,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import type {
  Activity,
  ActivityListItem,
  ActivityStatusValue,
  ActivityType,
  ActivityVisibility,
  PendingSharedActivity,
  TurmaWithSubjectsForForm,
} from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type NewActivityPayload = {
  turmaId: string;
  subjectId: string;
  createdByUserId: string;
  type: ActivityType;
  visibility: ActivityVisibility;
  title: string;
  description: string | null;
  // "YYYY-MM-DD" — coluna `date` no Postgres
  dueAt: string;
};

export type UpdateActivityPayload = {
  type: ActivityType;
  title: string;
  description: string | null;
  dueAt: string;
};

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
export async function subjectBelongsToTurma(subjectId: string, turmaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaSubjects.id })
    .from(agendaSubjects)
    .where(and(eq(agendaSubjects.id, subjectId), eq(agendaSubjects.turmaId, turmaId)))
    .limit(1);
  return row !== undefined;
}

// Verifica que o perfil pertence ao user. Usado pra autorizar setActivityStatus.
export async function profileBelongsToUser(profileId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(and(eq(agendaStudentProfiles.id, profileId), eq(agendaStudentProfiles.userId, userId)))
    .limit(1);
  return row !== undefined;
}

// Perfis do user com active_turma_id = turmaId. Usados pra:
// - seed inicial de status no create
// - gerar status rows quando user aceita compartilhada
// - autorizar criação (≥1 perfil ativo na turma)
export async function listActiveProfilesOfUserInTurma(
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
      ),
    );
}

// User pode operar na turma se for o creator OU se tiver ≥1 perfil (ativo ou
// não) como membro. Usado no membership check de criação.
export async function userIsTurmaCreatorOrMember(
  userId: string,
  turmaId: string,
): Promise<boolean> {
  const [creator] = await db
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(and(eq(agendaTurmas.id, turmaId), eq(agendaTurmas.createdByUserId, userId)))
    .limit(1);
  if (creator) return true;

  const [member] = await db
    .select({ id: agendaTurmaMembers.id })
    .from(agendaTurmaMembers)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
    )
    .where(and(eq(agendaTurmaMembers.turmaId, turmaId), eq(agendaStudentProfiles.userId, userId)))
    .limit(1);
  return member !== undefined;
}

// Existe alguma row em activity_acceptances com accepted=true? Bloqueia
// edit/delete pelo criador quando alguém da turma já aceitou.
export async function hasOtherAcceptances(activityId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: agendaActivityAcceptances.id })
    .from(agendaActivityAcceptances)
    .where(
      and(
        eq(agendaActivityAcceptances.activityId, activityId),
        eq(agendaActivityAcceptances.accepted, true),
      ),
    )
    .limit(1);
  return row !== undefined;
}

// Cria a atividade + 1 status row pra cada perfil ativo do creator na turma.
// Quando o creator não tem perfil ativo na turma (só é creator da turma sem
// vincular nenhum filho ainda), insere a atividade sem statuses. Outros
// users ainda podem aceitar e gerar suas próprias status rows.
export async function insertActivityWithStatuses(payload: NewActivityPayload): Promise<Activity> {
  return db.transaction(async (tx) => {
    const [activity] = await tx.insert(agendaActivities).values(payload).returning();
    if (!activity) {
      throw new Error("agenda.activities: insert returned no row");
    }
    const profileIds = (
      await listActiveProfilesOfUserInTurma(tx, payload.createdByUserId, payload.turmaId)
    ).map((p) => p.id);
    if (profileIds.length > 0) {
      await tx.insert(agendaActivityStatuses).values(
        profileIds.map((profileId) => ({
          activityId: activity.id,
          studentProfileId: profileId,
        })),
      );
    }
    return activity;
  });
}

export async function updateActivityById(
  id: string,
  payload: UpdateActivityPayload,
): Promise<Activity | null> {
  const [row] = await db
    .update(agendaActivities)
    .set({
      type: payload.type,
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt,
      updatedAt: new Date(),
    })
    .where(eq(agendaActivities.id, id))
    .returning();
  return row ?? null;
}

export async function deleteActivityById(id: string): Promise<boolean> {
  const removed = await db
    .delete(agendaActivities)
    .where(eq(agendaActivities.id, id))
    .returning({ id: agendaActivities.id });
  return removed.length > 0;
}

export async function findActivityStatusForProfile(
  activityId: string,
  profileId: string,
): Promise<{ id: string; status: ActivityStatusValue } | null> {
  const [row] = await db
    .select({ id: agendaActivityStatuses.id, status: agendaActivityStatuses.status })
    .from(agendaActivityStatuses)
    .where(
      and(
        eq(agendaActivityStatuses.activityId, activityId),
        eq(agendaActivityStatuses.studentProfileId, profileId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateActivityStatusValue(
  statusId: string,
  status: ActivityStatusValue,
): Promise<boolean> {
  const updated = await db
    .update(agendaActivityStatuses)
    .set({ status, updatedAt: new Date() })
    .where(eq(agendaActivityStatuses.id, statusId))
    .returning({ id: agendaActivityStatuses.id });
  return updated.length > 0;
}

// Upsert da resposta + (quando accepted=true) seed de status rows pros perfis
// ativos do user na turma. Idempotente: ON CONFLICT DO NOTHING nos statuses
// e DO UPDATE na acceptance pra permitir mudar de mente (aceitar depois de
// rejeitar, ou vice-versa).
export async function upsertAcceptanceAndStatuses(
  activityId: string,
  userId: string,
  accepted: boolean,
  turmaId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .insert(agendaActivityAcceptances)
      .values({ activityId, userId, accepted })
      .onConflictDoUpdate({
        target: [agendaActivityAcceptances.activityId, agendaActivityAcceptances.userId],
        set: { accepted, respondedAt: new Date() },
      });
    if (!accepted) return;
    const profiles = await listActiveProfilesOfUserInTurma(tx, userId, turmaId);
    if (profiles.length === 0) return;
    await tx
      .insert(agendaActivityStatuses)
      .values(
        profiles.map((p) => ({
          activityId,
          studentProfileId: p.id,
        })),
      )
      .onConflictDoNothing({
        target: [agendaActivityStatuses.activityId, agendaActivityStatuses.studentProfileId],
      });
  });
}

// Lista pra `/atividades`. Uma row por (atividade × perfil do user). Filtra
// por perfil opcionalmente. Inclui `hasOtherAcceptances` via subquery pra
// guiar UI de edit/delete.
export async function listActivitiesForUser(
  userId: string,
  profileFilter: string | null,
): Promise<ActivityListItem[]> {
  const hasOtherAcceptancesExpr = sql<boolean>`EXISTS (
    SELECT 1 FROM ${agendaActivityAcceptances} aa
    WHERE aa.activity_id = ${agendaActivities.id} AND aa.accepted = true
  )`;

  const whereExpr = profileFilter
    ? and(eq(agendaStudentProfiles.userId, userId), eq(agendaStudentProfiles.id, profileFilter))
    : eq(agendaStudentProfiles.userId, userId);

  const rows = await db
    .select({
      activityId: agendaActivities.id,
      statusId: agendaActivityStatuses.id,
      status: agendaActivityStatuses.status,
      studentProfileId: agendaStudentProfiles.id,
      studentProfileName: agendaStudentProfiles.name,
      turmaId: agendaActivities.turmaId,
      subjectId: agendaActivities.subjectId,
      subjectName: agendaSubjects.name,
      subjectColorIndex: agendaSubjects.colorIndex,
      schoolName: agendaSchools.name,
      grade: agendaTurmas.grade,
      classLetter: agendaTurmas.classLetter,
      year: agendaTurmas.year,
      type: agendaActivities.type,
      visibility: agendaActivities.visibility,
      title: agendaActivities.title,
      description: agendaActivities.description,
      dueAt: agendaActivities.dueAt,
      createdByUserId: agendaActivities.createdByUserId,
      hasOtherAcceptances: hasOtherAcceptancesExpr,
    })
    .from(agendaActivityStatuses)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
    )
    .innerJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaActivities.subjectId))
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaActivities.turmaId))
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .where(whereExpr)
    .orderBy(asc(agendaActivities.dueAt), asc(agendaActivities.createdAt));

  return rows;
}

// Widget de aceite no dashboard (Pro). Atividades compartilhadas:
//   - criadas por outro user
//   - user tem ≥1 perfil ativo na mesma turma
//   - user ainda não respondeu (aceitar nem rejeitar)
export async function listPendingSharedActivitiesForUser(
  userId: string,
): Promise<PendingSharedActivity[]> {
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
        sql`${agendaActivities.createdByUserId} <> ${userId}`,
        sql`EXISTS (
          SELECT 1 FROM ${agendaStudentProfiles} sp
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

// Turmas onde o user tem ≥1 perfil ativo + matérias delas. Alimenta o form
// de nova atividade. Sem perfis ativos numa turma → user não pode criar
// atividade lá (serviço também valida).
export async function listTurmasWithSubjectsForUserForm(
  userId: string,
): Promise<TurmaWithSubjectsForForm[]> {
  const turmas = await db
    .selectDistinct({
      turmaId: agendaTurmas.id,
      schoolName: agendaSchools.name,
      grade: agendaTurmas.grade,
      classLetter: agendaTurmas.classLetter,
      year: agendaTurmas.year,
    })
    .from(agendaStudentProfiles)
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaStudentProfiles.activeTurmaId))
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .where(eq(agendaStudentProfiles.userId, userId))
    .orderBy(asc(agendaSchools.name));

  if (turmas.length === 0) return [];

  const turmaIds = turmas.map((t) => t.turmaId);
  const subjects = await db
    .select({
      turmaId: agendaSubjects.turmaId,
      id: agendaSubjects.id,
      name: agendaSubjects.name,
      colorIndex: agendaSubjects.colorIndex,
    })
    .from(agendaSubjects)
    .where(inArray(agendaSubjects.turmaId, turmaIds))
    .orderBy(asc(agendaSubjects.name));

  const subjectsByTurma = new Map<string, TurmaWithSubjectsForForm["subjects"]>();
  for (const s of subjects) {
    const list = subjectsByTurma.get(s.turmaId) ?? [];
    list.push({ id: s.id, name: s.name, colorIndex: s.colorIndex });
    subjectsByTurma.set(s.turmaId, list);
  }

  return turmas.map((t) => ({
    turmaId: t.turmaId,
    schoolName: t.schoolName,
    grade: t.grade,
    classLetter: t.classLetter,
    year: t.year,
    subjects: subjectsByTurma.get(t.turmaId) ?? [],
  }));
}
