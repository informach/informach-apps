import "server-only";

import { and, asc, count, type Database, db, eq, gt, inArray, lt, or, sql } from "@informach/db";
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
import { DEFAULT_ACTIVITIES_PAGE_SIZE, MAX_ACTIVITIES_PAGE_SIZE } from "./limits";
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

// Subquery booleana — `true` quando alguma outra família já aceitou a shared
// activity. Mesmo gate de edit/delete usado em UI: bloqueia mesmo o criador
// quando outra família já aceitou. Consumido por listActivitiesPageForUser,
// listActivitiesByBucket (dashboard) e listActivitiesInDateRange (calendar).
export const hasOtherAcceptancesExpr = sql<boolean>`EXISTS (
  SELECT 1 FROM ${agendaActivityAcceptances} aa
  WHERE aa.activity_id = ${agendaActivities.id} AND aa.accepted = true
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
  activityCreatedAt: agendaActivities.createdAt,
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

export async function userHasActiveProfileInTurma(
  userId: string,
  turmaId: string,
): Promise<boolean> {
  const [profile] = await listActiveProfilesOfUserInTurma(db, userId, turmaId);
  return profile !== undefined;
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
  return db.transaction((tx) => insertActivityWithStatusesInTx(tx, payload));
}

// Variante Free: dentro de uma transação com advisory lock por usuário,
// conta atividades criadas (any status) e bloqueia quando atinge o limite.
// Espelha `insertRecipeWithinFreeLimit` do cozya. Race-safety: o lock
// serializa apenas operações deste mesmo userId, sem afetar concorrência
// global. `count` inclui done — marcar como concluída não libera vaga.
export type InsertActivityWithinLimitResult =
  | { ok: true; activity: Activity }
  | { ok: false; current: number };

export async function insertActivityWithStatusesWithinFreeLimit(
  payload: NewActivityPayload,
  limit: number,
): Promise<InsertActivityWithinLimitResult> {
  return db.transaction(
    async (tx) => {
      await lockActivityLimitForUser(tx, payload.createdByUserId);

      const current = await countActivitiesCreatedByUserWithClient(tx, payload.createdByUserId);
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
}

async function lockActivityLimitForUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:activities:${userId}`}))`);
}

export async function countActivitiesCreatedByUser(userId: string): Promise<number> {
  return countActivitiesCreatedByUserWithClient(db, userId);
}

async function countActivitiesCreatedByUserWithClient(
  client: Database | Tx,
  userId: string,
): Promise<number> {
  const [row] = await client
    .select({ count: count() })
    .from(agendaActivities)
    .where(eq(agendaActivities.createdByUserId, userId));
  return Number(row?.count ?? 0);
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

// Cursor opaco pra paginação keyset da listagem. Encoda o último item
// retornado como `<isDone>|<dueAt>|<activityCreatedAt ISO>|<statusId>` em
// base64url — 4 chaves alinhadas com o ORDER BY pra garantir tiebreak
// determinístico. A primeira chave (`isDone`) implementa o agrupamento
// pendentes-antes-de-concluídas; dentro de cada grupo `dueAt` ordena
// diferente (pending ASC, done DESC). Cursores antigos (3 chaves) caem
// como inválidos e retornam à primeira página — comportamento defensivo.
type ActivityCursor = {
  isDone: boolean;
  dueAt: string;
  createdAt: Date;
  statusId: string;
};

function encodeActivityCursor(item: ActivityListItem): string {
  const flag = item.status === "done" ? "1" : "0";
  const payload = `${flag}|${item.dueAt}|${item.activityCreatedAt.toISOString()}|${item.statusId}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

function decodeActivityCursor(cursor: string): ActivityCursor | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    const [flag, dueAt, createdAtIso, statusId] = decoded.split("|");
    if (!flag || !dueAt || !createdAtIso || !statusId) return null;
    if (flag !== "0" && flag !== "1") return null;
    const createdAt = new Date(createdAtIso);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { isDone: flag === "1", dueAt, createdAt, statusId };
  } catch {
    return null;
  }
}

export type ListActivitiesPageOptions = {
  profileFilter: string | null;
  cursor: string | null;
  includeSharedFromOthers: boolean;
  limit?: number;
};

export type ActivitiesPage = {
  items: ActivityListItem[];
  nextCursor: string | null;
};

// Lista pra `/atividades`. Uma row por (atividade × perfil do user). Filtra
// por perfil opcionalmente. Inclui `hasOtherAcceptances` via subquery pra
// guiar UI de edit/delete. Paginação keyset forward-only:
// - Sem cursor → primeira página
// - Com cursor → retorna itens "após" o cursor segundo o ORDER BY
// - `nextCursor` é null quando atinge o fim
export async function listActivitiesPageForUser(
  userId: string,
  options: ListActivitiesPageOptions,
): Promise<ActivitiesPage> {
  const limit = Math.min(
    Math.max(options.limit ?? DEFAULT_ACTIVITIES_PAGE_SIZE, 1),
    MAX_ACTIVITIES_PAGE_SIZE,
  );

  // Cursor com 2 grupos (pending ASC dueAt, done DESC dueAt). "Após" depende
  // de em qual grupo o cursor está:
  // - cursor em pending: pode saltar pro grupo done inteiro, ou seguir em
  //   pending com (dueAt, createdAt, statusId) ASC.
  // - cursor em done: permanece em done; (dueAt) é DESC (depois = menor);
  //   tiebreak (createdAt, statusId) segue ASC pra estabilidade.
  // Cursor corrompido/inválido vira "sem cursor" (defensivo).
  const decoded = options.cursor ? decodeActivityCursor(options.cursor) : null;
  const cursorClause = decoded
    ? !decoded.isDone
      ? or(
          eq(agendaActivityStatuses.status, "done"),
          and(
            eq(agendaActivityStatuses.status, "pending"),
            or(
              gt(agendaActivities.dueAt, decoded.dueAt),
              and(
                eq(agendaActivities.dueAt, decoded.dueAt),
                gt(agendaActivities.createdAt, decoded.createdAt),
              ),
              and(
                eq(agendaActivities.dueAt, decoded.dueAt),
                eq(agendaActivities.createdAt, decoded.createdAt),
                gt(agendaActivityStatuses.id, decoded.statusId),
              ),
            ),
          ),
        )
      : and(
          eq(agendaActivityStatuses.status, "done"),
          or(
            lt(agendaActivities.dueAt, decoded.dueAt),
            and(
              eq(agendaActivities.dueAt, decoded.dueAt),
              gt(agendaActivities.createdAt, decoded.createdAt),
            ),
            and(
              eq(agendaActivities.dueAt, decoded.dueAt),
              eq(agendaActivities.createdAt, decoded.createdAt),
              gt(agendaActivityStatuses.id, decoded.statusId),
            ),
          ),
        )
    : undefined;

  const whereExpr = and(
    eq(agendaStudentProfiles.userId, userId),
    options.includeSharedFromOthers ? undefined : eq(agendaActivities.createdByUserId, userId),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
    cursorClause,
  );

  const rows = await db
    .select(activityListSelect)
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
    // Pendentes vêm primeiro (status='pending' < 'done' via boolean cast).
    // Dentro de pending: dueAt ASC (mais antigo/atrasado no topo).
    // Dentro de done: dueAt DESC (concluída mais recente no topo).
    // createdAt e statusId garantem tiebreak determinístico nos 2 grupos.
    .orderBy(
      sql`(${agendaActivityStatuses.status} = 'done')`,
      sql`CASE WHEN ${agendaActivityStatuses.status} = 'pending' THEN ${agendaActivities.dueAt} END ASC NULLS LAST`,
      sql`CASE WHEN ${agendaActivityStatuses.status} = 'done' THEN ${agendaActivities.dueAt} END DESC NULLS LAST`,
      asc(agendaActivities.createdAt),
      asc(agendaActivityStatuses.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  const nextCursor = hasMore && last ? encodeActivityCursor(last) : null;
  return { items, nextCursor };
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
