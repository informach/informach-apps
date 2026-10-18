import "server-only";

import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaActivities,
  agendaActivityRevisions,
  agendaNotices,
  agendaProfileSubjects,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
  agendaTurmas,
  users,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";
import { activeProfileSubjectCondition } from "@/features/profile-subjects/visibility";

/**
 * A tarefa com todo o contexto que qualquer tela precisa, numa consulta só.
 *
 * Antes eram três consultas em paralelo — uma por tabela — e três formatos
 * diferentes que cada card tinha de conhecer. Agora a tabela é uma, e o que
 * variava entre as fontes virou coluna opcional: `sharedActivityId` traz a
 * turma quando a atividade foi publicada nela, `noticeId` traz a origem quando
 * veio de um recado, e a matéria sai do vínculo de turma ou do extracurricular.
 *
 * Todos os vínculos são LEFT JOIN de propósito: a ausência é um estado
 * legítimo. Atividade sem matéria, sem prazo, sem turma e sem recado é uma
 * atividade — foi por não aceitar isso que o cadastro escolar exigia turma,
 * matéria e prazo antes de deixar a família anotar "levar garrafa de água".
 */
const taskSelect = {
  id: agendaTasks.id,
  noticeId: agendaTasks.noticeId,
  sharedActivityId: agendaTasks.sharedActivityId,
  profileId: agendaTasks.profileId,
  profileName: agendaStudentProfiles.name,
  /**
   * A família dona da criança — não quem criou a tarefa. É ela que paga o
   * plano, e por isso é ela que decide se lembrete e repetição estão
   * disponíveis: um segundo adulto convidado não é Free numa família Pro, e
   * uma família gratuita não vira Pro por receber a atividade de uma que é.
   */
  ownerUserId: agendaStudentProfiles.userId,
  createdByUserId: agendaTasks.createdByUserId,
  assignedToUserId: agendaTasks.assignedToUserId,
  assignedName: users.name,
  type: agendaTasks.type,
  status: agendaTasks.status,
  title: agendaTasks.title,
  description: agendaTasks.description,
  dueAt: agendaTasks.dueAt,
  time: agendaTasks.time,
  estimatedMinutes: agendaTasks.estimatedMinutes,
  location: agendaTasks.location,
  dateOrigin: agendaTasks.dateOrigin,
  sourceExcerpt: agendaTasks.sourceExcerpt,
  /**
   * Repetição e lembrete existem aqui para SOBREVIVER à edição.
   *
   * Sem eles projetados, o formulário de detalhe não tinha como lê-los e
   * gravava `"none"`/`null` por cima: uma atividade semanal editada pelo
   * detalhe virava avulsa e o lembrete sumia, sem aviso. Ver
   * `edit-defaults.ts`.
   */
  recurrence: agendaTasks.recurrence,
  reminderAt: agendaTasks.reminderAt,
  version: agendaTasks.version,
  /**
   * O CONTEÚDO mudou depois de salvo: título, data, matéria, quem cuida.
   *
   * A versão não serve para isso: concluir e reabrir também sobem a versão, e
   * "Mudou depois de salva" aparecia numa atividade que só foi marcada e
   * desmarcada. Uma revisão em que a situação ficou igual é uma edição.
   */
  editedAfterSave: sql<boolean>`EXISTS (
    SELECT 1 FROM ${agendaActivityRevisions}
    WHERE ${agendaActivityRevisions.taskId} = ${agendaTasks.id}
      AND (${agendaActivityRevisions.previous} ->> 'status')
        IS NOT DISTINCT FROM (${agendaActivityRevisions.current} ->> 'status')
  )`,
  createdAt: agendaTasks.createdAt,
  subjectId: agendaTasks.subjectId,
  profileSubjectId: agendaTasks.profileSubjectId,
  subjectName: sql<string | null>`COALESCE(${agendaSubjects.name}, ${agendaProfileSubjects.name})`,
  subjectColorIndex: sql<
    number | null
  >`COALESCE(${agendaSubjects.colorIndex}, ${agendaProfileSubjects.colorIndex})`,
  noticeSource: agendaNotices.source,
  visibility: agendaActivities.visibility,
  turmaId: agendaActivities.turmaId,
  schoolName: agendaSchools.name,
  grade: agendaTurmas.grade,
  classLetter: agendaTurmas.classLetter,
  year: agendaTurmas.year,
} as const;

export type TaskRow = Awaited<ReturnType<typeof listTasksByIds>>[number];

function selectTasks() {
  return db
    .select(taskSelect)
    .from(agendaTasks)
    .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaTasks.profileId))
    .leftJoin(users, eq(users.id, agendaTasks.assignedToUserId))
    .leftJoin(agendaSubjects, eq(agendaSubjects.id, agendaTasks.subjectId))
    .leftJoin(agendaProfileSubjects, eq(agendaProfileSubjects.id, agendaTasks.profileSubjectId))
    .leftJoin(agendaNotices, eq(agendaNotices.id, agendaTasks.noticeId))
    .leftJoin(agendaActivities, eq(agendaActivities.id, agendaTasks.sharedActivityId))
    .leftJoin(agendaTurmas, eq(agendaTurmas.id, agendaActivities.turmaId))
    .leftJoin(agendaSchools, eq(agendaSchools.inepCode, agendaTurmas.schoolInepCode));
}

export async function listTasksByIds(userId: string, ids: string[]) {
  if (!ids.length) return [];
  return selectTasks().where(and(accessibleProfileCondition(userId), inArray(agendaTasks.id, ids)));
}

export async function findTaskForUser(userId: string, id: string) {
  const [row] = await selectTasks()
    .where(and(accessibleProfileCondition(userId), eq(agendaTasks.id, id)))
    .limit(1);
  return row ?? null;
}

/**
 * Tarefas com prazo dentro de um intervalo, para o calendário.
 *
 * Sem prazo não há lugar no grid — e isso é deliberado: a atividade sem data
 * continua na rotina e na lista, sem receber uma data fictícia só para caber
 * numa célula.
 */
export async function listTasksInDateRange(
  userId: string,
  options: { fromIso: string; toIso: string; profileFilter: string | null },
) {
  return selectTasks().where(
    and(
      accessibleProfileCondition(userId),
      sql`${agendaTasks.dueAt} BETWEEN ${options.fromIso}::date AND ${options.toIso}::date`,
      options.profileFilter ? eq(agendaTasks.profileId, options.profileFilter) : sql`TRUE`,
      sql`${agendaTasks.status} <> 'canceled'`,
      activeProfileSubjectCondition,
    ),
  );
}
