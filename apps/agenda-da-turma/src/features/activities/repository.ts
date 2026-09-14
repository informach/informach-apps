import "server-only";

import { and, asc, type Database, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaActivityRevisions,
  agendaActivityStatuses,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { loadSlotsForSubjects } from "@/features/subjects/repository";
import { activeMembershipCondition } from "@/features/turmas/access";
import { todayLocalIso } from "../dashboard/date";
import { countPendingActivities, lockPendingLimit } from "./pending-limit";
import type {
  Activity,
  ActivityStatusValue,
  ActivityType,
  ActivityVisibility,
  PendingSharedActivity,
  TurmaWithSubjectsForForm,
} from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

// Existing recipient state proves prior use, even after an acceptance is
// reversed. Corrections/deletions must preserve that family's history.
// Shared by list, dashboard and calendar queries.
export const hasOtherAcceptancesExpr = sql<boolean>`EXISTS (
  SELECT 1 FROM ${agendaActivityStatuses} recipient_status
  INNER JOIN ${agendaStudentProfiles} recipient_profile ON recipient_profile.id = recipient_status.student_profile_id
  WHERE recipient_status.activity_id = ${agendaActivities.id}
    AND recipient_profile.user_id IS DISTINCT FROM ${agendaActivities.createdByUserId}
)`;

// SELECT canônico que produz `ActivityListItem` (uma row por atividade × perfil
// do user). Compartilhado entre /atividades, dashboard e calendário pra que
// ActivityCard e demais consumidores recebam exatamente o mesmo shape.
export const activityListSelect = {
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
  version: agendaActivities.version,
  canceledAt: agendaActivities.canceledAt,
  activityCreatedAt: agendaActivities.createdAt,
  activityUpdatedAt: agendaActivities.updatedAt,
  createdByUserId: agendaActivities.createdByUserId,
  hasOtherAcceptances: hasOtherAcceptancesExpr,
} as const;

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
  subjectId: string;
  type: ActivityType;
  visibility: ActivityVisibility;
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
    .where(and(eq(agendaStudentProfiles.id, profileId), accessibleProfileCondition(userId)))
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
export async function hasOtherAcceptances(activityId: string): Promise<boolean> {
  return hasRecipientHistory(db, activityId);
}

async function hasRecipientHistory(client: Database | Tx, activityId: string) {
  const [row] = await client
    .select({ id: agendaActivities.id })
    .from(agendaActivities)
    .where(and(eq(agendaActivities.id, activityId), hasOtherAcceptancesExpr))
    .limit(1);
  return Boolean(row);
}

// Cria a atividade + 1 status row pra cada perfil ativo do creator na turma.
// O service autoriza criação só quando há pelo menos um perfil ativo, para
// evitar atividades sem status e invisíveis para quem criou.
export async function insertActivityWithStatuses(payload: NewActivityPayload): Promise<Activity> {
  return db.transaction((tx) => insertActivityWithStatusesInTx(tx, payload));
}

// Variante Free: dentro de uma transação com advisory lock por usuário,
// conta pendências próprias de todas as origens e bloqueia ao atingir o limite.
// Espelha `insertRecipeWithinFreeLimit` do cozya. Race-safety: o lock
// serializa apenas operações deste mesmo userId, sem afetar concorrência
// global. Concluir libera vaga sem apagar o histórico.
export type InsertActivityWithinLimitResult =
  | { ok: true; activity: Activity }
  | { ok: false; current: number };

export async function insertActivityWithStatusesWithinFreeLimit(
  payload: NewActivityPayload,
  limit: number,
): Promise<InsertActivityWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      await lockPendingLimit(tx, payload.createdByUserId);

      const current = await countPendingActivities(tx, payload.createdByUserId);
      if (current >= limit) {
        return { ok: false as const, current };
      }

      const activity = await insertActivityWithStatusesInTx(tx, payload);
      return { ok: true as const, activity };
    },
    { isolationLevel: "read committed" },
  );
}

// Insere N atividades numa única transação. Sem checagem de limite Free
// porque o consumidor (`createActivitiesBatch`) já gateia Pro upfront —
// batch só roda pra quem tem assinatura Pro (e Pro é ilimitado). Se uma
// linha falhar, rollback total — não persiste batch parcial.
export async function insertActivitiesBatchWithStatuses(
  payloads: NewActivityPayload[],
): Promise<Activity[]> {
  return db.transaction(async (tx) => {
    const result: Activity[] = [];
    for (const payload of payloads) {
      const activity = await insertActivityWithStatusesInTx(tx, payload);
      result.push(activity);
    }
    return result;
  });
}

async function insertActivityWithStatusesInTx(
  tx: Tx,
  payload: NewActivityPayload,
): Promise<Activity> {
  // Recheck after taking the same group lock used by membership revocation.
  // Authorization checked before this transaction can become stale while waiting.
  const [group] = await tx
    .select({ id: agendaTurmas.id })
    .from(agendaTurmas)
    .where(eq(agendaTurmas.id, payload.turmaId))
    .for("update");
  const profileIds = group
    ? (await listActiveProfilesOfUserInTurma(tx, payload.createdByUserId, payload.turmaId)).map(
        (p) => p.id,
      )
    : [];
  if (!profileIds.length) throw new Error("ACTIVE_PROFILE_REQUIRED");
  const [activity] = await tx.insert(agendaActivities).values(payload).returning();
  if (!activity) {
    throw new Error("agenda.activities: insert returned no row");
  }
  if (profileIds.length > 0) {
    await tx.insert(agendaActivityStatuses).values(
      profileIds.map((profileId) => ({
        activityId: activity.id,
        studentProfileId: profileId,
      })),
    );
  }
  return activity;
}

export async function countActivitiesCreatedByUser(userId: string): Promise<number> {
  return countPendingActivities(db, userId);
}

export async function updateActivityById(
  id: string,
  payload: UpdateActivityPayload,
  actorId: string,
  expectedVersion: number,
): Promise<Activity | "VERSION_CONFLICT" | null> {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(agendaActivities)
      .where(and(eq(agendaActivities.id, id), eq(agendaActivities.createdByUserId, actorId)))
      .for("update");
    if (!previous || previous.canceledAt) return null;
    if (previous.version !== expectedVersion) return "VERSION_CONFLICT";
    const accepted = await hasRecipientHistory(tx, id);
    // Existing recipients keep access even if the creator downgrades or chooses
    // a private visibility while editing another field.
    const visibility = accepted ? previous.visibility : payload.visibility;
    const [current] = await tx
      .update(agendaActivities)
      .set({ ...payload, visibility, version: previous.version + 1, updatedAt: new Date() })
      .where(eq(agendaActivities.id, id))
      .returning();
    if (!current) throw new Error("Activity update returned no row");
    await tx
      .insert(agendaActivityRevisions)
      .values({ activityId: id, actorId, version: current.version, previous, current });
    return current;
  });
}

export async function deleteActivityById(id: string, actorId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [previous] = await tx
      .select()
      .from(agendaActivities)
      .where(and(eq(agendaActivities.id, id), eq(agendaActivities.createdByUserId, actorId)))
      .for("update");
    if (!previous) return false;
    const accepted = await hasRecipientHistory(tx, id);
    if (!accepted) {
      await tx.delete(agendaActivities).where(eq(agendaActivities.id, id));
      return true;
    }
    if (previous.canceledAt) return true;
    const [current] = await tx
      .update(agendaActivities)
      .set({ canceledAt: new Date(), version: previous.version + 1, updatedAt: new Date() })
      .where(eq(agendaActivities.id, id))
      .returning();
    if (!current) throw new Error("Activity cancellation returned no row");
    await tx
      .insert(agendaActivityRevisions)
      .values({ activityId: id, actorId, version: current.version, previous, current });
    return true;
  });
}

export async function findActivityStatusForProfile(
  activityId: string,
  profileId: string,
): Promise<{ id: string; status: ActivityStatusValue; ownerUserId: string } | null> {
  const [row] = await db
    .select({
      id: agendaActivityStatuses.id,
      status: agendaActivityStatuses.status,
      ownerUserId: agendaStudentProfiles.userId,
    })
    .from(agendaActivityStatuses)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
    )
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
  actorId: string,
  freeLimit: number | null,
): Promise<boolean | { limitReached: number }> {
  const [candidate] = await db
    .select({ ownerId: agendaStudentProfiles.userId })
    .from(agendaActivityStatuses)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
    )
    .where(and(eq(agendaActivityStatuses.id, statusId), accessibleProfileCondition(actorId)));
  if (!candidate) return false;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${candidate.ownerId}`}))`,
    );
    await lockPendingLimit(tx, candidate.ownerId);
    const [current] = await tx
      .select({ row: agendaActivityStatuses, activity: agendaActivities })
      .from(agendaActivityStatuses)
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
      )
      .innerJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
      .where(and(eq(agendaActivityStatuses.id, statusId), accessibleProfileCondition(actorId)))
      .for("update");
    if (!current || current.activity.canceledAt) return false;
    if (
      freeLimit !== null &&
      status === "pending" &&
      current.row.status === "done" &&
      current.activity.createdByUserId === candidate.ownerId
    ) {
      const [pendingSibling] = await tx
        .select({ id: agendaActivityStatuses.id })
        .from(agendaActivityStatuses)
        .innerJoin(
          agendaStudentProfiles,
          eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
        )
        .where(
          and(
            eq(agendaActivityStatuses.activityId, current.activity.id),
            eq(agendaActivityStatuses.status, "pending"),
            eq(agendaStudentProfiles.userId, candidate.ownerId),
          ),
        )
        .limit(1);
      const total = await countPendingActivities(tx, candidate.ownerId);
      if (!pendingSibling && total >= freeLimit) return { limitReached: total };
    }
    await tx
      .update(agendaActivityStatuses)
      .set({ status, updatedAt: new Date() })
      .where(eq(agendaActivityStatuses.id, statusId));
    return true;
  });
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
    return true;
  });
}

function selectActivityListItems() {
  return db
    .select(activityListSelect)
    .from(agendaActivityStatuses)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
    )
    .innerJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
    .innerJoin(agendaSubjects, eq(agendaSubjects.id, agendaActivities.subjectId))
    .innerJoin(agendaTurmas, eq(agendaTurmas.id, agendaActivities.turmaId))
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode));
}

export async function listSchoolActivitiesByStatusIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return selectActivityListItems().where(
    and(accessibleProfileCondition(userId), inArray(agendaActivityStatuses.id, ids)),
  );
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
    .where(and(eq(agendaStudentProfiles.userId, userId), activeMembershipCondition()))
    .orderBy(asc(agendaSchools.name));

  if (turmas.length === 0) return [];

  const turmaIds = turmas.map((t) => t.turmaId);
  const subjects = await db
    .select({
      turmaId: agendaSubjects.turmaId,
      id: agendaSubjects.id,
      name: agendaSubjects.name,
      colorIndex: agendaSubjects.colorIndex,
      classDays: agendaSubjects.classDays,
    })
    .from(agendaSubjects)
    .where(inArray(agendaSubjects.turmaId, turmaIds))
    .orderBy(asc(agendaSubjects.name));

  // Uma consulta só para os slots de revezamento de todas as matérias.
  const slotsBySubject = await loadSlotsForSubjects(subjects.map((s) => s.id));

  const subjectsByTurma = new Map<string, TurmaWithSubjectsForForm["subjects"]>();
  for (const s of subjects) {
    const list = subjectsByTurma.get(s.turmaId) ?? [];
    list.push({
      id: s.id,
      name: s.name,
      colorIndex: s.colorIndex,
      classDays: s.classDays,
      alternatingSlots: (slotsBySubject.get(s.id) ?? []).map((slot) => ({
        day: slot.dayOfWeek,
        anchorIso: slot.anchorDate,
      })),
    });
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
