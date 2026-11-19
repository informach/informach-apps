import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import type {
  RecreioRenewalObservation,
  RecreioRenewalReviewCode,
  RecreioRenewalScope,
} from "@informach/billing/providers/stripe-recreio-renewals";
import { readRecreioOwnedSubscription } from "@informach/billing/recreio-account-closure";
import type { StripeMode } from "@informach/config";
import { and, db, eq, isNull, lte, ne, or, sql } from "@informach/db";
import {
  recreioRenewalCancellations as cancellations,
  recreioBillingContracts as contracts,
} from "@informach/db/schema";
import { ContaIdSchema, GrupoIdSchema } from "@informach/recreio";
import {
  admitirGrupoDaConciliacao,
  ComposicaoDoGrupoMudou,
} from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { agendarConciliacaoDaCompra } from "./conciliacao-fila-repository";

type Linha = typeof cancellations.$inferSelect;
const RESERVADA = Symbol("recreio.renewal.reserved");
export type TrabalhoDeCancelamentoDaRenovacao = {
  readonly [RESERVADA]: true;
  readonly id: string;
  readonly paganteId: string;
  readonly grupoId: string;
  readonly modo: StripeMode;
  readonly assinaturaId: string;
  readonly token: string;
};
const ADMITIDA = Symbol("recreio.renewal.admitted");
export type TentativaDeCancelamentoDaRenovacao = TrabalhoDeCancelamentoDaRenovacao & {
  readonly [ADMITIDA]: true;
  readonly numero: number;
  readonly entrada: RecreioRenewalScope;
};
async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}

/** Reserve one due receipt, not a batch that could outlive its lease. */
export function reservarCancelamentoDaRenovacao(modo: StripeMode) {
  return db.transaction(async (tx): Promise<TrabalhoDeCancelamentoDaRenovacao | null> => {
    await limites(tx);
    const [linha] = await tx
      .select()
      .from(cancellations)
      .where(
        and(
          eq(cancellations.providerMode, modo),
          ne(cancellations.state, "confirmed"),
          lte(cancellations.nextAttemptAt, AGORA),
          or(isNull(cancellations.leaseUntil), lte(cancellations.leaseUntil, AGORA)),
        ),
      )
      .orderBy(cancellations.nextAttemptAt, cancellations.id)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!linha) return null;
    const token = randomUUID();
    await tx
      .update(cancellations)
      .set({ leaseToken: token, leaseUntil: sql`${AGORA}+interval '3 minutes'`, updatedAt: AGORA })
      .where(eq(cancellations.id, linha.id));
    return {
      [RESERVADA]: true,
      id: linha.id,
      paganteId: linha.payerUserId,
      grupoId: linha.groupId,
      modo,
      assinaturaId: linha.subscriptionId,
      token,
    };
  });
}

/** Caller holds the payer's financial lifecycle. Technical authority comes
 * from the durable receipt, never an invented current browser login. */
async function comTrabalho<T>(
  prova: TrabalhoDeCancelamentoDaRenovacao,
  executar: (tx: Transacao, linha: Linha, agora: Date) => Promise<T>,
) {
  assertAllowed(prova[RESERVADA], "COBRANCA", "Trabalho não admitido.");
  for (const repeticao of [0, 1]) {
    try {
      return await db.transaction(async (tx) => {
        await limites(tx);
        await admitirGrupoDaConciliacao(
          tx,
          ContaIdSchema.parse(prova.paganteId),
          GrupoIdSchema.parse(prova.grupoId),
        );
        const [contrato] = await tx
          .select()
          .from(contracts)
          .where(
            and(
              eq(contracts.subscriptionId, prova.assinaturaId),
              eq(contracts.payerUserId, prova.paganteId),
              eq(contracts.groupId, prova.grupoId),
              eq(contracts.providerMode, prova.modo),
            ),
          )
          .for("update");
        assertAllowed(contrato, "ORIGEM_FINANCEIRA", "Contrato não disponível.");
        const [linha] = await tx
          .select()
          .from(cancellations)
          .where(
            and(
              eq(cancellations.id, prova.id),
              eq(cancellations.payerUserId, prova.paganteId),
              eq(cancellations.groupId, prova.grupoId),
              eq(cancellations.providerMode, prova.modo),
              eq(cancellations.subscriptionId, prova.assinaturaId),
              eq(cancellations.leaseToken, prova.token),
              ne(cancellations.state, "confirmed"),
            ),
          )
          .for("update");
        assertAllowed(linha, "CONFLITO", "O cancelamento já foi retomado por outro executor.");
        const [relogio] = await tx
          .select({ agora: sql<Date>`${AGORA}`.mapWith(cancellations.createdAt) })
          .from(cancellations)
          .where(eq(cancellations.id, linha.id));
        assertAllowed(relogio, "CONFLITO", "Trabalho não disponível.");
        assertAllowed(
          linha.leaseUntil && linha.leaseUntil > relogio.agora,
          "CONFLITO",
          "A reserva do cancelamento venceu.",
        );
        return executar(tx, linha, relogio.agora);
      });
    } catch (error) {
      if (error instanceof ComposicaoDoGrupoMudou && repeticao === 0) continue;
      throw error;
    }
  }
  throw new Error("Renewal work not admitted");
}
async function conferirOrigem(tx: Transacao, linha: Linha) {
  const origem = await readRecreioOwnedSubscription(tx, linha.payerUserId, linha.subscriptionId);
  assertAllowed(
    origem &&
      origem.providerCustomerId === linha.providerCustomerId &&
      origem.providerSubscriptionId === linha.providerSubscriptionId,
    "ORIGEM_FINANCEIRA",
    "A origem financeira do cancelamento exige conferência.",
  );
}
function conferirTentativa(prova: TentativaDeCancelamentoDaRenovacao, linha: Linha) {
  assertAllowed(
    prova[ADMITIDA] && linha.requestStartedAt && linha.attempts === prova.numero,
    "CONFLITO",
    "A tentativa de cancelamento já foi retomada.",
  );
}

export function iniciarCancelamentoDaRenovacaoLocked(prova: TrabalhoDeCancelamentoDaRenovacao) {
  return comTrabalho(
    prova,
    async (tx, linha, agora): Promise<TentativaDeCancelamentoDaRenovacao> => {
      await conferirOrigem(tx, linha);
      assertAllowed(linha.attempts < 2147483647, "COBRANCA", "O cancelamento exige conferência.");
      const numero = linha.attempts + 1;
      await tx
        .update(cancellations)
        .set({
          state: "attempted",
          requestStartedAt: linha.requestStartedAt ?? agora,
          attempts: numero,
          reviewCode: null,
          updatedAt: agora,
        })
        .where(eq(cancellations.id, linha.id));
      await logAuditEventStrict(
        "recreio.renewal_cancellation_attempt_started",
        null,
        { app: "recreio", cancellationId: linha.id, groupId: linha.groupId, attemptCount: numero },
        { writer: tx },
      );
      return {
        ...prova,
        [ADMITIDA]: true,
        numero,
        entrada: {
          intentId: linha.id,
          customerId: linha.providerCustomerId,
          subscriptionId: linha.providerSubscriptionId,
          origin: {
            authorizationId: linha.purchaseId,
            productId: linha.originProductId,
            payerId: linha.payerUserId,
          },
        },
      };
    },
  );
}

export function confirmarCancelamentoDaRenovacaoLocked(
  prova: TentativaDeCancelamentoDaRenovacao,
  observacao: RecreioRenewalObservation,
) {
  return comTrabalho(prova, async (tx, linha, agora) => {
    conferirTentativa(prova, linha);
    await conferirOrigem(tx, linha);
    assertAllowed(
      /^[a-f0-9]{64}$/.test(observacao.sha256) &&
        ((observacao.outcome === "terminal" && observacao.stopsAt === null) ||
          (observacao.outcome === "scheduled" &&
            observacao.stopsAt instanceof Date &&
            Number.isFinite(observacao.stopsAt.getTime()) &&
            observacao.stopsAt > agora)),
      "ORIGEM_FINANCEIRA",
      "A interrupção da renovação ainda não foi comprovada.",
    );
    await tx
      .update(cancellations)
      .set({
        state: "confirmed",
        providerResult: observacao.outcome,
        providerStopAt: observacao.stopsAt,
        observationSha256: observacao.sha256,
        observedAt: agora,
        confirmedAt: agora,
        leaseToken: null,
        leaseUntil: null,
        reviewCode: null,
        updatedAt: agora,
      })
      .where(eq(cancellations.id, linha.id));
    await agendarConciliacaoDaCompra(tx, {
      paganteId: linha.payerUserId,
      grupoId: linha.groupId,
      modo: linha.providerMode,
    });
    await logAuditEventStrict(
      "recreio.renewal_cancellation_confirmed",
      null,
      {
        app: "recreio",
        cancellationId: linha.id,
        groupId: linha.groupId,
        attemptCount: linha.attempts,
        state: "confirmed",
      },
      { writer: tx },
    );
  });
}

/** Also records a failure before admission without falsely inventing a send. */
export function registrarFalhaDoCancelamentoDaRenovacaoLocked(
  prova: TrabalhoDeCancelamentoDaRenovacao,
  motivo: RecreioRenewalReviewCode,
) {
  return comTrabalho(prova, async (tx, linha, agora) => {
    const espera = Math.min(3600, 300 * 2 ** Math.min(4, Math.max(0, linha.attempts - 1)));
    await tx
      .update(cancellations)
      .set({
        state: "review",
        reviewCode: motivo,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+${espera}*interval '1 second'`,
        updatedAt: agora,
      })
      .where(eq(cancellations.id, linha.id));
    await logAuditEventStrict(
      "recreio.renewal_cancellation_failed",
      null,
      {
        app: "recreio",
        cancellationId: linha.id,
        groupId: linha.groupId,
        attemptCount: linha.attempts,
        reasonCode: motivo,
      },
      { writer: tx },
    );
  });
}
