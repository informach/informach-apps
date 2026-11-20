import "server-only";
import { and, eq, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

/** Original personal decision receipts, even when the live profile no longer
 * exists. Authorship is not current guardianship or a right to read another
 * person's current profile. The caller owns the consistent authorized TX. */
export async function copiarTratamentoPessoalNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  type Linha = {
    operacaoReferencia: string;
    perfilReferencia: string;
    fase: string;
    minimizadoEm: Date | null;
    retidoAte: Date | null;
    concluidoEm: Date | null;
    politicaDeRetencao: string | null;
  };
  let ultimo: { operacao: string; perfil: string; chave: string } | null = null;
  while (true) {
    const linhas: Linha[] = await tx
      .select({
        operacaoReferencia: subjects.operationId,
        perfilReferencia: subjects.profileReference,
        fase: subjects.phase,
        minimizadoEm: subjects.minimizedAt,
        retidoAte: subjects.retainedUntil,
        concluidoEm: subjects.completedAt,
        politicaDeRetencao: subjects.retentionPolicyVersion,
      })
      .from(subjects)
      .innerJoin(operations, eq(operations.id, subjects.operationId))
      .where(
        and(
          eq(operations.requesterUserId, contaId),
          ultimo
            ? sql`(${subjects.operationId},${subjects.profileReference})>(${ultimo.operacao}::uuid,${ultimo.perfil}::uuid)`
            : undefined,
        ),
      )
      .orderBy(subjects.operationId, subjects.profileReference)
      .limit(limites.pagina);
    for (const linha of linhas) {
      const chave = `${linha.operacaoReferencia}:${linha.perfilReferencia}`;
      assertAllowed(
        ultimo === null || chave > ultimo.chave,
        "INTEGRIDADE",
        "Não foi possível preparar a cópia.",
      );
      arquivo.adicionar("tratamento_perfil", linha);
      ultimo = { operacao: linha.operacaoReferencia, perfil: linha.perfilReferencia, chave };
    }
    await conferirPrazo();
    if (linhas.length < limites.pagina) return;
  }
}
