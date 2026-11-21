import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { criarProcessadorDeRenovacaoRecuperada } from "../../src/features/cobranca/renovacao-execucao-service";
import { admitirEncerramentoNativoHistoricoRecuperado } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import { criarProcessadorFinanceiroRecuperado } from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { verificarEncerramentoNativoRecuperado } from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { criarContratoFinanceiroDeProva } from "./contrato-financeiro-prova";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Actual native consent and paid-period fixtures were captured first. The
 * restored worker may only reduce this original contract, never create paid
 * facts, access authority or a browser identity. Remote state is closed HTTP. */
export async function provarEncerramentoComContrato(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["comContrato"],
) {
  const lerPreservados = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(u) order by id) from core.users u) as identidades,
    (select jsonb_agg(to_jsonb(c) order by id) from billing.customers c) as clientes,
    (select jsonb_agg(to_jsonb(s) order by id) from billing.subscriptions s) as assinaturas,
    (select jsonb_agg(to_jsonb(p) order by id) from billing.subscription_payment_periods p) as periodos,
    (select jsonb_agg(to_jsonb(c) order by subscription_id) from recreio.billing_contracts c) as contratos,
    (select jsonb_agg(to_jsonb(f) order by operation_id) from recreio.account_closure_finances f where operation_id<>$1::uuid) as outros_financeiros,
    (select jsonb_agg(to_jsonb(c) order by id) from recreio.renewal_cancellations c where payer_user_id<>$2) as outros_cancelamentos`,
      [dado.operacaoId, dado.contaId],
    );
  const preservados = await lerPreservados();
  const [origem] = await copia.unsafe<{ valida: boolean }[]>(
    `select
    o.kind='encerrar_conta' and o.preparation_id is not null and o.recovery_source_id is null
    and o.state='admitted' and f.state='pending' and f.created_at=o.consented_at
    and f.provider_customer_id=$3 and p.state='closing' and p.revision=2
    and exists(select 1 from billing.subscription_payment_periods x join billing.subscriptions s on s.id=x.subscription_id where s.provider_subscription_id=$4)
    and exists(select 1 from recreio.native_pins p where p.user_id=$2) as valida
    from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id
    join recreio.account_participations p on p.operation_id=o.id and p.user_id=o.requester_user_id
    where o.id=$1::uuid and o.requester_user_id=$2`,
    [dado.operacaoId, dado.contaId, dado.clienteStripeId, dado.assinaturaStripeId],
  );
  exigir(origem?.valida, "CONTRATO_NATIVO_DIVERGENTE");
  async function recusada(executar: () => Promise<unknown>, code: string) {
    let recusou = false;
    try {
      await executar();
    } catch (erro) {
      if (!(erro instanceof AppError) || erro.code !== code) throw erro;
      recusou = true;
    }
    exigir(recusou, "CONTRATO_NATIVO_DIVERGENTE");
  }
  const http = await criarContratoFinanceiroDeProva(dado);
  let expirada: (() => Promise<unknown>) | undefined;
  try {
    const deps = {
      modo: "dev" as const,
      obterRuntime: () => ({ modo: "dev" as const, renovacoes: http.renovacoes }),
      relatarFalha: () => {},
    };
    const runtime = () => ({ modo: "dev" as const, inventario: http.inventario });
    await comConexaoPrivadaDeDireitos(copia, (banco) =>
      comCoordenacaoPrivadaDeDireitos({
        ...config,
        banco,
        executar: async (pai) => {
          await recusada(
            async () => criarProcessadorDeRenovacaoRecuperada(pai, deps),
            "DIREITOS_LIVRO",
          );
          await recusada(
            () => admitirEncerramentoNativoHistoricoRecuperado(pai, dado.operacaoId),
            "DIREITOS_INTEGRIDADE",
          );
          await comFinanceiroPrivadoDeEncerramento(pai, dado.operacaoId, async (financeira) => {
            await recusada(
              async () => criarProcessadorDeRenovacaoRecuperada({ ...financeira }, deps),
              "DIREITOS_LIVRO",
            );
            const financeiro = criarProcessadorFinanceiroRecuperado(financeira, runtime);
            exigir(
              (await financeiro()).situacao === "aguardando_renovacao",
              "CONTRATO_NATIVO_DIVERGENTE",
            );
            const [cancelamento] = await copia.unsafe<{ id: string; valida: boolean }[]>(
              `select c.id,
            c.state='accepted' and c.initiator='account_closure' and c.source=o.source
            and c.authenticated_at=o.authenticated_at and c.accepted_at=o.consented_at
            and c.provider_subscription_id=$3 and f.state='waiting' and f.next_attempt_at>statement_timestamp() as valida
            from recreio.renewal_cancellations c join recreio.rights_operations o on o.id=c.closure_operation_id
            join recreio.account_closure_finances f on f.operation_id=o.id
            where c.closure_operation_id=$1::uuid and c.payer_user_id=$2`,
              [dado.operacaoId, dado.contaId, dado.assinaturaStripeId],
            );
            exigir(cancelamento?.valida, "CONTRATO_NATIVO_DIVERGENTE");
            http.admitirCancelamento(cancelamento.id);
            const cancelar = criarProcessadorDeRenovacaoRecuperada(financeira, deps);
            expirada = cancelar;
            const r = await cancelar();
            exigir(
              r.reservadas === 1 &&
                r.confirmadas === 1 &&
                r.emConferencia === 0 &&
                r.falhasTecnicas === 0,
              "CONTRATO_NATIVO_DIVERGENTE",
            );
            const [parada] = await copia.unsafe<{ valida: boolean }[]>(
              `select
            c.state='confirmed' and c.attempts=1 and c.provider_result='scheduled' and c.provider_stop_at>statement_timestamp()
            and c.observation_sha256 is not null and c.lease_token is null and c.lease_until is null
            and f.state='waiting' and f.next_attempt_at<=f.updated_at as valida
            from recreio.renewal_cancellations c join recreio.account_closure_finances f on f.operation_id=c.closure_operation_id
            where c.id=$1::uuid`,
              [cancelamento.id],
            );
            exigir(
              parada?.valida &&
                (await financeiro()).situacao === "confirmada" &&
                (await financeiro()).situacao === "ociosa" &&
                (await cancelar()).reservadas === 0,
              "CONTRATO_NATIVO_DIVERGENTE",
            );
            exigir(
              (await avaliarFinanceiroConfirmadoRecuperado(financeira, runtime)).resultado ===
                "provider_inventory",
              "CONTRATO_NATIVO_DIVERGENTE",
            );
          });
          exigir(
            (await admitirEncerramentoNativoHistoricoRecuperado(pai, dado.operacaoId)).situacao ===
              "existente_nativa",
            "CONTRATO_NATIVO_DIVERGENTE",
          );
          await comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async (filha) => {
            let concluiu = false,
              retirouPin = false;
            for (let n = 0; n < 24; n++) {
              const lote = await concluirProximoEncerramento(filha);
              if (lote.situacao === "conta_encerrada") {
                concluiu = true;
                break;
              }
              exigir(lote.situacao === "dados_da_conta_retirados", "CONTRATO_NATIVO_DIVERGENTE");
              retirouPin ||= lote.dominio === "pin_conta" && lote.quantidade === 1;
            }
            exigir(concluiu && retirouPin, "CONTRATO_NATIVO_DIVERGENTE");
          });
          await verificarEncerramentoNativoRecuperado(pai, dado.operacaoId);
        },
      }),
    );
    exigir(expirada, "CONTRATO_NATIVO_DIVERGENTE");
    await recusada(expirada, "DIREITOS_LIVRO");
    exigir(isDeepStrictEqual(preservados, await lerPreservados()), "CONTRATO_NATIVO_DIVERGENTE");
    const trafego = http.conferir();
    return {
      paidContractClosureReplayed: true,
      paidContractClosureSdkHttpVerified: true,
      paidContractClosurePrivateConnectionVerified: true,
      paidContractClosureScopeAndLifetimeVerified: true,
      paidContractClosureOriginalConsentPreserved: true,
      paidContractClosureWakeupAtomic: true,
      paidContractClosurePaidPeriodsAndOtherAccountsPreserved: true,
      paidContractClosureHttpReads: trafego.pedidos - trafego.escritas,
      paidContractClosureHttpWrites: trafego.escritas,
    };
  } finally {
    await http.encerrar();
  }
}
