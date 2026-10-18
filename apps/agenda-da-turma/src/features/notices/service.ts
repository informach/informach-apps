import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import type { z } from "zod";
import { findAccessibleProfile } from "@/features/family/access";
import { recordProductEvent } from "@/features/metrics/events";
import { taskToActionInput } from "@/features/unified-activities/edit-defaults";
import { findTaskForUser } from "@/features/unified-activities/task-repository";
import { billing } from "@/lib/billing";
import { getNoticeAction } from "./repository";
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

export async function getNoticeDraft(userId: string, noticeId: string) {
  return loadNoticeDraft(userId, noticeId);
}
export async function discardDraftAction(
  userId: string,
  input: z.infer<typeof discardDraftActionSchema>,
) {
  const result = await discardDraftActionAtomically(userId, input);
  if (result.ok) await recordProductEvent(userId, { event: "draft_action_discarded" });
  return result;
}
export async function discardNotice(userId: string, input: z.infer<typeof discardNoticeSchema>) {
  const result = await discardNoticeAtomically(userId, input);
  if (result.ok) await recordProductEvent(userId, { event: "draft_discarded" });
  return result;
}

export async function confirmNotice(userId: string, input: z.infer<typeof confirmNoticeSchema>) {
  const first = input.actions[0];
  if (!first) return err({ code: "INVALID_INPUT" } as const);
  const profile = await findAccessibleProfile(userId, first.profileId);
  if (!profile) return err({ code: "INVALID_PROFILE" } as const);
  const isPro = await billing.hasProSubscription({ type: "user", id: profile.userId });
  return insertConfirmedNotice(userId, input, profile.userId, isPro);
}
export async function updateNoticeAction(
  userId: string,
  input: z.infer<typeof updateNoticeActionSchema>,
) {
  const found = await getNoticeAction(userId, input.id);
  if (!found) return err({ code: "NOT_FOUND" } as const);
  const isPro = await billing.hasProSubscription({ type: "user", id: found.ownerUserId });
  return updateNoticeActionAtomically(userId, input, found.ownerUserId, isPro);
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
  userId: string,
  input: z.infer<typeof shareSavedWithTurmaSchema>,
) {
  let shared = 0;
  let skipped = 0;
  for (const id of new Set(input.ids)) {
    const task = await findTaskForUser(userId, id);
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
    const result = await updateNoticeAction(userId, {
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

/**
 * De quem é a atividade, e se a casa é Pro.
 *
 * Exportado porque a rota de status da fila offline precisa exatamente disto
 * antes de gravar. Duas resoluções de titular e de plano divergiriam na
 * primeira vez que o entitlement mudasse, e a gravação da fila passaria a
 * aplicar um limite diferente do da tela.
 */
export async function resolveTaskWriteContext(userId: string, taskId: string) {
  const found = await getNoticeAction(userId, taskId);
  if (!found) return null;
  return {
    ownerId: found.ownerUserId,
    isPro: await billing.hasProSubscription({ type: "user", id: found.ownerUserId }),
  };
}

export async function setNoticeActionStatus(
  userId: string,
  input: z.infer<typeof statusNoticeActionSchema>,
) {
  const context = await resolveTaskWriteContext(userId, input.id);
  if (!context) return err({ code: "NOT_FOUND" } as const);
  return setNoticeActionStatusAtomically(userId, input, context.ownerId, context.isPro);
}
