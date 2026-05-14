import "server-only";

import { and, asc, count, type Database, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaProfileSubjectActivities,
  agendaProfileSubjects,
  agendaStudentProfiles,
} from "@informach/db/schema";
import type { ActivityStatusValue, ActivityType } from "@/features/activities/types";
import type { ProfileSubjectActivity, ProfileSubjectActivityListItem } from "./types";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

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

// SELECT canônico pra montar `ProfileSubjectActivityListItem` — incluído na
// listagem unificada do calendar/dashboard. Sem JOIN em `agenda.turmas` /
// `agenda.schools` (extracurricular não tem escola).
export const profileSubjectActivityListSelect = {
  activityId: agendaProfileSubjectActivities.id,
  status: agendaProfileSubjectActivities.status,
  studentProfileId: agendaStudentProfiles.id,
  studentProfileName: agendaStudentProfiles.name,
  profileSubjectId: agendaProfileSubjects.id,
  profileSubjectName: agendaProfileSubjects.name,
  profileSubjectColorIndex: agendaProfileSubjects.colorIndex,
  profileSubjectStatus: agendaProfileSubjects.status,
  type: agendaProfileSubjectActivities.type,
  title: agendaProfileSubjectActivities.title,
  description: agendaProfileSubjectActivities.description,
  dueAt: agendaProfileSubjectActivities.dueAt,
  activityCreatedAt: agendaProfileSubjectActivities.createdAt,
  createdByUserId: agendaProfileSubjectActivities.createdByUserId,
} as const;

function toListItem(
  row: Awaited<ReturnType<typeof selectListItem>>[number],
): ProfileSubjectActivityListItem {
  return {
    source: "extra" as const,
    activityId: row.activityId,
    profileSubjectActivityId: row.activityId,
    status: row.status,
    studentProfileId: row.studentProfileId,
    studentProfileName: row.studentProfileName,
    profileSubjectId: row.profileSubjectId,
    profileSubjectName: row.profileSubjectName,
    profileSubjectColorIndex: row.profileSubjectColorIndex,
    profileSubjectStatus: row.profileSubjectStatus,
    type: row.type,
    title: row.title,
    description: row.description,
    dueAt: row.dueAt,
    activityCreatedAt: row.activityCreatedAt,
    createdByUserId: row.createdByUserId,
  };
}

function selectListItem() {
  return db
    .select(profileSubjectActivityListSelect)
    .from(agendaProfileSubjectActivities)
    .innerJoin(
      agendaProfileSubjects,
      eq(agendaProfileSubjects.id, agendaProfileSubjectActivities.profileSubjectId),
    )
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaProfileSubjectActivities.profileId),
    );
}

export async function findProfileSubjectActivityById(
  id: string,
): Promise<ProfileSubjectActivity | null> {
  const [row] = await db
    .select()
    .from(agendaProfileSubjectActivities)
    .where(eq(agendaProfileSubjectActivities.id, id))
    .limit(1);
  return row ?? null;
}

// Garante que o user é dono do perfil que possui a atividade. Usado pelo
// service antes de update/delete/setStatus.
export async function findProfileSubjectActivityForUser(
  userId: string,
  id: string,
): Promise<ProfileSubjectActivity | null> {
  const [row] = await db
    .select({ activity: agendaProfileSubjectActivities })
    .from(agendaProfileSubjectActivities)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaProfileSubjectActivities.profileId),
    )
    .where(and(eq(agendaStudentProfiles.userId, userId), eq(agendaProfileSubjectActivities.id, id)))
    .limit(1);
  return row?.activity ?? null;
}

// Insere a atividade. Pré-condição (verificada pelo service):
//   - profileSubject pertence ao perfil
//   - perfil pertence ao user
export async function insertProfileSubjectActivity(
  payload: NewProfileSubjectActivityPayload,
): Promise<ProfileSubjectActivity> {
  const [row] = await db.insert(agendaProfileSubjectActivities).values(payload).returning();
  if (!row) throw new Error("agenda.profile_subject_activities: insert returned no row");
  return row;
}

// Variante Free: comparte o mesmo advisory lock e cap (`FREE_ACTIVITY_LIMIT`)
// que `agenda.activities`. O count combina ambas as origens — Free pode
// criar 20 atividades total, misturadas como quiser entre turma e extra.
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
      await lockSharedActivityLimitForUser(tx, payload.createdByUserId);

      const current = await countCombinedActivitiesForUser(tx, payload.createdByUserId);
      if (current >= limit) {
        return { ok: false as const, current };
      }
      const [row] = await tx.insert(agendaProfileSubjectActivities).values(payload).returning();
      if (!row) throw new Error("agenda.profile_subject_activities: insert returned no row");
      return { ok: true as const, activity: row };
    },
    { isolationLevel: "read committed" },
  );
}

// Mesmo lock key que `agenda.activities` para que o cap FREE_ACTIVITY_LIMIT
// seja atômico cross-domain. Sem isso, user Free poderia abrir duas abas e
// inserir 20 turma + 20 extras simultâneo.
async function lockSharedActivityLimitForUser(tx: Tx, userId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:activities:${userId}`}))`);
}

async function countCombinedActivitiesForUser(
  client: Database | Tx,
  userId: string,
): Promise<number> {
  const [turmaRow] = await client
    .select({ count: count() })
    .from(agendaActivities)
    .where(eq(agendaActivities.createdByUserId, userId));
  const [extraRow] = await client
    .select({ count: count() })
    .from(agendaProfileSubjectActivities)
    .where(eq(agendaProfileSubjectActivities.createdByUserId, userId));
  return Number(turmaRow?.count ?? 0) + Number(extraRow?.count ?? 0);
}

export async function updateProfileSubjectActivityById(
  id: string,
  payload: UpdateProfileSubjectActivityPayload,
): Promise<ProfileSubjectActivity | null> {
  const [row] = await db
    .update(agendaProfileSubjectActivities)
    .set({
      type: payload.type,
      title: payload.title,
      description: payload.description,
      dueAt: payload.dueAt,
      updatedAt: new Date(),
    })
    .where(eq(agendaProfileSubjectActivities.id, id))
    .returning();
  return row ?? null;
}

export async function deleteProfileSubjectActivityById(id: string): Promise<boolean> {
  const removed = await db
    .delete(agendaProfileSubjectActivities)
    .where(eq(agendaProfileSubjectActivities.id, id))
    .returning({ id: agendaProfileSubjectActivities.id });
  return removed.length > 0;
}

export async function setProfileSubjectActivityStatus(
  id: string,
  status: ActivityStatusValue,
): Promise<boolean> {
  const updated = await db
    .update(agendaProfileSubjectActivities)
    .set({ status, updatedAt: new Date() })
    .where(eq(agendaProfileSubjectActivities.id, id))
    .returning({ id: agendaProfileSubjectActivities.id });
  return updated.length > 0;
}

// Lista atividades de uma matéria específica (página `/perfis/[id]/extras/[subjectId]`
// futura — fora do escopo v1, mas a query é cheap pra deixar pronta).
export async function listProfileSubjectActivitiesForSubject(
  profileSubjectId: string,
): Promise<ProfileSubjectActivity[]> {
  return db
    .select()
    .from(agendaProfileSubjectActivities)
    .where(eq(agendaProfileSubjectActivities.profileSubjectId, profileSubjectId))
    .orderBy(asc(agendaProfileSubjectActivities.dueAt));
}

export type ListProfileActivitiesInRangeOptions = {
  fromIso: string;
  toIso: string;
  profileFilter: string | null;
  // Quando `true`, retorna atividades de matérias `paused` também (usado pela
  // listagem `/atividades` aba "Extras" pra mostrar histórico). `false` para
  // dashboard e calendário (paused some).
  includePausedSubjects: boolean;
};

// Atividades no range [fromIso, toIso] pertencentes ao user. Pode filtrar
// por perfil. Sem JOIN em turma/escola (não aplicável).
export async function listProfileActivitiesInDateRange(
  userId: string,
  options: ListProfileActivitiesInRangeOptions,
): Promise<ProfileSubjectActivityListItem[]> {
  const whereExpr = and(
    eq(agendaStudentProfiles.userId, userId),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
    options.includePausedSubjects ? undefined : eq(agendaProfileSubjects.status, "active"),
    sql`${agendaProfileSubjectActivities.dueAt} BETWEEN ${options.fromIso} AND ${options.toIso}`,
  );

  const rows = await selectListItem()
    .where(whereExpr)
    .orderBy(
      asc(agendaProfileSubjectActivities.dueAt),
      asc(agendaProfileSubjectActivities.createdAt),
    );
  return rows.map(toListItem);
}

export type ProfileActivityBucket = "overdue" | "today" | "next7days" | "done";

export type ListProfileActivitiesByBucketOptions = {
  todayIso: string;
  profileFilter: string | null;
  limit: number;
};

// Buckets do dashboard. Mesma classificação que agenda.activities:
//   - overdue: pending E dueAt < hoje
//   - today: pending E dueAt = hoje
//   - next7days: pending E dueAt em (hoje, hoje+7]
//   - done: status = done (qualquer dueAt; ordena desc)
// Sempre `WHERE profile_subject.status = 'active'` (paused não aparece em buckets).
export async function listProfileActivitiesByBucket(
  userId: string,
  bucket: ProfileActivityBucket,
  options: ListProfileActivitiesByBucketOptions,
): Promise<ProfileSubjectActivityListItem[]> {
  const bucketFilter = (() => {
    switch (bucket) {
      case "overdue":
        return and(
          eq(agendaProfileSubjectActivities.status, "pending"),
          sql`${agendaProfileSubjectActivities.dueAt} < ${options.todayIso}`,
        );
      case "today":
        return and(
          eq(agendaProfileSubjectActivities.status, "pending"),
          eq(agendaProfileSubjectActivities.dueAt, options.todayIso),
        );
      case "next7days":
        return and(
          eq(agendaProfileSubjectActivities.status, "pending"),
          sql`${agendaProfileSubjectActivities.dueAt} > ${options.todayIso}`,
          sql`${agendaProfileSubjectActivities.dueAt} <= ${options.todayIso}::date + INTERVAL '7 days'`,
        );
      case "done":
        return eq(agendaProfileSubjectActivities.status, "done");
    }
  })();

  const whereExpr = and(
    eq(agendaStudentProfiles.userId, userId),
    eq(agendaProfileSubjects.status, "active"),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
    bucketFilter,
  );

  const rows = await selectListItem()
    .where(whereExpr)
    .orderBy(
      bucket === "done"
        ? sql`${agendaProfileSubjectActivities.dueAt} DESC`
        : asc(agendaProfileSubjectActivities.dueAt),
      asc(agendaProfileSubjectActivities.createdAt),
    )
    .limit(options.limit);
  return rows.map(toListItem);
}

// Conta as atividades extras criadas pelo user. Usado pra UI mostrar
// "X de Y atividades" no Free.
export async function countProfileSubjectActivitiesByUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(agendaProfileSubjectActivities)
    .where(eq(agendaProfileSubjectActivities.createdByUserId, userId));
  return Number(row?.count ?? 0);
}
