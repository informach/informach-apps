import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import {
  assertRecreioClosureInventory,
  type RecreioClosureInventory,
  type RecreioClosureInventoryScope,
} from "@informach/billing/providers/stripe-recreio-closure-inventory";
import {
  type RecreioRenewalReviewCode,
  RecreioRenewalReviewError,
} from "@informach/billing/providers/stripe-recreio-renewals";
import type { StripeMode } from "@informach/config";
import { and, db, eq, inArray, isNull, ne, or, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioAccountClosureFinances as finances,
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
} from "@informach/db/schema";
import { VERSAO_DO_CANCELAMENTO_DA_RENOVACAO } from "@/features/cobranca/renovacao-constantes";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  bancoDaCoordenacao,
  conferirCoordenacaoDeDireitos,
  conferirIntencaoFinanceiraDaCoordenacao,
  escopoFinanceiroDaCoordenacao,
} from "./coordenacao-repository";
import type { CoordenacaoDeEfeitos } from "./efeitos-repository";
import { conferirNascimentoFinanceiroDoEncerramento } from "./encerramento-financeiro-nascimento-repository";
import { lerOrigemFinanceiraDoEncerramentoLocked } from "./encerramento-origem-financeira-repository";

type Linha = typeof finances.$inferSelect;
type Origem = Awaited<ReturnType<typeof lerOrigemFinanceiraDoEncerramentoLocked>>;
const RESERVADA = Symbol("recreio.closure-finance.reserved");
export type TrabalhoFinanceiroDoEncerramento = {
  readonly [RESERVADA]: true;
  readonly operacaoId: string;
  readonly contaId: string;
  readonly token: string;
};
const ADMITIDA = Symbol("recreio.closure-finance.admitted");
export type TentativaFinanceiraDoEncerramento = TrabalhoFinanceiroDoEncerramento & {
  readonly [ADMITIDA]: true;
  readonly numero: number;
  readonly modo: StripeMode;
  readonly origem: Origem;
};
export type MotivoFinanceiroDoEncerramento = RecreioRenewalReviewCode | "ledger_unavailable";

function conferirLivro(config: CoordenacaoDeEfeitos) {
  conferirCoordenacaoDeDireitos(config);
}
async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
function escopoDaFila(livroId: string) {
  return and(
    ne(finances.state, "confirmed"),
    sql`${finances.nextAttemptAt}<=${AGORA}`,
    or(isNull(finances.leaseUntil), sql`${finances.leaseUntil}<=${AGORA}`),
    sql`exists(select 1 from ${operations} where ${operations.id}=${finances.operationId} and ${operations.requesterUserId}=${finances.requesterUserId} and ${operations.kind}='encerrar_conta' and ${operations.ledgerId}=${livroId} and ${operations.state} in ('admitted','running'))`,
  );
}
/** Read-only fast path; reservation still verifies the current ledger. */
export async function haFinanceiroDoEncerramentoDevido(livroId: string) {
  return db.transaction(async (tx) => {
    await limites(tx);
    const [linha] = await tx
      .select({ id: finances.operationId })
      .from(finances)
      .where(escopoDaFila(livroId))
      .limit(1);
    return Boolean(linha);
  });
}
export function reservarFinanceiroDoEncerramento(config: CoordenacaoDeEfeitos) {
  conferirLivro(config);
  return bancoDaCoordenacao(config).transaction(
    async (tx): Promise<TrabalhoFinanceiroDoEncerramento | null> => {
      await limites(tx);
      const [linha] = await tx
        .select()
        .from(finances)
        .where(
          and(
            escopoDaFila(config.assinatura.livroId),
            sql`exists(select 1 from ${operations}
          where ${operations.id}=${finances.operationId} and ${escopoFinanceiroDaCoordenacao(config)})`,
          ),
        )
        .orderBy(finances.nextAttemptAt, finances.operationId)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!linha) return null;
      const token = randomUUID();
      await tx
        .update(finances)
        .set({
          leaseToken: token,
          leaseUntil: sql`${AGORA}+interval '3 minutes'`,
          updatedAt: AGORA,
        })
        .where(eq(finances.operationId, linha.operationId));
      return {
        [RESERVADA]: true,
        operacaoId: linha.operationId,
        contaId: linha.requesterUserId,
        token,
      };
    },
  );
}

/** Caller holds the payer lifecycle before this transaction. Lock operation
 * before local contract/receipt rows. No browser session is manufactured. */
async function comTrabalho<T>(
  prova: TrabalhoFinanceiroDoEncerramento,
  config: CoordenacaoDeEfeitos,
  executar: (
    tx: Transacao,
    linha: Linha,
    contexto: {
      op: typeof operations.$inferSelect;
      plano: Extract<
        Awaited<ReturnType<typeof conferirIntencaoFinanceiraDaCoordenacao>>["plano"],
        { formato: "recreio-previa-encerramento-v2" }
      >;
      agora: Date;
    },
  ) => Promise<T>,
) {
  conferirLivro(config);
  assertAllowed(prova[RESERVADA], "DIREITOS_POSSE", "Trabalho financeiro não admitido.");
  return bancoDaCoordenacao(config).transaction(async (tx) => {
    await limites(tx);
    const [op] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.id, prova.operacaoId),
          eq(operations.requesterUserId, prova.contaId),
          eq(operations.kind, "encerrar_conta"),
          eq(operations.ledgerId, config.assinatura.livroId),
          inArray(operations.state, ["admitted", "running"]),
          escopoFinanceiroDaCoordenacao(config),
        ),
      )
      .for("update");
    assertAllowed(
      op &&
        config.prova.referencias.some(
          (r) =>
            r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
        ),
      "DIREITOS_LIVRO",
      "Consentimento ausente do prefixo verificado.",
    );
    const { plano } = await conferirIntencaoFinanceiraDaCoordenacao(tx, op, config);
    assertAllowed(
      plano.formato === "recreio-previa-encerramento-v2",
      "DIREITOS_INTEGRIDADE",
      "O encerramento não tem escopo financeiro autorizado.",
    );
    const [participacao] = await tx
      .select()
      .from(participations)
      .where(
        and(
          eq(participations.userId, op.requesterUserId),
          eq(participations.operationId, op.id),
          eq(participations.state, "closing"),
          eq(participations.revision, 2),
        ),
      )
      .for("share");
    assertAllowed(
      participacao,
      "DIREITOS_INTEGRIDADE",
      "A barreira de encerramento exige revisão.",
    );
    const [linha] = await tx
      .select()
      .from(finances)
      .where(
        and(
          eq(finances.operationId, op.id),
          eq(finances.requesterUserId, op.requesterUserId),
          eq(finances.leaseToken, prova.token),
          ne(finances.state, "confirmed"),
        ),
      )
      .for("update");
    assertAllowed(linha, "DIREITOS_POSSE", "A reserva financeira já foi retomada.");
    const [relogio] = await tx
      .select({ agora: sql<Date>`${AGORA}`.mapWith(finances.createdAt) })
      .from(finances)
      .where(eq(finances.operationId, op.id));
    const cliente = plano.financeiro.clientes[0];
    await conferirNascimentoFinanceiroDoEncerramento(tx, op, linha);
    assertAllowed(
      relogio && linha.leaseUntil && linha.leaseUntil > relogio.agora,
      "DIREITOS_POSSE",
      "A reserva financeira venceu.",
    );
    assertAllowed(
      linha.providerMode === plano.financeiro.modo &&
        linha.customerId === (cliente?.id ?? null) &&
        linha.providerCustomerId === (cliente?.referenciaStripe ?? null),
      "DIREITOS_INTEGRIDADE",
      "A fila financeira mudou de escopo.",
    );
    return executar(tx, linha, { op, plano, agora: relogio.agora });
  });
}

export function iniciarFinanceiroDoEncerramentoLocked(
  prova: TrabalhoFinanceiroDoEncerramento,
  config: CoordenacaoDeEfeitos,
) {
  return comTrabalho(
    prova,
    config,
    async (tx, linha, { plano, agora }): Promise<TentativaFinanceiraDoEncerramento> => {
      const origem = await lerOrigemFinanceiraDoEncerramentoLocked(tx, plano);
      assertAllowed(
        linha.attempts < 2147483647,
        "DIREITOS_INTEGRIDADE",
        "A fila financeira excedeu o limite de tentativas.",
      );
      const numero = linha.attempts + 1;
      await tx
        .update(finances)
        .set({
          state: "attempted",
          requestStartedAt: linha.requestStartedAt ?? agora,
          attempts: numero,
          reviewCode: null,
          updatedAt: agora,
        })
        .where(eq(finances.operationId, linha.operationId));
      await logAuditEventStrict(
        "recreio.account_closure_finance_attempt_started",
        null,
        { app: "recreio", operationId: linha.operationId, attemptCount: numero },
        { writer: tx },
      );
      return { ...prova, [ADMITIDA]: true, numero, modo: linha.providerMode, origem };
    },
  );
}

function escopoDaOrigem(
  operacaoId: string,
  origem: Origem,
  deadlineMs: number,
): RecreioClosureInventoryScope {
  assertAllowed(origem.cliente, "DIREITOS_INTEGRIDADE", "Cliente financeiro não disponível.");
  return {
    operationId: operacaoId,
    customerId: origem.cliente.providerCustomerId,
    payerId: origem.contaId,
    purchases: origem.compras.map((p) => ({ authorizationId: p.id, productId: p.produto })),
    contracts: origem.assinaturas.map(({ contrato, comum }) => ({
      subscriptionId: comum.providerSubscriptionId,
      authorizationId: contrato.purchaseId,
      productId: contrato.originProductId,
    })),
    budget: { deadlineMs },
  };
}
export function escopoDoInventarioDoEncerramento(
  prova: TentativaFinanceiraDoEncerramento,
  deadlineMs: number,
) {
  assertAllowed(prova[ADMITIDA], "DIREITOS_POSSE", "Tentativa financeira não admitida.");
  return { ...escopoDaOrigem(prova.operacaoId, prova.origem, deadlineMs), payerId: prova.contaId };
}

export function concluirFinanceiroDoEncerramentoLocked(
  prova: TentativaFinanceiraDoEncerramento,
  config: CoordenacaoDeEfeitos,
  observacao: RecreioClosureInventory | null,
) {
  return comTrabalho(prova, config, async (tx, linha, { op, plano, agora }) => {
    assertAllowed(
      prova[ADMITIDA] && linha.attempts === prova.numero && linha.requestStartedAt,
      "DIREITOS_POSSE",
      "A tentativa financeira já foi retomada.",
    );
    const origem = await lerOrigemFinanceiraDoEncerramentoLocked(tx, plano);
    assertAllowed(
      origem.sha256 === prova.origem.sha256,
      "DIREITOS_INTEGRIDADE",
      "A origem financeira mudou durante a leitura.",
    );
    let sha256: string, resultado: "provider_inventory" | "no_customer";
    if (!origem.cliente) {
      assertAllowed(
        observacao === null,
        "DIREITOS_INTEGRIDADE",
        "Observação fora do escopo financeiro.",
      );
      resultado = "no_customer";
      sha256 = createHash("sha256")
        .update(
          JSON.stringify({
            formato: "recreio-encerramento-sem-cliente-v1",
            operationId: op.id,
            planSha256: op.planSha256,
            payerId: op.requesterUserId,
            mode: linha.providerMode,
            sourceSha256: origem.sha256,
          }),
        )
        .digest("hex");
    } else {
      assertAllowed(
        observacao,
        "DIREITOS_INTEGRIDADE",
        "Falta conferir o inventário financeiro completo.",
      );
      assertRecreioClosureInventory(
        observacao,
        { ...escopoDaOrigem(op.id, origem, 0), payerId: op.requesterUserId },
        linha.providerMode,
      );
      const pendentes = observacao.subscriptions.filter((s) => !s.terminal && s.stopsAt === null);
      const aguardandoTermino = observacao.subscriptions.some(
        (s) => !s.terminal && s.stopsAt !== null && s.stopsAt <= agora,
      );
      const ids = origem.assinaturas.map((s) => s.contrato.subscriptionId);
      const existentes = ids.length
        ? await tx
            .select()
            .from(cancellations)
            .where(
              and(
                eq(cancellations.payerUserId, op.requesterUserId),
                eq(cancellations.providerMode, linha.providerMode),
                inArray(cancellations.subscriptionId, ids),
              ),
            )
            .orderBy(cancellations.subscriptionId)
            .for("update")
        : [];
      const porAssinatura = new Map(existentes.map((c) => [c.subscriptionId, c]));
      const novos = [];
      for (const { contrato, comum } of origem.assinaturas) {
        const anterior = porAssinatura.get(contrato.subscriptionId);
        assertAllowed(
          !anterior ||
            (anterior.purchaseId === contrato.purchaseId &&
              anterior.originProductId === contrato.originProductId &&
              anterior.providerCustomerId === comum.providerCustomerId &&
              anterior.providerSubscriptionId === comum.providerSubscriptionId),
          "DIREITOS_INTEGRIDADE",
          "O cancelamento existente mudou de origem.",
        );
        if (anterior?.state === "review")
          throw new RecreioRenewalReviewError(anterior.reviewCode ?? "invalid_evidence");
        const atual = observacao.subscriptions.find((s) => s.id === comum.providerSubscriptionId);
        assertAllowed(atual, "DIREITOS_INTEGRIDADE", "Contrato ausente do inventário completo.");
        if (anterior?.state === "confirmed" && !atual.terminal && atual.stopsAt !== null) {
          assertAllowed(
            anterior.providerResult === "scheduled" &&
              anterior.providerStopAt &&
              atual.stopsAt <= anterior.providerStopAt,
            "DIREITOS_INTEGRIDADE",
            "A parada da renovação foi adiada após a confirmação.",
          );
        }
        if (!pendentes.some((s) => s.id === comum.providerSubscriptionId)) continue;
        assertAllowed(
          anterior?.state !== "confirmed",
          "DIREITOS_INTEGRIDADE",
          "A renovação foi reativada depois da confirmação.",
        );
        if (!anterior)
          novos.push({
            id: randomUUID(),
            subscriptionId: contrato.subscriptionId,
            purchaseId: contrato.purchaseId,
            groupId: contrato.groupId,
            payerUserId: op.requesterUserId,
            providerMode: linha.providerMode,
            originProductId: contrato.originProductId,
            expectedContractRevision: contrato.revision,
            expectedProductId: contrato.currentProductId,
            expectedPriceId: contrato.currentPriceId,
            expectedPeriodEnd: comum.periodEnd,
            providerCustomerId: comum.providerCustomerId,
            providerSubscriptionId: comum.providerSubscriptionId,
            initiator: "account_closure" as const,
            closureOperationId: op.id,
            policyVersion: VERSAO_DO_CANCELAMENTO_DA_RENOVACAO,
            source: op.source,
            authenticatedAt: op.authenticatedAt,
            acceptedAt: op.consentedAt,
            state: "accepted" as const,
            attempts: 0,
            nextAttemptAt: agora,
            createdAt: agora,
            updatedAt: agora,
          });
      }
      if (novos.length) {
        await tx.insert(cancellations).values(novos);
        await logAuditEventStrict(
          "recreio.account_closure_renewals_queued",
          null,
          { app: "recreio", operationId: op.id, count: novos.length },
          { writer: tx },
        );
      }
      if (
        pendentes.length ||
        aguardandoTermino ||
        novos.length ||
        existentes.some((c) => c.state !== "confirmed") ||
        observacao.checkouts.some((c) => !c.settled)
      ) {
        await tx
          .update(finances)
          .set({
            state: "waiting",
            leaseToken: null,
            leaseUntil: null,
            nextAttemptAt: sql`${AGORA}+interval '5 minutes'`,
            updatedAt: agora,
          })
          .where(eq(finances.operationId, op.id));
        await logAuditEventStrict(
          "recreio.account_closure_finance_waiting",
          null,
          { app: "recreio", operationId: op.id, attemptCount: linha.attempts },
          { writer: tx },
        );
        return { situacao: "aguardando_renovacao" as const, operacaoId: op.id };
      }
      resultado = "provider_inventory";
      sha256 = observacao.sha256;
    }
    await tx
      .update(finances)
      .set({
        state: "confirmed",
        result: resultado,
        observationSha256: sha256,
        observedAt: agora,
        confirmedAt: agora,
        leaseToken: null,
        leaseUntil: null,
        reviewCode: null,
        updatedAt: agora,
      })
      .where(eq(finances.operationId, op.id));
    await logAuditEventStrict(
      "recreio.account_closure_finance_confirmed",
      null,
      { app: "recreio", operationId: op.id, attemptCount: linha.attempts, result: resultado },
      { writer: tx },
    );
    return { situacao: "confirmada" as const, operacaoId: op.id };
  });
}

export function registrarFalhaFinanceiraDoEncerramentoLocked(
  prova: TrabalhoFinanceiroDoEncerramento,
  config: CoordenacaoDeEfeitos,
  motivo: MotivoFinanceiroDoEncerramento,
) {
  return comTrabalho(prova, config, async (tx, linha, { agora }) => {
    const espera = Math.min(3600, 300 * 2 ** Math.min(4, Math.max(0, linha.attempts - 1)));
    await tx
      .update(finances)
      .set({
        state: "review",
        reviewCode: motivo,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+${espera}*interval '1 second'`,
        updatedAt: agora,
      })
      .where(eq(finances.operationId, linha.operationId));
    await logAuditEventStrict(
      "recreio.account_closure_finance_failed",
      null,
      {
        app: "recreio",
        operationId: linha.operationId,
        reasonCode: motivo,
        attemptCount: linha.attempts,
      },
      { writer: tx },
    );
    return { situacao: "revisao" as const, operacaoId: linha.operationId };
  });
}
