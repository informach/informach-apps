import "server-only";
import { err } from "@informach/auth/server-actions";
import { recordProductEvent } from "@/features/metrics/events";
import { resolveTaskWriteContext } from "@/features/notices/service";
import { applyTaskStatusOnce, findWriteReceipt } from "./repository";
import type { QUEUED_STATUSES, WriteReceipt } from "./schemas";

export type TaskStatusWriteInput = {
  key: string;
  id: string;
  version: number;
  status: (typeof QUEUED_STATUSES)[number];
  /** A gravação veio da fila do aparelho, e não de um toque com rede. */
  queued?: boolean;
};

/**
 * Concluir ou reabrir — uma vez só por chave.
 *
 * É o mesmo caminho do `setNoticeStatusAction`, e resolve titular e plano pela
 * mesma função (`resolveTaskWriteContext`), com duas diferenças: a chave de
 * idempotência, que deixa o aparelho repetir sem medo, e o fato de ser uma rota
 * HTTP. Server action não serve para fila: o identificador dela muda a cada
 * build, e a gravação que ficou guardada no aparelho na sexta-feira não teria
 * para onde ir na segunda.
 *
 * **O recibo é consultado antes da atividade.** Ele precisa sobreviver à
 * atividade que descreve; procurar a atividade primeiro faria a repetição de
 * uma gravação cuja atividade foi apagada responder "não encontrado" em vez de
 * devolver a resposta que a primeira tentativa já tinha recebido.
 */
export async function writeTaskStatusOnce(
  userId: string,
  input: TaskStatusWriteInput,
): Promise<WriteReceipt> {
  const stored = await findWriteReceipt(userId, input.key);
  if (stored.found) {
    if (stored.taskId !== input.id) return err({ code: "KEY_REUSED" } as const);
    if (stored.receipt) return stored.receipt;
  }
  const context = await resolveTaskWriteContext(userId, input.id);
  // Sem recibo: quem não foi encontrado agora não será encontrado depois, e a
  // resposta é a mesma em toda tentativa sem precisar de linha guardada.
  if (!context) return err({ code: "NOT_FOUND" } as const);
  const outcome = await applyTaskStatusOnce({
    key: input.key,
    userId,
    ownerId: context.ownerId,
    isPro: context.isPro,
    input: { id: input.id, version: input.version, status: input.status },
  });
  if ("conflictingTaskId" in outcome) return err({ code: "KEY_REUSED" } as const);
  if (input.queued && !outcome.replayed && outcome.result.ok)
    await recordProductEvent(userId, { event: "offline_queue_flushed", count: 1 });
  return outcome.result;
}
