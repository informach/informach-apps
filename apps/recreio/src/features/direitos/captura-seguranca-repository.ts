import "server-only";
import { and, eq, gt, or, sql } from "@informach/db";
import {
  recreioSafetyReports as reports,
  recreioRestrictionReviews as reviews,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

/** Recebe somente a fotografia/autorização já admitida pelo capturador.
 * Ser alvo nunca concede acesso à denúncia. Não exportar a outra ponta,
 * moderador, evidência, hashes ou chaves de repetição. A conta mantém acesso
 * aos próprios atos, inclusive depois de perder a responsabilidade/perfil. */
export async function copiarSegurancaPessoalNaTransacao(
  tx: Transacao,
  escopo: { contaId: string; perfilId: string | null },
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  async function paginas<T extends { cursor: string }>(
    tipo: string,
    buscar: (apos: string | null) => Promise<T[]>,
  ) {
    let apos: string | null = null;
    while (true) {
      const linhas = await buscar(apos);
      for (const { cursor, ...dados } of linhas) {
        assertAllowed(
          apos === null || cursor > apos,
          "INTEGRIDADE",
          "Não foi possível preparar a cópia.",
        );
        arquivo.adicionar(tipo, dados);
        apos = cursor;
      }
      await conferirPrazo();
      if (linhas.length < limites.pagina) return;
    }
  }
  await paginas("denuncia_propria", (apos) =>
    tx
      .select({
        cursor: reports.id,
        protocolo: reports.id,
        categoria: reports.category,
        situacao: reports.state,
        revisao: reports.revision,
        decisao: reports.decision,
        registradaPorMim: sql<boolean>`coalesce(${reports.actorUserId}=${escopo.contaId},false)`,
        recursoRegistradoPorMim: sql<boolean>`coalesce(${reports.reviewActorUserId}=${escopo.contaId},false)`,
        recebidaEm: reports.createdAt,
        atualizadaEm: reports.updatedAt,
        recursoEm: reports.reviewRequestedAt,
        encerradaEm: reports.closedAt,
        retidaAte: reports.expiresAt,
      })
      .from(reports)
      .where(
        and(
          escopo.perfilId !== null
            ? eq(reports.reporterProfileId, escopo.perfilId)
            : or(
                eq(reports.actorUserId, escopo.contaId),
                eq(reports.reviewActorUserId, escopo.contaId),
              ),
          apos ? gt(reports.id, apos) : undefined,
        ),
      )
      .orderBy(reports.id)
      .limit(limites.pagina),
  );
  await paginas("recurso_restricao", (apos) =>
    tx
      .select({
        cursor: reviews.id,
        protocolo: reviews.id,
        revisaoDaRestricao: reviews.restrictionRevision,
        situacao: reviews.state,
        decisao: reviews.decision,
        registradoPorMim: sql<boolean>`coalesce(${reviews.actorUserId}=${escopo.contaId},false)`,
        recebidoEm: reviews.createdAt,
        respondidoEm: reviews.resolvedAt,
        retidoAte: reviews.expiresAt,
      })
      .from(reviews)
      .where(
        and(
          escopo.perfilId !== null
            ? and(
                eq(reviews.profileId, escopo.perfilId),
                // Mesma projeção pessoal do acompanhamento: um pedido aberto
                // do perfil ou os atos deste adulto, sem identidade alheia.
                or(eq(reviews.state, "aberto"), eq(reviews.actorUserId, escopo.contaId)),
              )
            : eq(reviews.actorUserId, escopo.contaId),
          apos ? gt(reviews.id, apos) : undefined,
        ),
      )
      .orderBy(reviews.id)
      .limit(limites.pagina),
  );
}
