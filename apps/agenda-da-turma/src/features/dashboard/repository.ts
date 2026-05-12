import "server-only";

import { and, asc, db, eq, lt, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityAcceptances,
  agendaActivityStatuses,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmas,
} from "@informach/db/schema";
import type { ActivityListItem } from "@/features/activities/types";
import { addDaysLocalIso, todayLocalIso } from "./date";
import type { DashboardBucket, DashboardCounters, DashboardProfileSummary } from "./types";

type Ctx = {
  profileFilter: string | null;
  isPro: boolean;
};

// Subquery que devolve `true` quando alguém de outra família já aceitou a
// shared activity. Mesmo gate de edit/delete usado em /atividades — replicado
// aqui pra que o ActivityCard recebido por props funcione idêntico.
const hasOtherAcceptancesExpr = sql<boolean>`EXISTS (
  SELECT 1 FROM ${agendaActivityAcceptances} aa
  WHERE aa.activity_id = ${agendaActivities.id} AND aa.accepted = true
)`;

// SELECT base que produz uma row por (atividade × perfil do user). Mesmo
// shape de ActivityListItem que /atividades consome — permite reusar
// ActivityCard sem qualquer adapter.
const activityListSelect = {
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

// Atividades visíveis ao user em determinada bucket. WHERE composto:
// - perfil pertence ao user
// - se Free: só atividades criadas pelo próprio user (defesa em profundidade;
//   shared de outros NÃO geram statuses pra Free porque ele não pode aceitar)
// - opcional: filtrar por um perfil específico
// - filtro de data por bucket
export async function listActivitiesByBucket(
  userId: string,
  bucket: DashboardBucket,
  options: Ctx & { limit: number },
): Promise<ActivityListItem[]> {
  const today = todayLocalIso();
  const tomorrow = addDaysLocalIso(new Date(), 1);
  const sevenDaysAhead = addDaysLocalIso(new Date(), 7);

  const bucketWhere =
    bucket === "overdue"
      ? and(eq(agendaActivityStatuses.status, "pending"), lt(agendaActivities.dueAt, today))
      : bucket === "today"
        ? and(eq(agendaActivityStatuses.status, "pending"), eq(agendaActivities.dueAt, today))
        : and(
            eq(agendaActivityStatuses.status, "pending"),
            sql`${agendaActivities.dueAt} BETWEEN ${tomorrow} AND ${sevenDaysAhead}`,
          );

  const whereExpr = and(
    eq(agendaStudentProfiles.userId, userId),
    options.isPro ? undefined : eq(agendaActivities.createdByUserId, userId),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
    bucketWhere,
  );

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
    .innerJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode))
    .where(whereExpr)
    .orderBy(
      asc(agendaActivities.dueAt),
      asc(agendaActivities.createdAt),
      asc(agendaActivityStatuses.id),
    )
    .limit(options.limit);
}

// Quatro contadores em uma query única usando COUNT(*) FILTER. Conta
// distinct activity rows (uma atividade com 2 perfis do mesmo user conta
// como 1) — `COUNT(DISTINCT ${agendaActivityStatuses.id})` por bucket dá o
// número exibido no KPI. Note: status rows são distintos por (activity,
// perfil) — então contar statusId conta cada par. Para o dashboard,
// "5 tarefas hoje" significa 5 itens na lista (que é uma row por par),
// portanto contar statusId é o que match com a UI.
export async function getDashboardCounters(
  userId: string,
  options: Ctx,
): Promise<DashboardCounters> {
  const today = todayLocalIso();
  const tomorrow = addDaysLocalIso(new Date(), 1);
  const sevenAhead = addDaysLocalIso(new Date(), 7);
  const sevenAgo = addDaysLocalIso(new Date(), -7);

  const baseWhere = and(
    eq(agendaStudentProfiles.userId, userId),
    options.isPro ? undefined : eq(agendaActivities.createdByUserId, userId),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
  );

  const [row] = await db
    .select({
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'pending' AND ${agendaActivities.dueAt} < ${today})`,
      today: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'pending' AND ${agendaActivities.dueAt} = ${today})`,
      week: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'pending' AND ${agendaActivities.dueAt} BETWEEN ${tomorrow} AND ${sevenAhead})`,
      doneRecent: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'done' AND ${agendaActivities.dueAt} BETWEEN ${sevenAgo} AND ${today})`,
    })
    .from(agendaActivityStatuses)
    .innerJoin(
      agendaStudentProfiles,
      eq(agendaStudentProfiles.id, agendaActivityStatuses.studentProfileId),
    )
    .innerJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
    .where(baseWhere);

  return {
    overdue: Number(row?.overdue ?? 0),
    today: Number(row?.today ?? 0),
    week: Number(row?.week ?? 0),
    doneRecent: Number(row?.doneRecent ?? 0),
  };
}

// Resumo agregado por perfil. Sempre traz TODOS os perfis do user (mesmo
// sem nenhuma atividade — LEFT JOIN nas statuses). Alimenta as tabs de
// filtro e os progress cards. Não aceita profileFilter — é a fonte de
// verdade pra "o que cada filho tem".
export async function listProfileSummaries(
  userId: string,
  options: Pick<Ctx, "isPro">,
): Promise<DashboardProfileSummary[]> {
  const today = todayLocalIso();

  const rows = await db
    .select({
      profileId: agendaStudentProfiles.id,
      profileName: agendaStudentProfiles.name,
      profileCreatedAt: agendaStudentProfiles.createdAt,
      pending: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'pending')`,
      overdue: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'pending' AND ${agendaActivities.dueAt} < ${today})`,
      done: sql<number>`COUNT(*) FILTER (WHERE ${agendaActivityStatuses.status} = 'done')`,
    })
    .from(agendaStudentProfiles)
    .leftJoin(
      agendaActivityStatuses,
      eq(agendaActivityStatuses.studentProfileId, agendaStudentProfiles.id),
    )
    .leftJoin(agendaActivities, eq(agendaActivities.id, agendaActivityStatuses.activityId))
    .where(
      and(
        eq(agendaStudentProfiles.userId, userId),
        // Free: descarta status rows de atividades criadas por outros (defesa
        // em profundidade; na prática Free não consegue aceitar shared, então
        // não tem essas rows). LEFT JOIN: condição vai pro WHERE só quando
        // houver activity ligada — se não houver, dueAt/createdByUserId são
        // NULL e o filtro vira true por causa do `OR ... IS NULL`.
        options.isPro
          ? undefined
          : sql`(${agendaActivities.createdByUserId} = ${userId} OR ${agendaActivities.id} IS NULL)`,
      ),
    )
    .groupBy(agendaStudentProfiles.id, agendaStudentProfiles.name, agendaStudentProfiles.createdAt)
    .orderBy(asc(agendaStudentProfiles.createdAt));

  return rows.map((r) => {
    const pending = Number(r.pending ?? 0);
    const overdue = Number(r.overdue ?? 0);
    const done = Number(r.done ?? 0);
    const total = pending + done;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);
    return {
      profileId: r.profileId,
      profileName: r.profileName,
      pending,
      overdue,
      doneTotal: done,
      totalAll: total,
      progressPercent: progress,
    };
  });
}
