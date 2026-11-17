import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { FamilyError } from "@informach/family";
import type { z } from "zod";
import type { AgendaAuthority } from "@/features/family/authority";
import { recordProductEvent } from "@/features/metrics/events";
import { taskToActionInput } from "@/features/unified-activities/edit-defaults";
import { findTaskForUser } from "@/features/unified-activities/task-repository";
import type {
  confirmNoticeSchema,
  discardDraftActionSchema,
  discardNoticeSchema,
  shareSavedWithTurmaSchema,
  statusNoticeActionSchema,
  updateNoticeActionSchema,
} from "./schemas";
import {
  discardDraftActionAtomically,
  discardNoticeAtomically,
  insertConfirmedNotice,
  loadNoticeDraft,
  setNoticeActionStatusAtomically,
  updateNoticeActionAtomically,
} from "./write-repository";

export async function getNoticeDraft(actor: AgendaAuthority, noticeId: string) {
  try {
    return await loadNoticeDraft(actor, noticeId);
  } catch (error) {
    if (error instanceof FamilyError) return null;
    throw error;
  }
}
export async function discardDraftAction(
  actor: AgendaAuthority,
  input: z.infer<typeof discardDraftActionSchema>,
) {
  const result = await guarded(() => discardDraftActionAtomically(actor, input));
  if (result.ok) await recordProductEvent(actor.userId, { event: "draft_action_discarded" });
  return result;
}
export async function discardNotice(
  actor: AgendaAuthority,
  input: z.infer<typeof discardNoticeSchema>,
) {
  const result = await guarded(() => discardNoticeAtomically(actor, input));
  if (result.ok) await recordProductEvent(actor.userId, { event: "draft_discarded" });
  return result;
}

export async function confirmNotice(
  actor: AgendaAuthority,
  input: z.infer<typeof confirmNoticeSchema>,
) {
  return guarded(() => insertConfirmedNotice(actor, input));
}
export async function updateNoticeAction(
  actor: AgendaAuthority,
  input: z.infer<typeof updateNoticeActionSchema>,
) {
  return guarded(() => updateNoticeActionAtomically(actor, input));
}

/**
 * "Mandar para a turma", no "Pronto" do recado: publica na turma as atividades
 * que acabaram de ser salvas.
 *
 * A revisão não decide mais isso caixa a caixa; a pergunta vem depois, uma vez,
 * como no canvas. Cada atividade passa pela MESMA gravação da edição
 * (`updateNoticeAction`, com `shareWithTurma` ligado e o resto como está), e é
 * ela que exige Pro, matéria da turma e prazo. O que não pode ir (sem matéria
 * da turma, sem data, já publicada, de outra família) fica de fora e é contado.
 */
export async function shareSavedWithTurma(
  actor: AgendaAuthority,
  input: z.infer<typeof shareSavedWithTurmaSchema>,
) {
  let shared = 0;
  let skipped = 0;
  for (const id of new Set(input.ids)) {
    const task = await findTaskForUser(actor, id);
    if (
      !task ||
      task.status === "canceled" ||
      task.sharedActivityId ||
      !task.subjectId ||
      !task.dueAt ||
      // Só vai para a turma o prazo que veio da escola: o que a família ou o
      // horário marcaram vale só para esta casa.
      (task.dateOrigin !== "school" && task.dateOrigin !== "relative")
    ) {
      skipped += 1;
      continue;
    }
    const result = await updateNoticeAction(actor, {
      id,
      version: task.version,
      action: { ...taskToActionInput(task), shareWithTurma: true },
    });
    if (result.ok) shared += 1;
    else if (result.error.code === "SHARE_REQUIRES_PRO") return result;
    else skipped += 1;
  }
  return ok({ shared, skipped });
}

export async function setNoticeActionStatus(
  actor: AgendaAuthority,
  input: z.infer<typeof statusNoticeActionSchema>,
) {
  return guarded(() => setNoticeActionStatusAtomically(actor, input));
}

async function guarded<T>(work: () => Promise<T>) {
  try {
    return await work();
  } catch (error) {
    if (error instanceof FamilyError)
      return err({
        code:
          error.code === "CAPACITY_EXCEEDED"
            ? ("PROFILE_LIMIT_REACHED" as const)
            : ("NOT_FOUND" as const),
      });
    throw error;
  }
}
