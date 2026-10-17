import { z } from "zod";

/**
 * Os dois estados que a fila carrega.
 *
 * **Cancelar fica de fora de propósito.** Cancelar alcança a turma inteira —
 * `cancelPublishedActivity` desmarca a atividade nas outras famílias —, e essa
 * decisão não cabe numa repetição cega feita pelo aparelho horas depois. Só
 * concluir e reabrir sobrevivem à falta de rede.
 */
export const QUEUED_STATUSES = ["pending", "done"] as const;

/**
 * O corpo de `POST /api/tasks/[id]/status`.
 *
 * A atividade vem do caminho e a chave de idempotência vem do cabeçalho
 * `Idempotency-Key` — o corpo carrega só a decisão. `version` continua
 * obrigatório: a fila não dispensa a concorrência otimista, ela a leva junto.
 */
export const taskStatusBodySchema = z.object({
  version: z.number().int().positive(),
  status: z.enum(QUEUED_STATUSES),
});

/**
 * O que ficou guardado como recibo de uma gravação.
 *
 * Vem de uma coluna `jsonb`, então é lido com o mesmo rigor de uma entrada
 * externa: um recibo ilegível vale menos que nenhum, porque devolveria ao
 * aparelho uma resposta que ninguém escreveu.
 */
export const writeReceiptSchema = z.union([
  z.object({
    ok: z.literal(true),
    // Opcional: recibos gravados antes de a versão voltar na resposta
    // continuam legíveis, e quem os recebe busca a versão no próximo refresh.
    value: z.object({ id: z.string(), version: z.number().int().positive().optional() }),
  }),
  z.object({ ok: z.literal(false), error: z.object({ code: z.string() }) }),
]);

export type WriteReceipt = z.infer<typeof writeReceiptSchema>;
