import { suggestDueDateFromSchedule } from "@/features/subjects/due-date-suggestion";
import { findClosestSubject } from "@/features/subjects/match-subject";
import type { SubjectOption } from "@/features/subjects/options-service";
import type { ExtractedAction, NoticeActionInput } from "./schemas";

/**
 * Uma ação lida pela IA vira um rascunho da revisão.
 *
 * É aqui — e só aqui — que a pista de matéria (`subjectHint`) vira vínculo:
 * casa com a matéria cadastrada da criança (exato, sinônimo ou erro de
 * digitação) e, quando a leitura não trouxe prazo, sugere a próxima aula pelo
 * horário. A IA continua devolvendo `dueAt: null` quando o recado não tem data;
 * o cálculo pela grade é determinístico e aparece no campo com a procedência
 * `schedule`, a um toque de ser alterado.
 *
 * Puro e sem `server-only`: roda no cliente (parse e retomada montam os
 * rascunhos ali) e em teste.
 */
export type ExtractionDraft = { value: NoticeActionInput; subjectHint: string | null };

export type DraftOptions = {
  /** Hoje em São Paulo, "YYYY-MM-DD". Injetável para teste. */
  todayIso?: string;
};

export function draftFromExtractedAction(
  action: ExtractedAction,
  profileId: string,
  subjectOptions: readonly SubjectOption[],
  options: DraftOptions = {},
): ExtractionDraft {
  const { subjectHint = null, ...fields } = action;
  const option = findClosestSubject(subjectOptions, subjectHint);
  let dueAt = fields.dueAt;
  let dateOrigin: NoticeActionInput["dateOrigin"] = fields.dateOrigin;
  if (option && !dueAt) {
    const suggestion = suggestDueDateFromSchedule(option, options.todayIso);
    if (suggestion) {
      dueAt = suggestion.dueAt;
      dateOrigin = "schedule";
    }
  }
  return {
    subjectHint,
    value: {
      ...fields,
      profileId,
      subjectId: option?.source === "turma" ? option.id : null,
      profileSubjectId: option?.source === "extra" ? option.id : null,
      dueAt,
      dateOrigin,
      assignedToUserId: null,
      reminderAt: null,
      recurrence: "none",
      // A IA não estima duração, pela mesma regra que a proíbe de inventar
      // prazo: quem sabe quanto tempo a criança leva é quem mora com ela.
      estimatedMinutes: null,
      // Publicar na turma é decisão de quem revisa, nunca da leitura.
      shareWithTurma: false,
    },
  };
}
