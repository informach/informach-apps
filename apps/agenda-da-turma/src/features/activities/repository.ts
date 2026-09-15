import "server-only";

import { and, asc, type Database, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaActivityRevisions,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmaMembers,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { actionFingerprint } from "@/features/notices/write-repository";
import { loadSlotsForSubjects } from "@/features/subjects/repository";
import { activeMembershipCondition } from "@/features/turmas/access";
import { todayLocalIso } from "../dashboard/date";
import { countPendingActivities, lockPendingLimit } from "./pending-limit";
import type {
  Activity,
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
  SELECT 1 FROM ${agendaTasks} recipient_task
  INNER JOIN ${agendaStudentProfiles} recipient_profile ON recipient_profile.id = recipient_task.profile_id
  WHERE recipient_task.shared_activity_id = ${agendaActivities.id}
    AND recipient_profile.user_id IS DISTINCT FROM ${agendaActivities.createdByUserId}
)`;

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

// Cria o fato publicado na turma + 1 tarefa pra cada criança ativa do creator.
// O service autoriza criação só quando há pelo menos uma criança ativa, para
// evitar atividade sem tarefa e invisível para quem criou.
export async function insertActivityWithTasks(payload: NewActivityPayload): Promise<Activity> {
  return db.transaction((tx) => insertActivityWithTasksInTx(tx, payload));
}

// Variante Free: dentro de uma transação com advisory lock por usuário,
// conta pendências próprias de todas as origens e bloqueia ao atingir o limite.
// Espelha `insertRecipeWithinFreeLimit` do cozya. Race-safety: o lock
// serializa apenas operações deste mesmo userId, sem afetar concorrência
// global. Concluir libera vaga sem apagar o histórico.
export type InsertActivityWithinLimitResult =
  | { ok: true; activity: Activity }
  | { ok: false; current: number };

export async function insertActivityWithTasksWithinFreeLimit(
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

      const activity = await insertActivityWithTasksInTx(tx, payload);
      return { ok: true as const, activity };
    },
    { isolationLevel: "read committed" },
  );
}

/**
 * O fato publicado e as tarefas que ele gera, na mesma transação.
 *
 * `agenda.activities` deixou de ser a tarefa e passou a ser só o que a turma
 * vê: turma, matéria, título, prazo, visibilidade. Quem executa é
 * `agenda.tasks`, uma linha por criança — e é ela que a família conclui,
 * atribui, agenda e comenta. Era isso que `activity_statuses` fazia pela
 * metade: guardava a conclusão, mas não o resto.
 */
async function insertActivityWithTasksInTx(tx: Tx, payload: NewActivityPayload): Promise<Activity> {
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
  await tx.insert(agendaTasks).values(profileIds.map((id) => taskFromActivity(activity, id)));
  return activity;
}

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
    // A retificação publicada alcança quem já recebeu. Os campos da família
    // (hora, local, responsável, lembrete, conclusão) não são tocados: o que a
    // turma corrige é o enunciado, não a rotina de cada casa.
    await tx
      .update(agendaTasks)
      .set({
        type: current.type,
        subjectId: current.subjectId,
        title: current.title,
        description: current.description,
        dueAt: current.dueAt,
        dateOrigin: "school",
        fingerprint: actionFingerprint(current),
        version: sql`${agendaTasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(agendaTasks.sharedActivityId, id));
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
      // Sem histórico de destinatário, some de verdade — inclusive as tarefas.
      // O `ON DELETE SET NULL` da FK sozinho deixaria tarefas órfãs, que
      // continuariam cobrando a família por uma atividade que não existe mais.
      await tx.delete(agendaTasks).where(eq(agendaTasks.sharedActivityId, id));
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
    // Só o que ainda estava por fazer é cancelado. A criança que já cumpriu
    // continua tendo cumprido — a conclusão de cada família é dela, e a
    // correção de quem publicou não a apaga. A versão sobe junto porque é ela
    // que diz ao calendário assinado que o evento mudou (SEQUENCE no .ics).
    await tx
      .update(agendaTasks)
      .set({
        status: "canceled",
        version: sql`${agendaTasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(agendaTasks.sharedActivityId, id), eq(agendaTasks.status, "pending")));
    await tx
      .insert(agendaActivityRevisions)
      .values({ activityId: id, actorId, version: current.version, previous, current });
    return true;
  });
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
