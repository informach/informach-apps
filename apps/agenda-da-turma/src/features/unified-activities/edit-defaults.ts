import type { NoticeActionInput } from "@/features/notices/schemas";
import type { TaskRow } from "./task-repository";

/**
 * A tarefa gravada, de volta no formato do formulário.
 *
 * Existe porque este preenchimento era montado à mão dentro de
 * `components/activity-detail.tsx`, campo a campo — e um campo esquecido ali
 * não dá erro: ele vira o valor do formulário, o formulário é gravado com
 * spread cego (`.set({ ...input.action })`) e o banco recebe o esquecimento.
 * Foi o que aconteceu com a duração: abrir a atividade para corrigir o título e
 * salvar apagava os "30 min" que a família tinha escolhido, sem aviso, e a soma
 * do bucket encolhia junto.
 *
 * Pura e testada de propósito. O teste enumera os campos, então acrescentar uma
 * coluna ao formulário sem trazê-la para cá passa a quebrar um teste em vez de
 * apagar dado de alguém.
 *
 * `recurrence` e `reminderAt` também passam por aqui. Eles se perdiam pelo mesmo
 * motivo que a duração, só que um degrau antes: `taskSelect` não os projetava,
 * então não havia o que ler. Uma atividade semanal editada pelo detalhe virava
 * avulsa e o lembrete sumia.
 *
 * Devolver os MESMOS valores não esbarra no gate de Pro: `updateNoticeAction`
 * recusa quando a edição **acrescenta** automação (`addsAutomation`), não quando
 * ela preserva o que já estava lá. Isso também é o certo para quem voltou ao
 * gratuito: dado existente continua consultável, e editar o título não é hora de
 * apagar em silêncio o que a família configurou quando era Pro.
 */
export function taskToActionInput(
  task: TaskRow,
  overrides: Partial<NoticeActionInput> = {},
): NoticeActionInput {
  return {
    profileId: task.profileId,
    type: task.type,
    title: task.title,
    description: task.description,
    subjectId: task.subjectId,
    profileSubjectId: task.profileSubjectId,
    dueAt: task.dueAt,
    dateOrigin: task.dateOrigin,
    time: task.time,
    estimatedMinutes: task.estimatedMinutes,
    location: task.location,
    sourceExcerpt: task.sourceExcerpt,
    assignedToUserId: task.assignedToUserId,
    reminderAt: task.reminderAt?.toISOString() ?? null,
    recurrence: task.recurrence,
    // Publicada na turma é estado da atividade, não campo editável solto.
    shareWithTurma: task.sharedActivityId !== null,
    ...overrides,
  };
}
