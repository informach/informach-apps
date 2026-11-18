import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import type { StripeMode } from "@informach/config";
import { and, db, eq, isNull, lte, or, sql } from "@informach/db";
import { customers, recreioBillingReconciliations as jobs } from "@informach/db/schema";
import { ContaIdSchema, GrupoIdSchema } from "@informach/recreio";
import { revalidarSessoesDoGrupo } from "@/features/acesso/teste-repository";
import {
  admitirGrupoDaConciliacao,
  ComposicaoDoGrupoMudou,
} from "@/features/grupo/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";

type Linha = typeof jobs.$inferSelect;
export type MotivoDaConferencia = Exclude<NonNullable<Linha["reviewReason"]>, "awaiting_provider">;
const LEASE = Symbol("recreio.conciliacao.lease");
export type TrabalhoDeConciliacao = {
  readonly [LEASE]: true;
  readonly payerUserId: string;
  readonly groupId: string;
  readonly providerMode: StripeMode;
  readonly leaseToken: string;
};
const TENTATIVA = Symbol("recreio.conciliacao.tentativa");
export type TentativaDeConciliacao = TrabalhoDeConciliacao & {
  readonly [TENTATIVA]: true;
  readonly attemptCount: number;
  readonly customer: { readonly id: string; readonly providerCustomerId: string } | null;
};

async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
async function agoraDoBanco(tx: Transacao, paganteId: string, modo: StripeMode) {
  const [linha] = await tx
    .select({ agora: sql<Date>`${AGORA}`.mapWith(jobs.createdAt) })
    .from(jobs)
    .where(and(eq(jobs.payerUserId, paganteId), eq(jobs.providerMode, modo)));
  assertAllowed(linha, "COBRANCA", "Conciliação não disponível.");
  return linha.agora;
}

/** Caller holds the financial lifecycle and has admitted this exact payer/group.
 * No provider call. Checkout admission and this durable scheduling are atomic.
 */
export async function agendarConciliacaoDaCompra(
  tx: Transacao,
  entrada: {
    paganteId: string;
    grupoId: string;
    modo: StripeMode;
  },
) {
  await tx
    .insert(jobs)
    .values({
      payerUserId: entrada.paganteId,
      groupId: entrada.grupoId,
      providerMode: entrada.modo,
    })
    .onConflictDoUpdate({
      target: [jobs.payerUserId, jobs.providerMode],
      set: { nextAttemptAt: AGORA, updatedAt: AGORA },
      setWhere: eq(jobs.groupId, entrada.grupoId),
    });
}

/** One lease at a time: a worker does not reserve a batch it cannot process.
 * SKIP LOCKED and the due index leave other payers available to other workers.
 */
export async function reservarProximaConciliacao(
  modo: StripeMode,
): Promise<TrabalhoDeConciliacao | null> {
  return db.transaction(async (tx) => {
    await limites(tx);
    const [linha] = await tx
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.providerMode, modo),
          lte(jobs.nextAttemptAt, AGORA),
          or(isNull(jobs.leaseUntil), lte(jobs.leaseUntil, AGORA)),
        ),
      )
      .orderBy(jobs.nextAttemptAt, jobs.payerUserId)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!linha) return null;
    const token = randomUUID();
    await tx
      .update(jobs)
      .set({
        leaseToken: token,
        leaseUntil: sql`${AGORA} + interval '10 minutes'`,
        updatedAt: AGORA,
      })
      .where(and(eq(jobs.payerUserId, linha.payerUserId), eq(jobs.providerMode, modo)));
    const trabalho: TrabalhoDeConciliacao = {
      [LEASE]: true,
      payerUserId: linha.payerUserId,
      groupId: linha.groupId,
      providerMode: modo,
      leaseToken: token,
    };
    return trabalho;
  });
}

async function comTrabalho<T>(
  prova: TrabalhoDeConciliacao,
  executar: (
    tx: Transacao,
    linha: Linha,
    grupo: Awaited<ReturnType<typeof admitirGrupoDaConciliacao>>,
    agora: Date,
  ) => Promise<T>,
): Promise<T> {
  assertAllowed(prova[LEASE] === true, "COBRANCA", "Trabalho não admitido.");
  for (const repeticao of [0, 1]) {
    try {
      return await db.transaction(async (tx) => {
        await limites(tx);
        const grupo = await admitirGrupoDaConciliacao(
          tx,
          ContaIdSchema.parse(prova.payerUserId),
          GrupoIdSchema.parse(prova.groupId),
        );
        const [linha] = await tx
          .select()
          .from(jobs)
          .where(
            and(
              eq(jobs.payerUserId, prova.payerUserId),
              eq(jobs.groupId, prova.groupId),
              eq(jobs.providerMode, prova.providerMode),
              eq(jobs.leaseToken, prova.leaseToken),
            ),
          )
          .for("update");
        assertAllowed(linha, "CONFLITO", "A conciliação já foi retomada por outro executor.");
        const agora = await agoraDoBanco(tx, prova.payerUserId, prova.providerMode);
        return executar(tx, linha, grupo, agora);
      });
    } catch (erro) {
      if (erro instanceof ComposicaoDoGrupoMudou && repeticao === 0) continue;
      throw erro;
    }
  }
  throw new Error("Conciliação não admitida");
}

/** Under the lifecycle, before any provider I/O. No browser session is fabricated. */
export function iniciarConciliacaoLocked(
  prova: TrabalhoDeConciliacao,
): Promise<TentativaDeConciliacao> {
  return comTrabalho<TentativaDeConciliacao>(prova, async (tx, linha, _grupo, agora) => {
    assertAllowed(
      linha.leaseUntil && linha.leaseUntil > agora,
      "CONFLITO",
      "A reserva da conciliação venceu.",
    );
    const [customer] = await tx
      .select({ id: customers.id, providerCustomerId: customers.providerCustomerId })
      .from(customers)
      .where(
        and(
          eq(customers.app, "recreio"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, prova.payerUserId),
        ),
      )
      .for("share");
    const [iniciada] = await tx
      .update(jobs)
      .set({ lastAttemptAt: agora, attemptCount: sql`${jobs.attemptCount}+1`, updatedAt: agora })
      .where(
        and(eq(jobs.payerUserId, prova.payerUserId), eq(jobs.providerMode, prova.providerMode)),
      )
      .returning();
    assertAllowed(iniciada, "COBRANCA", "Não foi possível registrar a tentativa.");
    return {
      ...prova,
      [TENTATIVA]: true,
      attemptCount: iniciada.attemptCount,
      customer: customer ?? null,
    };
  });
}

function conferirTentativa(prova: TentativaDeConciliacao, linha: Linha) {
  assertAllowed(
    prova[TENTATIVA] === true && prova.attemptCount === linha.attemptCount,
    "CONFLITO",
    "A tentativa já foi retomada por outro executor.",
  );
}

/** Keeps the last payment confirmation unchanged. Review and SID cuts commit together. */
export function registrarFalhaDaConciliacaoLocked(
  prova: TentativaDeConciliacao,
  motivo: MotivoDaConferencia,
) {
  return comTrabalho(prova, async (tx, linha, grupo, agora) => {
    conferirTentativa(prova, linha);
    const espera = Math.min(3600, 300 * 2 ** Math.min(4, linha.attemptCount - 1));
    await tx
      .update(jobs)
      .set({
        reviewRequired: true,
        reviewReason: motivo,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA} + ${espera} * interval '1 second'`,
        updatedAt: agora,
      })
      .where(
        and(eq(jobs.payerUserId, prova.payerUserId), eq(jobs.providerMode, prova.providerMode)),
      );
    await revalidarSessoesDoGrupo(tx, grupo, agora);
    await logAuditEventStrict(
      "recreio.billing_reconciliation_failed",
      null,
      {
        app: "recreio",
        groupId: prova.groupId,
        providerMode: prova.providerMode,
        reasonCode: motivo,
        attemptCount: prova.attemptCount,
      },
      { writer: tx },
    );
  });
}

/** All provider evidence is persisted by the caller inside this same transaction;
 * an exception rolls back evidence and confirmation, leaving review recoverable.
 */
export function confirmarConciliacaoLocked(
  prova: TentativaDeConciliacao,
  persistir: (tx: Transacao) => Promise<void>,
) {
  return comTrabalho(prova, async (tx, linha, grupo) => {
    conferirTentativa(prova, linha);
    assertAllowed(prova.customer, "COBRANCA", "Cliente financeiro ainda não confirmado.");
    const [atual] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.id, prova.customer.id),
          eq(customers.providerCustomerId, prova.customer.providerCustomerId),
          eq(customers.app, "recreio"),
          eq(customers.provider, "stripe"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, prova.payerUserId),
        ),
      )
      .for("share");
    assertAllowed(atual, "COBRANCA", "O cliente financeiro mudou durante a conciliação.");
    await persistir(tx);
    const agora = await agoraDoBanco(tx, prova.payerUserId, prova.providerMode);
    await tx
      .update(jobs)
      .set({
        reviewRequired: false,
        reviewReason: null,
        lastConfirmedAt: agora,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA} + interval '5 minutes'`,
        updatedAt: agora,
      })
      .where(
        and(eq(jobs.payerUserId, prova.payerUserId), eq(jobs.providerMode, prova.providerMode)),
      );
    await revalidarSessoesDoGrupo(tx, grupo, agora);
    await logAuditEventStrict(
      "recreio.billing_reconciled",
      null,
      {
        app: "recreio",
        groupId: prova.groupId,
        providerMode: prova.providerMode,
        attemptCount: prova.attemptCount,
      },
      { writer: tx },
    );
  });
}
