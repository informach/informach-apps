import "server-only";

import { and, asc, db, eq, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityStatuses,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmas,
} from "@informach/db/schema";
import { activityListSelect } from "@/features/activities/repository";
import type { ActivityListItem } from "@/features/activities/types";
import { accessibleProfileCondition } from "@/features/family/access";

type Options = {
  fromIso: string;
  toIso: string;
  profileFilter: string | null;
  isPro: boolean;
};

// Lista TODAS as atividades visíveis ao user num range de datas. Reutiliza o
// mesmo `activityListSelect` e regras de Free/Pro/perfil de
// listActivitiesByBucket — só muda o filtro de data (BETWEEN inclusivo).
// Sem limit: vista de calendário precisa do conjunto inteiro do range
// visível pra agrupar por dia. Em mês cheio (~42 dias) o volume é pequeno
// na prática (dezenas/centenas de rows).
export async function listActivitiesInDateRange(
  userId: string,
  options: Options,
): Promise<ActivityListItem[]> {
  const whereExpr = and(
    accessibleProfileCondition(userId),
    options.profileFilter ? eq(agendaStudentProfiles.id, options.profileFilter) : undefined,
    sql`${agendaActivities.dueAt} BETWEEN ${options.fromIso} AND ${options.toIso}`,
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
    );
}
