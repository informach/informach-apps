import { isDeepStrictEqual } from "node:util";
import type { S3Client } from "@aws-sdk/client-s3";
import type { RecreioClosureInventory } from "@informach/billing/providers/stripe-recreio-closure-inventory";
import { RecreioRenewalReviewError } from "@informach/billing/providers/stripe-recreio-renewals";
import { eq, sql } from "@informach/db";
import {
  recreioRightsRecoveryFinances as assessments,
  recreioRightsOperations as operations,
} from "@informach/db/schema";
import type postgres from "postgres";
import { z } from "zod";
import { criarArquivoPessoal } from "../../src/features/direitos/captura-contrato";
import { copiarFinanciamentoPessoalNaTransacao } from "../../src/features/direitos/captura-financiamento-repository";
import {
  type CoordenacaoDeEfeitos,
  comFinanceiroPrivadoDeEncerramento,
  conferirIntencaoFinanceiraDaCoordenacao,
  dadosDaCoordenacaoPrivada,
} from "../../src/features/direitos/coordenacao-repository";
import {
  conferirFinanceiroAtualRecuperadoLocked,
  type SeloFinanceiroRecuperado,
} from "../../src/features/direitos/encerramento-financeiro-recuperado-guard";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { AppError } from "../../src/lib/errors";
import { criarInventarioFinanceiroDeProva } from "./inventario-financeiro-prova";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Real restored native customer/consent/confirmation, SDK and closed HTTP
 * provider. This tests current evidence, not live Stripe or real settlement. */
export async function provarInventarioFinanceiroRecuperado(
  pai: CoordenacaoDeEfeitos,
  copia: postgres.Sql,
  dado: RetiradaNativaDeProva["financeiro"]["provedor"],
  cliente: S3Client,
) {
  const privado = dadosDaCoordenacaoPrivada(pai);
  async function estadoAtual(estado: "attempted" | "current" | "review", motivo?: string) {
    const [r] = await copia.unsafe<
      {
        state: string;
        attempts: number;
        review_code: string | null;
        receipt_sha256: string | null;
        observed_at: Date | null;
        result: string | null;
        observation_sha256: string | null;
      }[]
    >(
      `select state,attempts,review_code,receipt_sha256,observed_at,result,observation_sha256 from recreio.rights_recovery_finances where run_id=$1 and operation_id=$2 and requester_reference=$3`,
      [privado.execucaoId, dado.operacaoId, dado.contaId],
    );
    exigir(
      r &&
        r.state === estado &&
        (estado === "current"
          ? r.receipt_sha256 !== null &&
            /^[a-f0-9]{64}$/.test(r.receipt_sha256) &&
            r.observed_at !== null &&
            r.result === "provider_inventory" &&
            r.observation_sha256 !== null &&
            r.review_code === null
          : r.receipt_sha256 === null &&
            r.observed_at === null &&
            r.result === null &&
            r.observation_sha256 === null &&
            r.review_code === (motivo ?? null)),
      "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE",
    );
    return r;
  }
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
      await estadoAtual("current");
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
        await estadoAtual("review", code);
      }
      const [livre] = await copia.unsafe<{ livre: boolean }[]>(
        `select to_regprocedure('audit.recusar_recibo_financeiro_privado()') is null and not exists(select 1 from pg_trigger where tgname='recusar_recibo_financeiro_privado') as livre`,
      );
      exigir(livre?.livre, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
      await copia.begin(async (tx) => {
        await tx.unsafe(
          `create function audit.recusar_recibo_financeiro_privado() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_recovery_finance_assessed' then raise exception using errcode='P7777',message='Synthetic financial receipt audit failure'; end if; return new; end $$`,
        );
        await tx.unsafe(
          `create trigger recusar_recibo_financeiro_privado before insert on audit.events for each row execute function audit.recusar_recibo_financeiro_privado()`,
        );
      });
      try {
        let recusada = false;
        try {
          await conferir();
        } catch (erro) {
          let atual: unknown = erro,
            reconhecida = false;
          for (let n = 0; n < 8; n++) {
            if (z.object({ code: z.literal("P7777") }).safeParse(atual).success) {
              reconhecida = true;
              break;
            }
            if (!(atual instanceof Error) || !atual.cause) break;
            atual = atual.cause;
          }
          if (!reconhecida) throw erro;
          recusada = true;
        }
        exigir(recusada, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
        await estadoAtual("review", "technical_failure");
      } finally {
        await copia.begin(async (tx) => {
          await tx.unsafe(`drop trigger recusar_recibo_financeiro_privado on audit.events`);
          await tx.unsafe(`drop function audit.recusar_recibo_financeiro_privado()`);
        });
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
      let alterar: RecreioClosureInventory | undefined,
        alterada = false;
      cliente.middlewareStack.add(
        (next, contexto) => async (args) => {
          if (contexto.commandName === "GetObjectCommand" && alterar) {
            alterar.sha256 = `${alterar.sha256.startsWith("0") ? "1" : "0"}${alterar.sha256.slice(1)}`;
            alterar = undefined;
            alterada = true;
          }
          return next(args);
        },
        { step: "initialize", name: "recreioFinancialEvidenceMutationProof" },
      );
      try {
        await recusada(
          () =>
            avaliarFinanceiroConfirmadoRecuperado(filha, () => ({
              modo: "dev",
              inventario: {
                async inspect(scope) {
                  const observacao = await http.inventario.inspect(scope);
                  alterar = observacao;
                  return observacao;
                },
              },
            })),
          "invalid_evidence",
        );
        exigir(alterada, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
      } finally {
        alterar = undefined;
        cliente.middlewareStack.remove("recreioFinancialEvidenceMutationProof");
      }
      http.aposInventario(async () => {
        await estadoAtual("attempted");
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
      exigir((await estadoAtual("current")).attempts === 15, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
      type Tx = Parameters<Parameters<typeof privado.banco.transaction>[0]>[0];
      async function conferirSelo(tx: Tx, selo?: SeloFinanceiroRecuperado) {
        const [op] = await tx
          .select()
          .from(operations)
          .where(eq(operations.id, dado.operacaoId))
          .for("update");
        exigir(op, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
        const { plano } = await conferirIntencaoFinanceiraDaCoordenacao(tx, op, filha);
        return conferirFinanceiroAtualRecuperadoLocked(
          tx,
          op,
          plano,
          { execucaoId: privado.execucaoId, cercaSha256: privado.cerca },
          selo,
        );
      }
      async function recusarSelo(executar: () => Promise<unknown>) {
        let recusou = false;
        try {
          await executar();
        } catch (erro) {
          if (!(erro instanceof AppError) || erro.code !== "DIREITOS_INTEGRIDADE") throw erro;
          recusou = true;
        }
        exigir(recusou, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
      }
      const selo = await privado.banco.transaction((tx) => conferirSelo(tx));
      const lerReciboAtual = () =>
        copia.unsafe(
          `select to_jsonb(f) as recibo from recreio.rights_recovery_finances f where run_id=$1 and operation_id=$2`,
          [privado.execucaoId, dado.operacaoId],
        );
      const antesDoPrazo = await lerReciboAtual();
      for (const direcao of ["passado", "futuro"] as const) {
        const rollback = new Error("Synthetic financial time rollback");
        try {
          await privado.banco.transaction(async (tx) => {
            const instante =
              direcao === "passado"
                ? sql`statement_timestamp()-interval '6 minutes'`
                : sql`statement_timestamp()+interval '1 minute'`;
            await tx
              .update(assessments)
              .set({
                createdAt: sql`statement_timestamp()-interval '7 minutes'`,
                attemptedAt: instante,
                observedAt: instante,
                updatedAt: instante,
              })
              .where(
                sql`${assessments.runId}=${privado.execucaoId}::uuid and ${assessments.operationId}=${dado.operacaoId}::uuid`,
              );
            await recusarSelo(() => conferirSelo(tx, selo));
            throw rollback;
          });
        } catch (erro) {
          if (erro !== rollback) throw erro;
        }
      }
      exigir(
        isDeepStrictEqual(antesDoPrazo, await lerReciboAtual()),
        "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE",
      );
      http.cenario("indisponivel");
      await recusada(conferir, "provider_unavailable");
      await recusarSelo(() => privado.banco.transaction((tx) => conferirSelo(tx)));
      http.cenario("ok");
      await conferir();
      await recusarSelo(() => privado.banco.transaction((tx) => conferirSelo(tx, selo)));
      await privado.banco.transaction((tx) => conferirSelo(tx));
      exigir((await estadoAtual("current")).attempts === 17, "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE");
    });
    async function copiaFinanceira(contaId: string) {
      const arquivo = criarArquivoPessoal();
      try {
        await privado.banco.transaction((tx) =>
          copiarFinanciamentoPessoalNaTransacao(tx, contaId, arquivo, async () => new Date()),
        );
        const bytes = arquivo.concluir();
        try {
          return bytes.toString("utf8");
        } finally {
          bytes.fill(0);
        }
      } finally {
        arquivo.encerrar();
      }
    }
    const pessoal = await copiaFinanceira(dado.contaId),
      outra = await copiaFinanceira("nonexistent_synthetic_financial_subject");
    exigir(
      pessoal.includes('"tipo":"avaliacao_financeira_recuperacao"') &&
        pessoal.includes(dado.operacaoId) &&
        !outra.includes(dado.operacaoId) &&
        !/receiptSha256|sourceSha256|attemptToken|clienteStripeId|cabecalho|frozenHead/.test(
          pessoal,
        ) &&
        !pessoal.includes(dado.clienteStripeId),
      "RECIBO_FINANCEIRO_ATUAL_DIVERGENTE",
    );
    exigir(isDeepStrictEqual(originais, await lerOriginais()), "CONSENTIMENTO_NATIVO_DIVERGENTE");
    return {
      nativeClosureFreshProviderSdkHttpVerified: true,
      nativeClosureFreshProviderFailureRefused: true,
      nativeClosureFreshProviderScopeMismatchRefused: true,
      nativeClosureFreshProviderIncompletePageRefused: true,
      nativeClosureFreshProviderCopiedEvidenceRefused: true,
      nativeClosureFreshProviderMutationAfterReadRefused: true,
      nativeClosureFreshProviderSourceRaceRefused: true,
      nativeClosureProviderOriginalConfirmationUnchanged: true,
      nativeClosureProviderReadRequests: http.conferir(),
      nativeClosureFinancialAttemptPersistedBeforeIo: true,
      nativeClosureFinancialFailedAssessmentNotCurrent: true,
      nativeClosureFinancialCurrentReceiptAuditAtomic: true,
      nativeClosureFinancialAssessmentAttempts: 17,
      nativeClosureFinancialStaleAssessmentRefused: true,
      nativeClosureFinancialFutureAssessmentRefused: true,
      nativeClosureFinancialSupersededSealRefused: true,
      nativeClosureFinancialPersonalCopyScoped: true,
      nativeClosureProviderRealStripeUsed: false,
    };
  } finally {
    await http.encerrar();
  }
}
