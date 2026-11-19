import "server-only";
import { isDeepStrictEqual } from "node:util";
import type { recreioRightsOperations, recreioRightsPreparations } from "@informach/db/schema";
import { type criarAssinaturaDoLivro, resumoDoRegistro } from "./livro/assinatura";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";
import { lerPlanoDeDireitos } from "./preparacao-repository";

/** Verifica a cópia nativa contra os bytes assinados e a seleção imutável.
 * Publicação e execução usam o mesmo contrato; não confiam apenas no state. */
export function conferirIntencaoNativa(
  atual: typeof recreioRightsOperations.$inferSelect,
  preparacao: typeof recreioRightsPreparations.$inferSelect | undefined,
  selecionados: readonly { id: string }[],
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  mundos: readonly { id: string; jogo: string }[],
) {
  if (!preparacao || resumoDoRegistro(atual.signedIntent) !== atual.intentSha256)
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  const plano = lerPlanoDeDireitos(preparacao, atual.requesterUserId);
  const { documento: doc, chaveId } = assinatura.lerIntencaoAssinada(atual.signedIntent);
  if (
    chaveId !== atual.signingKeyId ||
    !isDeepStrictEqual(doc, {
      formato: "recreio-intencao-direitos-v1",
      livroId: atual.ledgerId,
      operacaoId: atual.id,
      revisao: atual.revision,
      epoca: atual.ledgerEpoch,
      tipo: atual.kind,
      contaId: atual.requesterUserId,
      perfilIds: plano.perfis.map((p) => p.id),
      planoSha256: atual.planSha256,
      consentidaEm: atual.consentedAt.toISOString(),
      autenticadaEm: atual.authenticatedAt.toISOString(),
      fonte: atual.source,
    }) ||
    plano.tipo !== atual.kind ||
    plano.contaId !== atual.requesterUserId ||
    preparacao.id !== atual.preparationId ||
    preparacao.planSha256 !== atual.planSha256 ||
    !isDeepStrictEqual(
      selecionados.map((p) => p.id),
      doc.perfilIds,
    ) ||
    !isDeepStrictEqual(
      plano.mundos.map((m) => ({ id: m.id, jogo: m.jogo })),
      mundos,
    )
  )
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  return { plano, intencao: doc };
}
