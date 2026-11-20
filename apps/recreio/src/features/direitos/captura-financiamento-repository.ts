import "server-only";
import { type SQLWrapper, sql } from "@informach/db";
import { z } from "zod";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type criarArquivoPessoal, LIMITES_DA_COPIA_PESSOAL as limites } from "./captura-contrato";

const LinhaSchema = z.strictObject({
  chave: z.array(z.string().min(1).max(256)).min(1).max(3),
  dados: z.record(z.string(), z.unknown()),
});
type Chave = string[];
function posterior(atual: Chave, anterior: Chave) {
  for (let i = 0; i < atual.length; i++) {
    const a = atual[i],
      b = anterior[i];
    if (a === undefined || b === undefined) return false;
    if (a !== b) return a > b;
  }
  return false;
}

/** Only the payer's native records, in the already authorized RR snapshot.
 * Fixed SQL projections; no provider calls, raw metadata, secret or authority.
 * Capture amounts are observations of a charge, never amounts allocated to a
 * period: the same charge can occur in several observations and is not summed. */
export async function copiarFinanciamentoPessoalNaTransacao(
  tx: Transacao,
  contaId: string,
  arquivo: ReturnType<typeof criarArquivoPessoal>,
  conferirPrazo: () => Promise<Date>,
) {
  const fontes: { tipo: string; consulta: (apos: Chave | null) => SQLWrapper }[] = [
    {
      tipo: "contrato_nativo",
      consulta: (apos) => sql`
      select array[c.subscription_id::text] as chave, jsonb_build_object(
        'assinaturaReferencia',c.subscription_id,'compraReferencia',c.purchase_id,
        'modo',c.provider_mode,'produtoOriginal',c.origin_product_id,
        'produtoAtual',c.current_product_id,'revisao',c.revision,
        'selecaoProcessadaEm',c.purchase_selection_processed_at,
        'trocaAtualReferencia',c.current_plan_change_id,'trocaAplicadaEm',c.current_plan_applied_at,
        'coberturaEmConferencia',c.coverage_review_required) as dados
      from recreio.billing_contracts c where c.payer_user_id=${contaId}
        ${apos ? sql`and c.subscription_id>${apos[0]}::uuid` : sql``}
      order by c.subscription_id limit ${limites.pagina}`,
    },
    {
      tipo: "conferencia_financeira",
      consulta: (apos) => sql`
      select array[r.provider_mode] as chave, jsonb_build_object(
        'modo',r.provider_mode,'criadaEm',r.created_at,'atualizadaEm',r.updated_at,
        'tentativaEm',r.last_attempt_at,'confirmadaEm',r.last_confirmed_at,
        'quantidadeTentativas',r.attempt_count,'precisaConferencia',r.review_required,
        'motivoConferencia',r.review_reason) as dados
      from recreio.billing_reconciliations r where r.payer_user_id=${contaId}
        ${apos ? sql`and r.provider_mode collate "C">${apos[0]} collate "C"` : sql``}
      order by r.provider_mode collate "C" limit ${limites.pagina}`,
    },
    {
      tipo: "observacao_financiamento",
      consulta: (apos) => sql`
      select array[o.id::text] as chave, jsonb_build_object(
        'observacaoReferencia',o.id,'periodoReferencia',o.payment_period_id,
        'assinaturaReferencia',o.subscription_id,'compraReferencia',o.purchase_id,
        'modo',o.provider_mode,'produtoOriginal',o.origin_product_id,
        'estado',o.funding_status,'financiadoAte',o.funded_until,
        'politica',o.policy_version,'primeiraObservacaoEm',o.first_observed_at,
        'observacaoAtual',coalesce(p.observation_id=o.id,false),'ultimaObservacaoAtualEm',
          case when p.observation_id=o.id then p.observed_at else null end) as dados
      from recreio.funding_observations o
      left join recreio.payment_funding p on p.payment_period_id=o.payment_period_id
      where o.payer_user_id=${contaId} ${apos ? sql`and o.id>${apos[0]}::uuid` : sql``}
      order by o.id limit ${limites.pagina}`,
    },
    {
      tipo: "captura_observada",
      consulta: (apos) => sql`
      select array[c.observation_id::text,c.provider_charge_id] as chave, jsonb_build_object(
        'observacaoReferencia',c.observation_id,'cobrancaReferencia',c.provider_charge_id,
        'valorCapturadoCentavos',c.amount_captured_cents,
        'valorEstornadoCentavos',c.amount_refunded_cents,'contestado',c.disputed) as dados
      from recreio.funding_captures c
      inner join recreio.funding_observations o on o.id=c.observation_id
      where o.payer_user_id=${contaId}
        ${
          apos
            ? sql`and (c.observation_id,c.provider_charge_id collate "C")>
          (${apos[0]}::uuid,${apos[1]} collate "C")`
            : sql``
        }
      order by c.observation_id,c.provider_charge_id collate "C" limit ${limites.pagina}`,
    },
    {
      tipo: "origem_financiamento",
      consulta: (apos) => sql`
      select array[s.observation_id::text,s.provider_charge_id,s.source_payment_period_id::text] as chave,
        jsonb_build_object('observacaoReferencia',s.observation_id,'cobrancaReferencia',s.provider_charge_id,
          'periodoOrigemReferencia',s.source_payment_period_id,
          'assinaturaOrigemReferencia',s.source_subscription_id,'compraOrigemReferencia',s.source_purchase_id,
          'produtoOriginal',s.source_origin_product_id,'modo',s.provider_mode) as dados
      from recreio.funding_source_periods s
      inner join recreio.funding_observations o on o.id=s.observation_id
      where s.payer_user_id=${contaId} and o.payer_user_id=${contaId}
        ${
          apos
            ? sql`and (s.observation_id,s.provider_charge_id collate "C",s.source_payment_period_id)>
          (${apos[0]}::uuid,${apos[1]} collate "C",${apos[2]}::uuid)`
            : sql``
        }
      order by s.observation_id,s.provider_charge_id collate "C",s.source_payment_period_id
      limit ${limites.pagina}`,
    },
  ];
  arquivo.adicionar("leitura_financiamento", {
    valoresDeCapturasPodemSeRepetirEntreObservacoes: true,
    valoresDeCapturasNaoRepresentamRateioPorPeriodo: true,
    totaisCalculados: false,
  });
  for (const fonte of fontes) {
    let apos: Chave | null = null;
    while (true) {
      const linhas: { chave: unknown; dados: unknown }[] = await tx.execute(fonte.consulta(apos));
      for (const bruta of linhas) {
        const { chave, dados } = LinhaSchema.parse(bruta);
        assertAllowed(
          apos === null || (apos.length === chave.length && posterior(chave, apos)),
          "INTEGRIDADE",
          "Não foi possível preparar a cópia.",
        );
        arquivo.adicionar(fonte.tipo, dados);
        apos = chave;
      }
      await conferirPrazo();
      if (linhas.length < limites.pagina) break;
    }
  }
}
