import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { lockActiveWebParticipation } from "@informach/auth/web-participation";
import { and, type Database, eq, sql } from "@informach/db";
import { aiOperationReceipts, creditLedger, creditReservations } from "@informach/db/schema";
import type { CreditAwareBillingClient } from "./billing";
import { runBillableAiCall } from "./execution";
import type { AgentRunRecorder } from "./telemetry";
import type { AppName } from "./types";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Receipt = typeof aiOperationReceipts.$inferSelect;
const LEASE_MS = 10 * 60_000;
const RETENTION_MS = 24 * 60 * 60_000;

export class AiOperationError extends Error {
  constructor(readonly code: "AI_PROCESSING" | "AI_RECOVERY_REQUIRED" | "AI_RESULT_EXPIRED") {
    super(code);
    this.name = "AiOperationError";
  }
}
type Context = {
  db: Database;
  actorId: string;
  groupId: string;
  app: AppName;
  scopeKey: string;
  /** Must take the domain's current permission locks; never use cached grants. */
  authorize: (tx: Transaction) => Promise<void>;
  billing: CreditAwareBillingClient;
};
type Operation<T> = {
  feature: string;
  model: string;
  agent: string;
  recorder: AgentRunRecorder;
  tariff: string;
  maxCredits: number;
  /** SHA-256 of exact normalized input. Raw input never enters the receipt or telemetry. */
  inputHash: string;
  parseResult: (value: unknown) => T;
  call: (runId: string) => Promise<{
    value: T;
    actualCredits: number;
    usage?: unknown;
    metadata?: Record<string, unknown>;
  }>;
};

function sameRun(row: Receipt) {
  return and(eq(aiOperationReceipts.id, row.id), eq(aiOperationReceipts.runId, row.runId));
}
async function reservation(context: Context, runId: string) {
  const [row] = await context.db
    .select()
    .from(creditReservations)
    .where(
      and(
        eq(creditReservations.id, runId),
        eq(creditReservations.app, "compasso"),
        eq(creditReservations.consumerApp, context.app),
        eq(creditReservations.actorUserId, context.actorId),
        eq(creditReservations.ownerType, "family"),
        eq(creditReservations.ownerId, context.groupId),
      ),
    );
  return row;
}
async function paid(context: Context, row: Receipt) {
  const [debit] = await context.db
    .select({ amount: creditLedger.amount })
    .from(creditLedger)
    .where(
      and(
        eq(creditLedger.reservationId, row.runId),
        eq(creditLedger.app, "compasso"),
        eq(creditLedger.consumerApp, context.app),
        eq(creditLedger.actorUserId, context.actorId),
        eq(creditLedger.ownerType, "family"),
        eq(creditLedger.ownerId, context.groupId),
        eq(creditLedger.entryType, "consumption"),
      ),
    );
  return !!debit && debit.amount === -(row.actualCredits ?? 0);
}

/** A short-lived, actor-specific result receipt. Replays never bypass current domain access. */
export function createRecoverableAiOperations(context: Context) {
  async function claim<T>(input: Operation<T>) {
    const now = new Date();
    const requestHash = createHash("sha256")
      .update(JSON.stringify([input.inputHash, input.tariff, input.maxCredits, input.model]))
      .digest("hex");
    return context.db.transaction(async (tx) => {
      await context.authorize(tx);
      const revision = await lockActiveWebParticipation(tx, context.actorId);
      const key = and(
        eq(aiOperationReceipts.app, context.app),
        eq(aiOperationReceipts.actorUserId, context.actorId),
        eq(aiOperationReceipts.groupId, context.groupId),
        eq(aiOperationReceipts.scopeKey, context.scopeKey),
        eq(aiOperationReceipts.feature, input.feature),
        eq(aiOperationReceipts.requestHash, requestHash),
      );
      // The family lock serializes claims with revocation. No wallet operation
      // takes place while it is held: the wallet uses wallet → family order.
      let row: Receipt | undefined = (
        await tx.select().from(aiOperationReceipts).where(key).for("update")
      )[0];
      if (row && row.expiresAt <= now && ["complete", "failed"].includes(row.phase)) {
        await tx.delete(aiOperationReceipts).where(eq(aiOperationReceipts.id, row.id));
        row = undefined;
      }
      if (!row) {
        const [created] = await tx
          .insert(aiOperationReceipts)
          .values({
            app: context.app,
            actorUserId: context.actorId,
            groupId: context.groupId,
            scopeKey: context.scopeKey,
            webParticipationRevision: revision,
            feature: input.feature,
            requestHash,
            tariff: input.tariff,
            maxCredits: input.maxCredits,
            phase: "processing",
            leaseUntil: new Date(now.valueOf() + LEASE_MS),
            expiresAt: new Date(now.valueOf() + RETENTION_MS),
          })
          .returning();
        if (!created) throw new Error("AI receipt admission failed");
        return { row: created, mode: "execute" as const };
      }
      if (row.webParticipationRevision !== revision)
        throw new AiOperationError("AI_RESULT_EXPIRED");
      if (row.phase === "complete") return { row, mode: "recover" as const };
      // An output can be committed immediately, including after a lost response.
      if (row.phase === "output") return { row, mode: "recover" as const };
      if (row.phase === "processing" && row.leaseUntil > now)
        throw new AiOperationError("AI_PROCESSING");
      const [hold] = await tx
        .select()
        .from(creditReservations)
        .where(eq(creditReservations.id, row.runId));
      if (hold?.status === "committed") throw new AiOperationError("AI_RECOVERY_REQUIRED");
      if (hold?.status === "active") return { row, mode: "pending" as const };
      const [next] = await tx
        .update(aiOperationReceipts)
        .set({
          runId: randomUUID(),
          phase: "processing",
          leaseUntil: new Date(now.valueOf() + LEASE_MS),
          expiresAt: new Date(now.valueOf() + RETENTION_MS),
          updatedAt: now,
        })
        .where(sameRun(row))
        .returning();
      if (!next) throw new AiOperationError("AI_PROCESSING");
      return { row: next, mode: "execute" as const };
    });
  }
  async function result<T>(row: Receipt, input: Operation<T>) {
    if (!(await paid(context, row))) throw new AiOperationError("AI_RECOVERY_REQUIRED");
    return context.db.transaction(async (tx) => {
      await context.authorize(tx);
      await lockActiveWebParticipation(tx, context.actorId, row.webParticipationRevision);
      const [current] = await tx
        .select()
        .from(aiOperationReceipts)
        .where(sameRun(row))
        .for("update");
      if (!current || current.result === null) throw new AiOperationError("AI_RECOVERY_REQUIRED");
      if (current.expiresAt <= new Date()) throw new AiOperationError("AI_RESULT_EXPIRED");
      const value = input.parseResult(current.result);
      await tx
        .update(aiOperationReceipts)
        .set({ phase: "complete", updatedAt: new Date() })
        .where(sameRun(current));
      return value;
    });
  }
  return {
    async run<T>(input: Operation<T>): Promise<T> {
      if (
        !/^[a-f0-9]{64}$/.test(input.inputHash) ||
        !Number.isSafeInteger(input.maxCredits) ||
        input.maxCredits <= 0
      )
        throw new Error("Invalid AI operation contract");
      const { row, mode } = await claim(input);
      if (mode !== "execute") {
        const hold = await reservation(context, row.runId);
        if (!hold) throw new AiOperationError("AI_RECOVERY_REQUIRED");
        if (hold.status === "committed") return result(row, input);
        if (hold.status === "active" && mode === "pending" && hold.expiresAt > new Date())
          throw new AiOperationError("AI_PROCESSING");
        if (
          hold.status === "active" &&
          row.result !== null &&
          row.actualCredits !== null &&
          hold.expiresAt > new Date()
        ) {
          try {
            await context.billing.commitReservation({
              reservationId: row.runId,
              actualAmount: row.actualCredits,
            });
          } catch (error) {
            // A concurrent recovery or lost commit acknowledgement may have
            // settled the same reservation. Only the matching debit proves it.
            if (!(await paid(context, row))) throw error;
          }
          return result(row, input);
        }
        if (hold.status === "active")
          await context.billing.releaseReservation({ reservationId: row.runId, reason: "timeout" });
        await context.db
          .update(aiOperationReceipts)
          .set({ phase: "failed", leaseUntil: new Date(), updatedAt: new Date() })
          .where(sameRun(row));
        // A new attempt is explicit and reauthorizes. A persisted unpaid output
        // is reused on that attempt; the provider is never invoked a second time.
        throw new AiOperationError("AI_PROCESSING");
      }
      try {
        await runBillableAiCall<Awaited<ReturnType<Operation<T>["call"]>>>({
          billing: context.billing,
          owner: { type: "family", id: context.groupId },
          app: context.app,
          feature: input.feature,
          model: input.model,
          agent: input.agent,
          recorder: input.recorder,
          runId: row.runId,
          requestId: row.id,
          ttlSeconds: 600,
          retry: false,
          reserveMetadata: { tariff: input.tariff, maxCredits: input.maxCredits },
          estimateCost: () => ({ estimatedAmount: input.maxCredits }),
          computeActualCost: (output) => ({ actualAmount: output.actualCredits }),
          getUsage: (output) => output.usage,
          getSuccessMetadata: (output) => output.metadata,
          getErrorMetadata: () => ({ error: "AI_OPERATION_FAILED" }),
          call: async ({ runId }) => {
            const output =
              row.result !== null && row.actualCredits !== null
                ? { value: input.parseResult(row.result), actualCredits: row.actualCredits }
                : await input.call(runId);
            const value = input.parseResult(output.value);
            if (
              !Number.isSafeInteger(output.actualCredits) ||
              output.actualCredits <= 0 ||
              output.actualCredits > input.maxCredits ||
              Buffer.byteLength(JSON.stringify(value), "utf8") > 128_000
            )
              throw new Error("Invalid AI operation result");
            const saved = await context.db.transaction(async (tx) => {
              await context.authorize(tx);
              await lockActiveWebParticipation(tx, context.actorId, row.webParticipationRevision);
              return tx
                .update(aiOperationReceipts)
                .set({
                  phase: "output",
                  result: value,
                  actualCredits: output.actualCredits,
                  updatedAt: new Date(),
                })
                .where(and(sameRun(row), eq(aiOperationReceipts.phase, "processing")))
                .returning({ id: aiOperationReceipts.id });
            });
            if (!saved.length) throw new AiOperationError("AI_PROCESSING");
            return { ...output, value };
          },
        });
      } catch (error) {
        const hold = await reservation(context, row.runId);
        if (!hold || (hold.status !== "active" && hold.status !== "committed"))
          await context.db
            .update(aiOperationReceipts)
            .set({ phase: "failed", leaseUntil: new Date(), updatedAt: new Date() })
            .where(sameRun(row));
        throw error;
      }
      const [stored] = await context.db.select().from(aiOperationReceipts).where(sameRun(row));
      if (!stored) throw new AiOperationError("AI_RECOVERY_REQUIRED");
      return result(stored, input);
    },
  };
}

export async function purgeAiOperationReceipts(db: Database, app: AppName, now = new Date()) {
  // Financial facts remain in billing; deletion here only retires private cache.
  await db
    .delete(aiOperationReceipts)
    .where(
      and(
        eq(aiOperationReceipts.app, app),
        sql`${aiOperationReceipts.expiresAt} <= ${now.toISOString()}::timestamptz`,
        sql`${aiOperationReceipts.leaseUntil} <= ${now.toISOString()}::timestamptz`,
        sql`NOT EXISTS (SELECT 1 FROM ${creditReservations} r WHERE r.id = ${aiOperationReceipts.runId} AND r.status = 'active')`,
      ),
    );
}
