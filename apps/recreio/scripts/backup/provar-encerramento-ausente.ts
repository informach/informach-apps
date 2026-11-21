import { isDeepStrictEqual } from "node:util";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import type postgres from "postgres";
import {
  admitirEncerramentoHistoricoRecuperado,
  admitirEncerramentoNativoHistoricoRecuperado,
} from "../../src/features/direitos/admissao-recuperada-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { prepararEncerramentoAusenteRecuperado } from "../../src/features/direitos/encerramento-ausente-recuperado-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import {
  criarProcessadorFinanceiroRecuperado,
  type RuntimeFinanceiroDoEncerramento,
} from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import {
  verificarEncerramentoHistoricoRecuperado,
  verificarEncerramentoNativoRecuperado,
} from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { criarInventarioFinanceiroDeProva } from "./inventario-financeiro-prova";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Consent truly issued after capture, to a pre-existing zero-player account.
 * Restored SQL has neither operation, preparation, participation nor finance.
 * The immutable external intent, not these coordinates, authorizes recovery. */
export async function provarEncerramentoAusente(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["posterior"],
) {
  return provarEncerramentoAusenteNoRuntime(copia, config, dado, () => {
    throw new Error("Missing no-customer closure must not compose Stripe");
  });
}
/** Existing synthetic customer was captured before the later native consent.
 * No global identity/customer/consent is synthesized by the restored worker. */
export async function provarEncerramentoAusenteComCliente(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["posteriorComCliente"],
) {
  const lerCliente = () =>
    copia.unsafe(
      `select to_jsonb(c) as cliente from billing.customers c where c.subject_type='user' and c.subject_id=$1 and c.app='recreio' and c.provider='stripe' and c.provider_customer_id=$2`,
      [dado.contaId, dado.clienteStripeId],
    );
  const cliente = await lerCliente();
  exigir(cliente.length === 1, "ENCERRAMENTO_AUSENTE_CLIENTE_DIVERGENTE");
  const http = await criarInventarioFinanceiroDeProva(dado);
  try {
    const resultado = await provarEncerramentoAusenteNoRuntime(
      copia,
      config,
      dado,
      () => ({ modo: "dev", inventario: http.inventario }),
      http,
    );
    const leituras = http.conferir();
    exigir(
      resultado.postCaptureClosureReplayed &&
        resultado.postCaptureClosureRecoveredOriginVerified &&
        isDeepStrictEqual(cliente, await lerCliente()),
      "ENCERRAMENTO_AUSENTE_CLIENTE_DIVERGENTE",
    );
    return {
      postCaptureCustomerClosureReplayed: true,
      postCaptureCustomerClosureSdkHttpVerified: true,
      postCaptureCustomerClosureProviderFailureRefused: true,
      postCaptureCustomerClosureRequiresCurrentFinance: true,
      postCaptureCustomerClosureOriginalConfirmationPreserved: true,
      postCaptureCustomerClosureCustomerNotManufactured: true,
      postCaptureCustomerClosureOtherFinancesAndIdentityPreserved: true,
      postCaptureCustomerClosureHttpReads: leituras,
    };
  } finally {
    await http.encerrar();
  }
}
async function provarEncerramentoAusenteNoRuntime(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["posterior"],
  runtime: () => RuntimeFinanceiroDoEncerramento,
  provedor?: Awaited<ReturnType<typeof criarInventarioFinanceiroDeProva>>,
) {
  const id = dado.operacaoId;
  const resultadoEsperado = provedor ? "provider_inventory" : "no_customer";
  const lerConfirmacao = () =>
    copia.unsafe(
      `select to_jsonb(f) as financeiro from recreio.account_closure_finances f where operation_id=$1::uuid`,
      [id],
    );
  let confirmacaoFinanceira: unknown;
  const lerAusencia = () =>
    copia.unsafe(
      `select
    exists(select 1 from recreio.rights_operations where id=$1::uuid) as operacao,
    exists(select 1 from recreio.rights_preparations where requester_user_id=$2) as preparacao,
    exists(select 1 from recreio.account_closure_finances where operation_id=$1::uuid) as financeiro,
    exists(select 1 from recreio.account_participations where user_id=$2) as participacao,
    exists(select 1 from core.users where id=$2) as identidade,
    exists(select 1 from recreio.native_pins where user_id=$2) as pin,
    (select jsonb_agg(to_jsonb(e)) from recreio.rights_recovery_evaluations e where e.run_id=$3 and e.operation_id=$1::uuid) as avaliacao`,
      [id, dado.contaId, config.execucaoId],
    );
  const lerOutros = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(u) order by id) from core.users u) as identidades,
    (select jsonb_agg(to_jsonb(c) order by id) from billing.customers c) as clientes,
    (select jsonb_agg(to_jsonb(p) order by id) from recreio.rights_preparations p) as preparacoes,
    (select jsonb_agg(to_jsonb(f) order by operation_id) from recreio.account_closure_finances f where operation_id<>$1::uuid) as financeiros,
    (select jsonb_agg(to_jsonb(o) order by id) from recreio.rights_operations o where id<>$1::uuid) as operacoes,
    (select jsonb_agg(to_jsonb(p) order by user_id) from recreio.account_participations p where user_id<>$2) as participacoes`,
      [id, dado.contaId],
    );
  const ausente = await lerAusencia(),
    outros = await lerOutros();
  const [inicial] = ausente;
  exigir(
    inicial &&
      !inicial.operacao &&
      !inicial.preparacao &&
      !inicial.financeiro &&
      !inicial.participacao &&
      inicial.identidade &&
      inicial.pin,
    "ENCERRAMENTO_AUSENTE_DIVERGENTE",
  );
  async function recusada(
    executar: () => Promise<unknown>,
    code: "DIREITOS_LIVRO" | "DIREITOS_INTEGRIDADE" | "DIREITOS_DEPENDENCIA",
  ) {
    let recusou = false;
    try {
      await executar();
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== code) throw e;
      recusou = true;
    }
    exigir(recusou, "ENCERRAMENTO_AUSENTE_DIVERGENTE");
  }
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        await recusada(
          () => prepararEncerramentoAusenteRecuperado({ ...pai }, id),
          "DIREITOS_LIVRO",
        );
        await recusada(
          () => admitirEncerramentoNativoHistoricoRecuperado(pai, id),
          "DIREITOS_INTEGRIDADE",
        );
        const [livre] = await copia.unsafe<{ livre: boolean }[]>(
          `select to_regprocedure('audit.recusar_encerramento_ausente()') is null and not exists(select 1 from pg_trigger where tgname='recusar_encerramento_ausente') as livre`,
        );
        exigir(livre?.livre, "ENCERRAMENTO_AUSENTE_DIVERGENTE");
        await copia.begin(async (tx) => {
          await tx.unsafe(
            `create function audit.recusar_encerramento_ausente() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_historical_admitted' then raise exception using errcode='P7782',message='Synthetic missing closure audit failure'; end if; return new; end $$`,
          );
          await tx.unsafe(
            `create trigger recusar_encerramento_ausente before insert on audit.events for each row execute function audit.recusar_encerramento_ausente()`,
          );
        });
        try {
          let recusou = false;
          try {
            await prepararEncerramentoAusenteRecuperado(pai, id);
          } catch (erro) {
            let atual: unknown = erro;
            for (let n = 0; n < 8; n++) {
              if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7782") {
                recusou = true;
                break;
              }
              if (!(atual instanceof Error) || !atual.cause) break;
              atual = atual.cause;
            }
            if (!recusou) throw erro;
          }
          exigir(
            recusou &&
              isDeepStrictEqual(ausente, await lerAusencia()) &&
              isDeepStrictEqual(outros, await lerOutros()),
            "ENCERRAMENTO_AUSENTE_DIVERGENTE",
          );
        } finally {
          await copia.begin(async (tx) => {
            await tx.unsafe(`drop trigger recusar_encerramento_ausente on audit.events`);
            await tx.unsafe(`drop function audit.recusar_encerramento_ausente()`);
          });
        }
        const primeira = await prepararEncerramentoAusenteRecuperado(pai, id),
          preparada = await lerAusencia();
        const segunda = await prepararEncerramentoAusenteRecuperado(pai, id);
        exigir(
          !primeira.jaPreparada &&
            !primeira.dadosAdmitidos &&
            segunda.jaPreparada &&
            isDeepStrictEqual(preparada, await lerAusencia()),
          "ENCERRAMENTO_AUSENTE_DIVERGENTE",
        );
        await recusada(
          () => admitirEncerramentoHistoricoRecuperado(pai, id),
          "DIREITOS_INTEGRIDADE",
        );
        await recusada(
          () =>
            comOperacaoPrivadaDeDireitos(pai, id, async () => {
              throw new Error("Pending recovered finance admitted data");
            }),
          "DIREITOS_INTEGRIDADE",
        );
        await comFinanceiroPrivadoDeEncerramento(pai, id, async (financeira) => {
          const processar = criarProcessadorFinanceiroRecuperado(financeira, runtime);
          exigir(
            (await processar()).situacao === "confirmada" &&
              (await processar()).situacao === "ociosa",
            "ENCERRAMENTO_AUSENTE_DIVERGENTE",
          );
          confirmacaoFinanceira = await lerConfirmacao();
          exigir(
            (await avaliarFinanceiroConfirmadoRecuperado(financeira, runtime)).resultado ===
              resultadoEsperado,
            "ENCERRAMENTO_AUSENTE_DIVERGENTE",
          );
          if (provedor) {
            provedor.cenario("indisponivel");
            let recusou = false;
            try {
              await avaliarFinanceiroConfirmadoRecuperado(financeira, runtime);
            } catch (e) {
              if (!(e instanceof RecreioRenewalReviewError) || e.code !== "provider_unavailable")
                throw e;
              recusou = true;
            }
            const [revisao] = await copia.unsafe<{ valida: boolean }[]>(
              `select state='review' and receipt_sha256 is null and review_code='provider_unavailable' as valida from recreio.rights_recovery_finances where run_id=$1 and operation_id=$2::uuid`,
              [config.execucaoId, id],
            );
            exigir(
              recusou &&
                revisao?.valida &&
                isDeepStrictEqual(confirmacaoFinanceira, await lerConfirmacao()),
              "ENCERRAMENTO_AUSENTE_CLIENTE_DIVERGENTE",
            );
          }
        });
        if (provedor) {
          await recusada(
            () => admitirEncerramentoHistoricoRecuperado(pai, id),
            "DIREITOS_INTEGRIDADE",
          );
          provedor.cenario("ok");
          await comFinanceiroPrivadoDeEncerramento(pai, id, async (financeira) => {
            exigir(
              (await avaliarFinanceiroConfirmadoRecuperado(financeira, runtime)).resultado ===
                resultadoEsperado,
              "ENCERRAMENTO_AUSENTE_CLIENTE_DIVERGENTE",
            );
          });
        }
        exigir(
          (await admitirEncerramentoHistoricoRecuperado(pai, id)).situacao === "existente",
          "ENCERRAMENTO_AUSENTE_DIVERGENTE",
        );
        await comOperacaoPrivadaDeDireitos(pai, id, async (filha) => {
          const lote = await concluirProximoEncerramento(filha);
          exigir(
            lote.situacao === "dados_da_conta_retirados" &&
              lote.dominio === "pin_conta" &&
              lote.quantidade === 1 &&
              (await concluirProximoEncerramento(filha)).situacao === "conta_encerrada",
            "ENCERRAMENTO_AUSENTE_DIVERGENTE",
          );
        });
        await recusada(
          () => verificarEncerramentoNativoRecuperado(pai, id),
          "DIREITOS_DEPENDENCIA",
        );
        exigir(
          !(await verificarEncerramentoHistoricoRecuperado(pai, id)).jaVerificada &&
            (await verificarEncerramentoHistoricoRecuperado(pai, id)).jaVerificada,
          "ENCERRAMENTO_AUSENTE_DIVERGENTE",
        );
      },
    }),
  );
  const [fim] = await copia.unsafe<{ valida: boolean }[]>(
    `select o.state='completed' and o.preparation_id is null and o.recovery_source_id=o.id and f.created_at>o.consented_at and f.created_at>=s.imported_at and f.state='confirmed' and f.attempts=1 and f.result=$4 and p.state='closed' and p.revision=3 and p.closed_at=o.completed_at and e.origin='recovered' and e.state='verified' and o.signed_intent is not null and o.intent_sha256=e.intent_sha256 and o.authenticated_at<=o.consented_at
    and not exists(select 1 from recreio.rights_preparations where requester_user_id=$2)
    and not exists(select 1 from recreio.native_pins where user_id=$2)
    and not exists(select 1 from audit.events a where a.actor_id=$2 and a.event_type='recreio.rights_consented')
    and (select count(*) from audit.events a where a.event_type='recreio.rights_historical_admitted' and a.payload->>'operationId'=o.id::text)=1
    as valida from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id join recreio.account_participations p on p.operation_id=o.id join recreio.rights_recovery_sources s on s.operation_id=o.id join recreio.rights_recovery_evaluations e on e.operation_id=o.id and e.run_id=$3 where o.id=$1::uuid and o.requester_user_id=$2`,
    [id, dado.contaId, config.execucaoId, resultadoEsperado],
  );
  exigir(
    fim?.valida &&
      isDeepStrictEqual(outros, await lerOutros()) &&
      isDeepStrictEqual(confirmacaoFinanceira, await lerConfirmacao()),
    "ENCERRAMENTO_AUSENTE_DIVERGENTE",
  );
  return {
    postCaptureClosureReplayed: true,
    postCaptureClosureAuditRollback: true,
    postCaptureClosurePreparationRetryIdempotent: true,
    postCaptureClosureRequiresCurrentFinance: true,
    postCaptureClosureFinancialBirthNotBackdated: true,
    postCaptureClosureHistoricalConsentOnly: true,
    postCaptureClosureOriginalIdentityAndOtherFinancesPreserved: true,
    postCaptureClosureRecoveredOriginVerified: true,
    postCaptureClosureNativeVerificationRefused: true,
  };
}
