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
 * ⚠️ **`recurrence` e `reminderAt` continuam se perdendo na edição**, e não por
 * escolha: `taskSelect` (em `task-repository.ts`) não projeta essas duas
 * colunas, então elas não chegam aqui. Uma atividade semanal editada pelo
 * detalhe vira avulsa, e o lembrete some. É defeito anterior a esta função — o
 * conserto é acrescentar as duas ao `taskSelect` e lê-las abaixo, mas isso muda
 * comportamento de quem já usa e merece decisão própria, não um efeito colateral
 * desta extração.
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
    // Ver o aviso no topo: não vêm do `taskSelect`.
    reminderAt: null,
    recurrence: "none",
    // Publicada na turma é estado da atividade, não campo editável solto.
    shareWithTurma: task.sharedActivityId !== null,
    ...overrides,
  };
}
