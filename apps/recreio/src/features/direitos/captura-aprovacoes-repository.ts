import "server-only";
import { sql } from "@informach/db";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

/** Own authored decisions, not present guardianship or authority over a world.
 * Return only the actor's historical references and dates. No other actor,
 * recipient, name, generation, bearer code or content enters the projection. */
export async function copiarAprovacoesPessoaisNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  let apos: string | null = null;
  while (true) {
    // Fixed source/field list; pagination and authorization are applied inside
    // each source before the bounded merge, not just in the final UI.
    const linhas: { cursor: string; dados: unknown }[] = await tx.execute<{
      cursor: string;
      dados: unknown;
    }>(sql`
      with fontes as (
        (select 'amizade:'||request_id::text||':'||profile_id::text collate "C" as cursor,
          jsonb_build_object('ato','aprovar_amizade','solicitacaoReferencia',request_id,'perfilReferencia',profile_id,'registradaEm',created_at) as dados
          from recreio.friend_consents where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('amizade:'||request_id::text||':'||profile_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
        union all
        (select 'convite_mundo:'||invite_id::text||':'||profile_id::text collate "C" as cursor,
          jsonb_build_object('ato','aprovar_convite_mundo','solicitacaoReferencia',invite_id,'perfilReferencia',profile_id,'registradaEm',created_at) as dados
          from recreio.directed_invite_guardian_approvals where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('convite_mundo:'||invite_id::text||':'||profile_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
        union all
        (select 'convite_visita:'||invite_id::text||':'||profile_id::text collate "C" as cursor,
          jsonb_build_object('ato','aprovar_visita','solicitacaoReferencia',invite_id,'perfilReferencia',profile_id,'registradaEm',created_at) as dados
          from recreio.visit_invite_guardian_approvals where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('convite_visita:'||invite_id::text||':'||profile_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
        union all
        (select 'gestao_convite:'||invite_id::text collate "C" as cursor,
          jsonb_build_object('ato','autorizar_convite_no_mundo','solicitacaoReferencia',invite_id,'mundoReferencia',space_id,'registradaEm',created_at) as dados
          from recreio.directed_invite_world_approvals where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('gestao_convite:'||invite_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
        union all
        (select 'gestao_visita:'||invite_id::text collate "C" as cursor,
          jsonb_build_object('ato','autorizar_visita_no_mundo','solicitacaoReferencia',invite_id,'mundoReferencia',space_id,'registradaEm',created_at) as dados
          from recreio.visit_invite_world_approvals where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('gestao_visita:'||invite_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
        union all
        (select 'sucessao:'||request_id::text collate "C" as cursor,
          jsonb_build_object('ato','propor_sucessao_do_menor','solicitacaoReferencia',request_id,'perfilReferencia',profile_id,'registradaEm',created_at) as dados
          from recreio.stewardship_guardian_approvals where approved_by_user_id=${contaId}
          and (${apos}::text is null or ('sucessao:'||request_id::text) collate "C">${apos}::text collate "C")
          order by cursor limit ${limites.pagina})
      ) select cursor,dados from fontes order by cursor limit ${limites.pagina}
    `);
    for (const { cursor, dados } of linhas) {
      assertAllowed(
        apos === null || cursor > apos,
        "INTEGRIDADE",
        "Não foi possível preparar a cópia.",
      );
      arquivo.adicionar("aprovacao_propria", dados);
      apos = cursor;
    }
    await conferirPrazo();
    if (linhas.length < limites.pagina) return;
  }
}
