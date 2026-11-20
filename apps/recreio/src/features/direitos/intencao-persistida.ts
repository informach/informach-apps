import { isDeepStrictEqual } from "node:util";
import type { recreioRightsOperations } from "@informach/db/schema";
import { type criarAssinaturaDoLivro, resumoDoRegistro } from "./livro/assinatura";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";
import { resumirPlanoDeDireitos } from "./plano-persistido";
import type { PlanoDeDireitos } from "./preparacao-contrato";

/** The same signed decision in both interactive and historical provenance.
 * This authenticates stored bytes and exact scope; it grants no authority to
 * import, freeze, erase, charge, complete a recovery or reopen traffic. */
export function conferirIntencaoDoPlano(
  atual: typeof recreioRightsOperations.$inferSelect,
  plano: PlanoDeDireitos,
  selecionados: readonly { id: string }[],
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>,
  mundos: readonly { id: string; jogo: string }[],
) {
  if (resumoDoRegistro(atual.signedIntent) !== atual.intentSha256)
    throw new FalhaDoLivroDeDireitos("INTEGRIDADE");
  const { documento: doc, chaveId } = assinatura.lerIntencaoAssinada(atual.signedIntent);
  if (
    chaveId !== atual.signingKeyId ||
    resumirPlanoDeDireitos(plano) !== atual.planSha256 ||
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
