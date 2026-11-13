import { randomUUID } from "node:crypto";
import type { Database } from "@informach/db";
import {
  collectionAccounts,
  collectionBillingEvents,
  collectionBillingJobs,
  creditPurchaseIntents,
  customers,
  familyGroups,
  oneTimePayments,
} from "@informach/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { recordCompassoScheduleCreated } from "./compasso-plans";
import { hasPendingLegacyCreditReview } from "./credits/legacy-review";
import { BillingError } from "./errors";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Job = typeof collectionBillingJobs.$inferSelect;
export async function requestCollectionReconciliation(
  tx: Database | Tx,
  input: Pick<Job, "customerId" | "kind" | "subjectId"> & { risk?: boolean },
) {
  if (input.kind === "subscription" && input.subjectId !== input.customerId)
    throw new BillingError("Subscription reconciliation must target its own customer");
  if (input.kind === "credit_purchase") {
    const [receipt] = await tx
      .select({ customerId: creditPurchaseIntents.customerId })
      .from(creditPurchaseIntents)
      .where(eq(creditPurchaseIntents.id, input.subjectId));
    if (receipt?.customerId !== input.customerId)
      throw new BillingError("Credit reconciliation belongs to another customer");
  }
  const queued = await tx
    .insert(collectionBillingJobs)
    .values({
      customerId: input.customerId,
      kind: input.kind,
      subjectId: input.subjectId,
      riskVersion: input.risk ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [collectionBillingJobs.kind, collectionBillingJobs.subjectId],
      set: {
        requestedVersion: sql`${collectionBillingJobs.requestedVersion} + 1`,
        ...(input.risk ? { riskVersion: sql`${collectionBillingJobs.requestedVersion} + 1` } : {}),
        nextAttemptAt: sql`now()`,
      },
      setWhere: eq(collectionBillingJobs.customerId, input.customerId),
    })
    .returning({ id: collectionBillingJobs.id });
  if (!queued.length) throw new BillingError("Reconciliation job conflicts with its customer");
}

const eventSchema = z.object({
  eventId: z.string().min(1).max(255),
  eventType: z.string().min(1).max(255),
  customerId: z.string().min(1).max(255),
  paymentId: z.string().max(255).optional(),
  checkoutIntentId: z.uuid().optional(),
  scheduleCreated: z
    .object({
      intentId: z.uuid(),
      scheduleId: z.string().startsWith("sub_sched_"),
      subscriptionId: z.string().startsWith("sub_"),
    })
    .optional(),
});
/** Call only after signature verification and provider resolution of the customer's identity. */
export async function enqueueCompassoBillingEvent(db: Database, raw: z.input<typeof eventSchema>) {
  const input = eventSchema.parse(raw);
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.provider, "stripe"),
          eq(customers.app, "compasso"),
          eq(customers.subjectType, "billing_account"),
          eq(customers.providerCustomerId, input.customerId),
        ),
      );
    if (!customer) return { accepted: false, duplicate: false };
    const adverse =
      input.eventType === "charge.refunded" || input.eventType.startsWith("charge.dispute.");
    if (adverse) {
      const scope = and(
        eq(customers.id, customer.id),
        eq(customers.app, "compasso"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "billing_account"),
        eq(customers.providerCustomerId, input.customerId),
        eq(collectionAccounts.collection, "compasso"),
      );
      const [before] = await tx
        .select({ groupId: collectionAccounts.groupId })
        .from(customers)
        .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
        .where(scope);
      if (!before) throw new BillingError("Compasso event scope is unavailable");
      const [group] = await tx
        .select({ id: familyGroups.id })
        .from(familyGroups)
        .where(eq(familyGroups.id, before.groupId))
        .for("update");
      const [after] = await tx
        .select({ groupId: collectionAccounts.groupId })
        .from(customers)
        .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
        .where(scope);
      if (!group || after?.groupId !== before.groupId)
        throw new BillingError("Compasso event scope changed");
    }
    if (input.scheduleCreated) {
      if (input.eventType !== "subscription_schedule.created")
        throw new BillingError("Invalid schedule creation event");
      await recordCompassoScheduleCreated(tx, {
        ...input.scheduleCreated,
        customerId: customer.id,
      });
    }
    const inserted = await tx
      .insert(collectionBillingEvents)
      .values({
        customerId: customer.id,
        providerEventId: input.eventId,
        eventType: input.eventType,
      })
      .onConflictDoNothing({ target: collectionBillingEvents.providerEventId })
      .returning({ id: collectionBillingEvents.id });
    if (!inserted.length) {
      const [existing] = await tx
        .select()
        .from(collectionBillingEvents)
        .where(eq(collectionBillingEvents.providerEventId, input.eventId));
      if (existing?.customerId !== customer.id || existing.eventType !== input.eventType)
        throw new BillingError("Provider event conflicts with its durable receipt");
      return { accepted: true, duplicate: true };
    }
    const purchases = await tx
      .select({ id: creditPurchaseIntents.id, paymentId: oneTimePayments.providerPaymentId })
      .from(creditPurchaseIntents)
      .leftJoin(oneTimePayments, eq(oneTimePayments.id, creditPurchaseIntents.paymentId))
      .where(
        and(
          eq(creditPurchaseIntents.customerId, customer.id),
          or(
            eq(creditPurchaseIntents.outcome, "pending"),
            input.checkoutIntentId
              ? eq(creditPurchaseIntents.id, input.checkoutIntentId)
              : undefined,
            input.paymentId ? eq(oneTimePayments.providerPaymentId, input.paymentId) : undefined,
          ),
        ),
      );
    const knownPurchase = purchases.some(
      (purchase) =>
        (input.checkoutIntentId !== undefined && purchase.id === input.checkoutIntentId) ||
        (input.paymentId !== undefined && purchase.paymentId === input.paymentId),
    );
    await requestCollectionReconciliation(tx, {
      customerId: customer.id,
      kind: "subscription",
      subjectId: customer.id,
      risk: adverse && !knownPurchase,
    });
    for (const purchase of purchases)
      await requestCollectionReconciliation(tx, {
        customerId: customer.id,
        kind: "credit_purchase",
        subjectId: purchase.id,
        risk: adverse,
      });
    return { accepted: true, duplicate: false };
  });
}

/** Pending adverse events hold new use until their authoritative provider read succeeds. */
export async function hasPendingCompassoReview(
  reader: Database | Tx,
  groupId: string,
  kind?: Job["kind"],
) {
  const [pending] = await reader
    .select({ id: collectionBillingJobs.id })
    .from(collectionBillingJobs)
    .innerJoin(customers, eq(customers.id, collectionBillingJobs.customerId))
    .innerJoin(collectionAccounts, sql`${collectionAccounts.id}::text = ${customers.subjectId}`)
    .where(
      and(
        eq(customers.app, "compasso"),
        eq(customers.provider, "stripe"),
        eq(customers.subjectType, "billing_account"),
        eq(collectionAccounts.collection, "compasso"),
        eq(collectionAccounts.groupId, groupId),
        sql`${collectionBillingJobs.riskVersion} > ${collectionBillingJobs.processedVersion}`,
        kind ? eq(collectionBillingJobs.kind, kind) : undefined,
      ),
    )
    .limit(1);
  return (
    !!pending ||
    (kind !== "subscription" && (await hasPendingLegacyCreditReview(reader, { groupId })))
  );
}

export class CompassoBillingReviewError extends BillingError {
  override name = "CompassoBillingReviewError";
  constructor() {
    super("A cobrança está em conferência. Aguarde a atualização antes de continuar.");
  }
}
export async function assertCompassoFundingClear(reader: Database | Tx, groupId: string) {
  if (await hasPendingCompassoReview(reader, groupId)) throw new CompassoBillingReviewError();
}

/** Fair bounded batches with durable leases. A new event arriving during a run remains pending. */
export async function runCollectionBillingJobs(
  deps: {
    db: Database;
    reconcile: (
      job: Pick<Job, "customerId" | "kind" | "subjectId">,
    ) => Promise<{ terminal?: boolean; retryAfterSeconds?: number }>;
    onError: (jobId: string, error: unknown) => void | Promise<void>;
  },
  options: { limit?: number; customerId?: string } = {},
) {
  const limit = options.limit ?? 25;
  z.number().int().min(1).max(100).parse(limit);
  if (options.customerId) z.uuid().parse(options.customerId);
  const jobs = await deps.db.transaction(async (tx) => {
    const due = alias(collectionBillingJobs, "due_job");
    const selected = await tx
      .select({ job: due })
      .from(due)
      .innerJoin(customers, eq(customers.id, due.customerId))
      .where(
        and(
          eq(customers.app, "compasso"),
          eq(customers.provider, "stripe"),
          options.customerId ? eq(customers.id, options.customerId) : undefined,
          lte(due.nextAttemptAt, sql`now()`),
          or(isNull(due.leaseUntil), lte(due.leaseUntil, sql`now()`)),
        ),
      )
      .orderBy(due.nextAttemptAt, due.id)
      .limit(limit)
      .for("update", { of: due, skipLocked: true });
    const claimed: (Job & { leaseToken: string })[] = [];
    for (const { job } of selected) {
      const leaseToken = randomUUID();
      await tx
        .update(collectionBillingJobs)
        .set({ leaseToken, leaseUntil: sql`now() + interval '10 minutes'` })
        .where(eq(collectionBillingJobs.id, job.id));
      claimed.push({ ...job, leaseToken });
    }
    return claimed;
  });
  let processed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      const result = await deps.reconcile(job);
      const retryAfterSeconds = result.retryAfterSeconds ?? 21600;
      z.number().int().min(1).max(21600).parse(retryAfterSeconds);
      if (result.terminal) {
        await deps.db
          .delete(collectionBillingJobs)
          .where(
            and(
              eq(collectionBillingJobs.id, job.id),
              eq(collectionBillingJobs.leaseToken, job.leaseToken),
              eq(collectionBillingJobs.requestedVersion, job.requestedVersion),
            ),
          );
      }
      // If a new event raced with terminal resolution, retain it for one more pass.
      await deps.db
        .update(collectionBillingJobs)
        .set({
          processedVersion: job.requestedVersion,
          attempts: 0,
          lastSucceededAt: sql`now()`,
          nextAttemptAt: sql`case when ${collectionBillingJobs.requestedVersion} > ${job.requestedVersion} then now() else now() + interval '1 second' * ${retryAfterSeconds} end`,
          leaseToken: null,
          leaseUntil: null,
        })
        .where(
          and(
            eq(collectionBillingJobs.id, job.id),
            eq(collectionBillingJobs.leaseToken, job.leaseToken),
          ),
        );
      processed++;
    } catch (error) {
      failed++;
      await deps.db
        .update(collectionBillingJobs)
        .set({
          attempts: sql`${collectionBillingJobs.attempts} + 1`,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: sql`now() + interval '1 second' * least(21600, 30 * power(2, least(${collectionBillingJobs.attempts}, 10)))`,
        })
        .where(
          and(
            eq(collectionBillingJobs.id, job.id),
            eq(collectionBillingJobs.leaseToken, job.leaseToken),
          ),
        );
      try {
        await deps.onError(job.id, error);
      } catch {
        /* Telemetry never interrupts the durable batch. */
      }
    }
  }
  return { attempted: jobs.length, processed, failed };
}
