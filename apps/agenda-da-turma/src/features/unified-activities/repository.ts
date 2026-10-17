import "server-only";
import { db, sql } from "@informach/db";
import { agendaStudentProfiles, agendaTasks } from "@informach/db/schema";
import { APP_TIME_ZONE } from "@/features/dashboard/date";
import { accessibleProfileCondition } from "@/features/family/access";
import { activeProfileSubjectCondition } from "@/features/profile-subjects/visibility";
import { type ActivityOverviewOptions, OVERVIEW_PAGE_SIZE } from "./overview-types";
import { ROUTINE_MAX_ITEMS, type RoutineBucketKey } from "./routine-types";

// Projeção de atividades. Desde a convergência das tabelas é um SELECT só:
// antes era uma UNION de três fontes com formatos diferentes, e cada consumidor
// precisava saber de qual delas a linha tinha vindo. Tudo que lista ou conta
// atividades passa por aqui, para que os números e as listas nunca discordem.
function activityIndexCte(userId: string) {
  return sql`
    WITH activity_index AS (
      SELECT ${agendaTasks.id} AS id,
        ${agendaTasks.profileId} AS profile_id,
        ${agendaTasks.type}::text AS type,
        ${agendaTasks.status}::text AS status,
        ${agendaTasks.dueAt} AS due_at,
        ${agendaTasks.createdAt} AS created_at,
        ${agendaTasks.completedAt} AS completed_at,
        ${agendaTasks.assignedToUserId} AS assigned_to_user_id,
        ${agendaTasks.noticeId} AS notice_id
      FROM ${agendaTasks}
      INNER JOIN ${agendaStudentProfiles} ON ${agendaStudentProfiles.id} = ${agendaTasks.profileId}
      WHERE ${accessibleProfileCondition(userId)}
        -- Matéria extracurricular pausada é silêncio, aqui também. Sem isto, os
        -- contadores da rotina e a lista mostravam o que a exportação em PDF e o
        -- card de progresso escondiam — e depois que os contadores viraram link,
        -- o card dizia "Atrasadas 1" com o progresso ao lado dizendo 0.
        AND ${activeProfileSubjectCondition}
    )`;
}

export async function listActivityOverviewIndex(
  userId: string,
  options: ActivityOverviewOptions & {
    dueFrom: string | null;
    dueTo: string | null;
    /** "completed" só na janela de concluídas; ver `dueWindowRange`. */
    windowColumn: "due" | "completed";
  },
) {
  const windowColumn =
    options.windowColumn === "completed"
      ? sql`(completed_at AT TIME ZONE ${APP_TIME_ZONE})::date`
      : sql`due_at`;
  return db.execute<{ id: string }>(sql`
    ${activityIndexCte(userId)}
    SELECT id FROM activity_index
    WHERE (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
      AND (${options.typeFilter}::text IS NULL OR type = ${options.typeFilter})
      AND (${options.statusFilter} = 'all' OR status = ${options.statusFilter})
      AND (${options.noticeId}::uuid IS NULL OR notice_id = ${options.noticeId}::uuid)
      -- "O que é meu": quem ficou de cuidar. Sem responsável definido a
      -- atividade é de todo mundo, então ela NÃO entra aqui — o filtro responde
      -- "o que combinaram comigo", não "o que sobrou".
      AND (${options.assignedToMe} = false OR assigned_to_user_id = ${userId})
      -- Janela (ver dueWindowRange em overview-types). Sem recorte, a atividade
      -- sem prazo continua listada; com recorte ela sai, porque não há como
      -- dizer se um prazo a confirmar cai dentro ou fora da janela.
      AND (
        (${options.dueFrom}::date IS NULL AND ${options.dueTo}::date IS NULL)
        OR (
          ${windowColumn} IS NOT NULL
          AND (${options.dueFrom}::date IS NULL OR ${windowColumn} >= ${options.dueFrom}::date)
          AND (${options.dueTo}::date IS NULL OR ${windowColumn} <= ${options.dueTo}::date)
        )
      )
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'done' THEN 1 ELSE 2 END,
      CASE WHEN status = 'pending' THEN due_at END ASC NULLS FIRST,
      CASE WHEN status <> 'pending' THEN due_at END DESC NULLS LAST,
      created_at ASC, id ASC
    LIMIT ${OVERVIEW_PAGE_SIZE + 1} OFFSET ${(options.page - 1) * OVERVIEW_PAGE_SIZE}
  `);
}

// Buckets da rotina do dashboard, sobre a MESMA projeção da lista.
//   attention — pendente, vencida, de hoje ou sem prazo a confirmar
//   tomorrow  — pendente para amanhã
//   week      — pendente de depois de amanhã até o sétimo dia
export async function listRoutineIndex(
  userId: string,
  options: {
    profileFilter: string | null;
    todayIso: string;
    tomorrowIso: string;
    weekEndIso: string;
  },
) {
  return db.execute<{ id: string; bucket: RoutineBucketKey }>(
    sql`
    ${activityIndexCte(userId)}
    SELECT id,
      CASE
        WHEN due_at IS NULL OR due_at <= ${options.todayIso}::date THEN 'attention'
        WHEN due_at = ${options.tomorrowIso}::date THEN 'tomorrow'
        ELSE 'week'
      END AS bucket
    FROM activity_index
    WHERE status = 'pending'
      AND (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
      AND (due_at IS NULL OR due_at <= ${options.weekEndIso}::date)
    ORDER BY due_at ASC NULLS FIRST, created_at ASC, id ASC
    LIMIT ${ROUTINE_MAX_ITEMS}
  `,
  );
}

/**
 * Quantas a família concluiu hoje, na mesma projeção da rotina.
 *
 * Conta pela CONCLUSÃO, não pelo prazo: o fecho do dia reconhece quando a
 * família cuidou, e uma atividade sem prazo cuidada hoje conta igual.
 * `completed_at` é timestamptz; a conversão para o fuso do app é o que impede a
 * virada às 21h de contar no dia seguinte. Era uma das cinco contagens dos
 * cards do topo de Hoje; os cards saíram e as outras quatro não tinham mais
 * quem as lesse.
 */
export async function countDoneToday(
  userId: string,
  options: { profileFilter: string | null; todayIso: string },
): Promise<number> {
  const rows = await db.execute<{ done_today: string }>(sql`
    ${activityIndexCte(userId)}
    SELECT COUNT(*) AS done_today
    FROM activity_index
    WHERE status = 'done'
      AND completed_at IS NOT NULL
      AND (completed_at AT TIME ZONE ${APP_TIME_ZONE})::date = ${options.todayIso}::date
      AND (${options.profileFilter}::uuid IS NULL OR profile_id = ${options.profileFilter}::uuid)
  `);
  return Number(rows[0]?.done_today ?? 0);
}
