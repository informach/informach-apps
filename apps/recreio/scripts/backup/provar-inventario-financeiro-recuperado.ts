import { isDeepStrictEqual } from "node:util";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import type postgres from "postgres";
import {
  type CoordenacaoDeEfeitos,
  comFinanceiroPrivadoDeEncerramento,
} from "../../src/features/direitos/coordenacao-repository";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { criarInventarioFinanceiroDeProva } from "./inventario-financeiro-prova";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Real restored native customer/consent/confirmation, SDK and closed HTTP
 * provider. This tests current evidence, not live Stripe or real settlement. */
export async function provarInventarioFinanceiroRecuperado(
  pai: CoordenacaoDeEfeitos,
  copia: postgres.Sql,
  dado: RetiradaNativaDeProva["financeiro"]["provedor"],
) {
  const lerOriginais = () =>
    copia.unsafe(
      `select to_jsonb(o) as operacao,to_jsonb(p) as preparacao,to_jsonb(f) as financeiro,to_jsonb(c) as cliente
    from recreio.rights_operations o join recreio.rights_preparations p on p.id=o.preparation_id
    join recreio.account_closure_finances f on f.operation_id=o.id join billing.customers c on c.id=f.customer_id
    where o.id=$1 and o.requester_user_id=$2 and f.state='confirmed' and f.result='provider_inventory'
    and c.provider_customer_id=$3 and c.app='recreio' and c.subject_type='user' and c.subject_id=$2`,
      [dado.operacaoId, dado.contaId, dado.clienteStripeId],
    );
  const originais = await lerOriginais();
  exigir(originais.length === 1, "CONSENTIMENTO_NATIVO_DIVERGENTE");
  const http = await criarInventarioFinanceiroDeProva(dado);
  try {
    await comFinanceiroPrivadoDeEncerramento(pai, dado.operacaoId, async (filha) => {
      const runtime = () => ({ modo: "dev" as const, inventario: http.inventario });
      const conferir = () => avaliarFinanceiroConfirmadoRecuperado(filha, runtime);
      const primeira = await conferir(),
        segunda = await conferir();
      exigir(
        primeira.resultado === "provider_inventory" &&
          segunda.resultado === "provider_inventory" &&
          primeira.observacaoAtualSha256 !== null &&
          primeira.operacaoId === dado.operacaoId &&
          segunda.origemSha256 === primeira.origemSha256 &&
          primeira.observacaoOriginalSha256 === segunda.observacaoOriginalSha256,
        "CONSENTIMENTO_NATIVO_DIVERGENTE",
      );
      async function recusada(
        executar: () => Promise<unknown>,
        code: ConstructorParameters<typeof RecreioRenewalReviewError>[0],
      ) {
        let recusou = false;
        try {
          await executar();
        } catch (erro) {
          if (!(erro instanceof RecreioRenewalReviewError) || erro.code !== code) throw erro;
          recusou = true;
        }
        exigir(recusou, "INVENTARIO_FORA_DO_ESCOPO");
      }
      const cenarios = [
        ["indisponivel", "provider_unavailable"],
        ["outro_pagante", "foreign_contract"],
        ["outro_cliente", "foreign_contract"],
        ["live", "namespace_mismatch"],
        ["contrato_desconhecido", "foreign_contract"],
        ["pagina_incompleta", "invalid_evidence"],
        ["checkout_desconhecido", "foreign_contract"],
      ] as const;
      for (const [cenario, code] of cenarios) {
        http.cenario(cenario);
        await recusada(conferir, code);
      }
      http.cenario("ok");
      await recusada(
        () =>
          avaliarFinanceiroConfirmadoRecuperado(filha, () => ({
            modo: "prod",
            inventario: http.inventario,
          })),
        "namespace_mismatch",
      );
      await recusada(
        () =>
          avaliarFinanceiroConfirmadoRecuperado(filha, () => ({
            modo: "dev",
            inventario: {
              async inspect(scope) {
                return structuredClone(await http.inventario.inspect(scope));
              },
            },
          })),
        "invalid_evidence",
      );
      http.aposInventario(async () => {
        const alteradas = await copia.unsafe(
          `update billing.customers set provider_customer_id=$1 where app='recreio' and subject_type='user' and subject_id=$2 and provider_customer_id=$3 returning id`,
          [`${dado.clienteStripeId}_changed`, dado.contaId, dado.clienteStripeId],
        );
        exigir(alteradas.length === 1, "INVENTARIO_FORA_DO_ESCOPO");
      });
      try {
        await recusada(conferir, "scope_changed");
      } finally {
        http.aposInventario(undefined);
        await copia.unsafe(
          `update billing.customers set provider_customer_id=$1 where app='recreio' and subject_type='user' and subject_id=$2 and provider_customer_id=$3`,
          [dado.clienteStripeId, dado.contaId, `${dado.clienteStripeId}_changed`],
        );
      }
      const ultima = await conferir();
      exigir(ultima.resultado === "provider_inventory", "INVENTARIO_FORA_DO_ESCOPO");
    });
    exigir(isDeepStrictEqual(originais, await lerOriginais()), "CONSENTIMENTO_NATIVO_DIVERGENTE");
    return {
      nativeClosureFreshProviderSdkHttpVerified: true,
      nativeClosureFreshProviderFailureRefused: true,
      nativeClosureFreshProviderScopeMismatchRefused: true,
      nativeClosureFreshProviderIncompletePageRefused: true,
      nativeClosureFreshProviderCopiedEvidenceRefused: true,
      nativeClosureFreshProviderSourceRaceRefused: true,
      nativeClosureProviderOriginalConfirmationUnchanged: true,
      nativeClosureProviderReadRequests: http.conferir(),
      nativeClosureProviderRealStripeUsed: false,
    };
  } finally {
    await http.encerrar();
  }
}
