import "server-only";

import { and, asc, count, db, eq, inArray, sql } from "@informach/db";
import {
  agendaProfileSubjectActivities,
  agendaProfileSubjects,
  agendaStudentProfiles,
} from "@informach/db/schema";
import { countPendingActivities, lockPendingLimit } from "@/features/activities/pending-limit";
import type { ActivityStatusValue, ActivityType } from "@/features/activities/types";
import { accessibleProfileCondition } from "@/features/family/access";
import type { ProfileSubjectActivity, ProfileSubjectActivityListItem } from "./types";

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
  activityUpdatedAt: agendaProfileSubjectActivities.updatedAt,
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
    activityUpdatedAt: row.activityUpdatedAt,
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

/**
 * A atividade extracurricular com os nomes que o detalhe mostra. A consulta
 * mora aqui, e não no componente: componentes não falam com o banco.
 */
export async function findExtraActivityDetailForUser(userId: string, id: string) {
  const [row] = await db
    .select({
      activity: agendaProfileSubjectActivities,
      profileName: agendaStudentProfiles.name,
      subjectName: agendaProfileSubjects.name,
      subjectColorIndex: agendaProfileSubjects.colorIndex,
    })
    .from(agendaProfileSubjectActivities)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaProfileSubjectActivities.profileId),
    )
    .innerJoin(
      agendaProfileSubjects,
      eq(agendaProfileSubjects.id, agendaProfileSubjectActivities.profileSubjectId),
    )
    .where(and(accessibleProfileCondition(userId), eq(agendaProfileSubjectActivities.id, id)))
    .limit(1);
  return row ?? null;
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

export async function listProfileActivitiesByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  const rows = await selectListItem().where(
    and(accessibleProfileCondition(userId), inArray(agendaProfileSubjectActivities.id, ids)),
  );
  return rows.map(toListItem);
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
    .where(and(accessibleProfileCondition(userId), eq(agendaProfileSubjectActivities.id, id)))
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
      await lockPendingLimit(tx, payload.createdByUserId);

      const current = await countPendingActivities(tx, payload.createdByUserId);
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
  actorId: string,
  freeLimit: number | null,
): Promise<boolean | { limitReached: number }> {
  const [candidate] = await db
    .select({ ownerId: agendaStudentProfiles.userId })
    .from(agendaProfileSubjectActivities)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaProfileSubjectActivities.profileId),
    )
    .where(and(eq(agendaProfileSubjectActivities.id, id), accessibleProfileCondition(actorId)));
  if (!candidate) return false;
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`agenda:family:${candidate.ownerId}`}))`,
    );
    await lockPendingLimit(tx, candidate.ownerId);
    const [current] = await tx
      .select({ activity: agendaProfileSubjectActivities })
      .from(agendaProfileSubjectActivities)
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.id, agendaProfileSubjectActivities.profileId),
      )
      .where(and(eq(agendaProfileSubjectActivities.id, id), accessibleProfileCondition(actorId)))
      .for("update");
    if (!current) return false;
    if (freeLimit !== null && status === "pending" && current.activity.status === "done") {
      const total = await countPendingActivities(tx, candidate.ownerId);
      if (total >= freeLimit) return { limitReached: total };
    }
    await tx
      .update(agendaProfileSubjectActivities)
      .set({ status, updatedAt: new Date() })
      .where(eq(agendaProfileSubjectActivities.id, id));
    return true;
  });
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
    accessibleProfileCondition(userId),
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
    accessibleProfileCondition(userId),
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
