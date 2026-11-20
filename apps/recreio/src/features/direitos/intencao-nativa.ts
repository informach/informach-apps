import "server-only";
import type { recreioRightsOperations, recreioRightsPreparations } from "@informach/db/schema";
import { conferirIntencaoDoPlano } from "./intencao-persistida";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";
import { lerPlanoDeDireitos } from "./plano-persistido";

/** Verifica a cópia nativa contra os bytes assinados e a seleção imutável.
 * Publicação e execução usam o mesmo contrato; não confiam apenas no state. */
export function conferirIntencaoNativa(
  atual: typeof recreioRightsOperations.$inferSelect,
  preparacao: typeof recreioRightsPreparations.$inferSelect | undefined,
  selecionados: readonly { id: string }[],
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  mundos: readonly { id: string; jogo: string }[],
) {
  if (
    !preparacao ||
    atual.preparationId === null ||
    atual.recoverySourceId !== null ||
    preparacao.id !== atual.preparationId ||
    preparacao.planSha256 !== atual.planSha256
  )
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  const plano = lerPlanoDeDireitos(preparacao, atual.requesterUserId);
  return conferirIntencaoDoPlano(atual, plano, selecionados, assinatura, mundos);
}
