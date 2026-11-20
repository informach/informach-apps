import "server-only";
import { type SQLWrapper, sql } from "@informach/db";
import {
  recreioFriendConsents as amizades,
  recreioDirectedInviteGuardianApprovals as convites,
  recreioDirectedInviteWorldApprovals as gestaoConvites,
  recreioVisitInviteWorldApprovals as gestaoVisitas,
  recreioStewardshipGuardianApprovals as sucessoes,
  recreioVisitInviteGuardianApprovals as visitas,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

type Fonte = {
  tabela: SQLWrapper;
  autor: SQLWrapper;
  referencia: SQLWrapper;
  criadaEm: SQLWrapper;
  ato: string;
  contexto: { tipo: "perfil" | "mundo"; coluna: SQLWrapper };
};
// Closed server-owned list. Neither the browser nor the caller supplies SQL,
// table/column identifiers, an alternative author or an arbitrary source.
const FONTES: readonly Fonte[] = [
  {
    tabela: amizades,
    autor: amizades.approvedByUserId,
    referencia: amizades.requestId,
    criadaEm: amizades.createdAt,
    ato: "aprovar_amizade",
    contexto: { tipo: "perfil", coluna: amizades.profileId },
  },
  {
    tabela: convites,
    autor: convites.approvedByUserId,
    referencia: convites.inviteId,
    criadaEm: convites.createdAt,
    ato: "aprovar_convite_mundo",
    contexto: { tipo: "perfil", coluna: convites.profileId },
  },
  {
    tabela: visitas,
    autor: visitas.approvedByUserId,
    referencia: visitas.inviteId,
    criadaEm: visitas.createdAt,
    ato: "aprovar_visita",
    contexto: { tipo: "perfil", coluna: visitas.profileId },
  },
  {
    tabela: gestaoConvites,
    autor: gestaoConvites.approvedByUserId,
    referencia: gestaoConvites.inviteId,
    criadaEm: gestaoConvites.createdAt,
    ato: "autorizar_convite_no_mundo",
    contexto: { tipo: "mundo", coluna: gestaoConvites.spaceId },
  },
  {
    tabela: gestaoVisitas,
    autor: gestaoVisitas.approvedByUserId,
    referencia: gestaoVisitas.inviteId,
    criadaEm: gestaoVisitas.createdAt,
    ato: "autorizar_visita_no_mundo",
    contexto: { tipo: "mundo", coluna: gestaoVisitas.spaceId },
  },
  {
    tabela: sucessoes,
    autor: sucessoes.approvedByUserId,
    referencia: sucessoes.requestId,
    criadaEm: sucessoes.createdAt,
    ato: "propor_sucessao_do_menor",
    contexto: { tipo: "perfil", coluna: sucessoes.profileId },
  },
];

/** Own authored decisions, not present guardianship or authority over a world.
 * Only the actor's historical references/dates; no other actor, recipient,
 * name, generation, bearer code or content enters the projection. Each source
 * uses native UUID keyset/order after the author, matching its B-tree index. */
export async function copiarAprovacoesPessoaisNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  type Linha = { referencia: string; perfil: string | null; dados: unknown };
  for (const fonte of FONTES) {
    let ultimo: { referencia: string; perfil: string | null; chave: string } | null = null;
    const porPerfil = fonte.contexto.tipo === "perfil";
    while (true) {
      const intervalo =
        ultimo === null
          ? sql`true`
          : porPerfil
            ? sql`(${fonte.referencia},${fonte.contexto.coluna})>(${ultimo.referencia}::uuid,${ultimo.perfil}::uuid)`
            : sql`${fonte.referencia}>${ultimo.referencia}::uuid`;
      const linhas: Linha[] = await tx.execute<Linha>(sql`
        select ${fonte.referencia}::text as referencia,
          ${porPerfil ? sql`${fonte.contexto.coluna}::text` : sql`null::text`} as perfil,
          jsonb_build_object('ato',${fonte.ato}::text,'solicitacaoReferencia',${fonte.referencia},
            ${porPerfil ? "perfilReferencia" : "mundoReferencia"}::text,${fonte.contexto.coluna},
            'registradaEm',${fonte.criadaEm}) as dados
        from ${fonte.tabela} where ${fonte.autor}=${contaId} and ${intervalo}
        order by ${fonte.referencia}${porPerfil ? sql`,${fonte.contexto.coluna}` : sql``}
        limit ${limites.pagina}
      `);
      for (const linha of linhas) {
        const chave =
          linha.perfil === null ? linha.referencia : `${linha.referencia}:${linha.perfil}`;
        assertAllowed(
          porPerfil === (linha.perfil !== null) && (ultimo === null || chave > ultimo.chave),
          "INTEGRIDADE",
          "Não foi possível preparar a cópia.",
        );
        arquivo.adicionar("aprovacao_propria", linha.dados);
        ultimo = { referencia: linha.referencia, perfil: linha.perfil, chave };
      }
      await conferirPrazo();
      if (linhas.length < limites.pagina) break;
    }
  }
}
