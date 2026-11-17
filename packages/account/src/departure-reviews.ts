import { randomUUID } from "node:crypto";
import { getCollectionApps } from "@informach/config/collections";
import { and, asc, type Database, eq, gt, inArray, ne, or, sql } from "@informach/db";
import {
  accountDepartureAssessments as assessments,
  accountDepartureReviews as reviews,
  users,
} from "@informach/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const departureAssessmentSchema = z.strictObject({
  version: z.literal(1),
  hasPersonalData: z.boolean(),
  hasSharedData: z.boolean(),
  activeCredentials: count,
  managedProfiles: count,
  sharedProfiles: count,
  pendingOperations: count,
});
export type DepartureAssessment = z.infer<typeof departureAssessmentSchema>;

export class DepartureReviewError extends Error {
  constructor(readonly code: "unauthorized" | "not-found" | "unsupported-app") {
    super(code);
    this.name = "DepartureReviewError";
  }
}

const eligibleActor = (id: string) =>
  and(
    eq(users.id, id),
    eq(users.emailVerified, true),
    or(eq(users.banned, false), sql`${users.banExpiresAt} <= clock_timestamp()`),
  );

async function requireActor(tx: Transaction, actorId: string) {
  const [actor] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eligibleActor(actorId))
    .for("share");
  if (!actor) throw new DepartureReviewError("unauthorized");
}

const currentApps = () =>
  getCollectionApps("compasso")
    .map((app) => app.slug)
    .sort();
const sameCatalog = (apps: readonly string[]) =>
  JSON.stringify([...apps].sort()) === JSON.stringify(currentApps());

/** The caller supplies a recently authenticated actor, never a form-provided ID.
 * A fresh request replaces an older review; it never authorizes deletion. */
export function beginDepartureReview(db: Database, actorId: string, refresh = false) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId);
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`account:departure-review:${actorId}`}, 0))`,
    );
    const [existing] = await tx
      .select({
        id: reviews.id,
        fresh: sql<boolean>`${reviews.expiresAt} > clock_timestamp()`.mapWith(Boolean),
      })
      .from(reviews)
      .where(and(eq(reviews.actorId, actorId), ne(reviews.state, "cancelled")))
      .for("update");
    if (existing?.fresh && !refresh) {
      const apps = await tx
        .select({ app: assessments.app })
        .from(assessments)
        .where(eq(assessments.reviewId, existing.id));
      if (sameCatalog(apps.map((row) => row.app))) return existing.id;
    }
    if (existing)
      await tx.update(reviews).set({ state: "cancelled" }).where(eq(reviews.id, existing.id));
    const [review] = await tx
      .insert(reviews)
      .values({ actorId, expiresAt: sql`clock_timestamp() + interval '30 minutes'` })
      .returning({ id: reviews.id });
    if (!review) throw new Error("Departure review insert failed");
    const apps = currentApps();
    if (!apps.length) throw new Error("Compasso catalog is empty");
    await tx.insert(assessments).values(apps.map((app) => ({ reviewId: review.id, app })));
    return review.id;
  });
}

export function readDepartureReview(db: Database, actorId: string, reviewId: string) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId);
    const [review] = await tx
      .select({
        id: reviews.id,
        state: reviews.state,
        createdAt: reviews.createdAt,
        expiresAt: reviews.expiresAt,
        expired: sql<boolean>`${reviews.expiresAt} <= clock_timestamp()`.mapWith(Boolean),
      })
      .from(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.actorId, actorId)))
      .for("share");
    if (!review) throw new DepartureReviewError("not-found");
    const rows = await tx
      .select({
        app: assessments.app,
        state: assessments.state,
        result: assessments.result,
        observedAt: assessments.observedAt,
        retrying: sql<boolean>`${assessments.lastError} is not null`.mapWith(Boolean),
      })
      .from(assessments)
      .where(eq(assessments.reviewId, reviewId))
      .orderBy(asc(assessments.app));
    const stale = !sameCatalog(rows.map((row) => row.app));
    const usable = review.state !== "cancelled" && !review.expired && !stale;
    return {
      ...review,
      stale,
      complete: usable && review.state === "ready" && rows.every((row) => row.state === "done"),
      // Expired/cancelled results are not a current assessment of someone's data.
      apps: rows.map((row) => ({ ...row, result: usable ? row.result : null })),
    };
  });
}

export function cancelDepartureReview(db: Database, actorId: string, reviewId: string) {
  return db.transaction(async (tx) => {
    await requireActor(tx, actorId);
    const changed = await tx
      .update(reviews)
      .set({ state: "cancelled" })
      .where(and(eq(reviews.id, reviewId), eq(reviews.actorId, actorId)))
      .returning({ id: reviews.id });
    if (!changed.length) throw new DepartureReviewError("not-found");
  });
}

export type DepartureAssessmentClaim = {
  id: string;
  reviewId: string;
  actorId: string;
  app: string;
  token: string;
};

/** App is fixed in the worker composition. No route accepts an arbitrary app. */
export async function claimDepartureAssessment(db: Database, app: string) {
  if (!currentApps().includes(app)) throw new DepartureReviewError("unsupported-app");
  return db.transaction(async (tx): Promise<DepartureAssessmentClaim | null> => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const due = alias(assessments, "due_departure_assessment");
    const parent = alias(reviews, "due_departure_review");
    const [job] = await tx
      .select({ id: due.id, reviewId: due.reviewId, actorId: parent.actorId })
      .from(due)
      .innerJoin(parent, eq(parent.id, due.reviewId))
      .innerJoin(users, eq(users.id, parent.actorId))
      .where(
        and(
          eq(due.app, app),
          eq(parent.state, "collecting"),
          gt(parent.expiresAt, sql`clock_timestamp()`),
          eq(users.emailVerified, true),
          or(eq(users.banned, false), sql`${users.banExpiresAt} <= clock_timestamp()`),
          ne(due.state, "done"),
          sql`${due.availableAt} <= clock_timestamp()`,
          sql`(${due.leaseUntil} is null or ${due.leaseUntil} <= clock_timestamp())`,
        ),
      )
      .orderBy(asc(due.availableAt), asc(due.id))
      .limit(1)
      // All completion paths lock the review before changing jobs. SKIP LOCKED
      // also keeps a concurrent cancellation from delaying the next account.
      .for("update", { of: [parent, due], skipLocked: true });
    if (!job) return null;
    const token = randomUUID();
    await tx
      .update(assessments)
      .set({
        state: "running",
        attempts: sql`${assessments.attempts} + 1`,
        leaseToken: token,
        leaseUntil: sql`clock_timestamp() + interval '90 seconds'`,
      })
      .where(eq(assessments.id, job.id));
    return { ...job, app, token };
  });
}

/** Fences late workers after cancellation, expiry, retry or identity revocation.
 * A successful receipt means only that this read-only assessment was collected. */
export async function finishDepartureAssessment(
  db: Database,
  claim: DepartureAssessmentClaim,
  result: DepartureAssessment | null,
) {
  const parsed = result === null ? null : departureAssessmentSchema.parse(result);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const review = alias(reviews, "completing_departure_review");
    const [parent] = await tx
      .select({ id: review.id })
      .from(review)
      .innerJoin(users, eq(users.id, review.actorId))
      .where(
        and(
          eq(review.id, claim.reviewId),
          eq(review.actorId, claim.actorId),
          eq(review.state, "collecting"),
          gt(review.expiresAt, sql`clock_timestamp()`),
          eligibleActor(claim.actorId),
        ),
      )
      .for("update", { of: review });
    if (!parent) return false;
    const [updated] = await tx
      .update(assessments)
      .set(
        parsed
          ? {
              state: "done",
              result: parsed,
              observedAt: sql`clock_timestamp()`,
              leaseToken: null,
              leaseUntil: null,
              lastError: null,
            }
          : {
              state: "queued",
              leaseToken: null,
              leaseUntil: null,
              lastError: "assessment_failed",
              availableAt: sql`clock_timestamp() + least(${assessments.attempts} * 15, 300) * interval '1 second'`,
            },
      )
      .where(
        and(
          eq(assessments.id, claim.id),
          eq(assessments.reviewId, claim.reviewId),
          eq(assessments.app, claim.app),
          eq(assessments.state, "running"),
          eq(assessments.leaseToken, claim.token),
          gt(assessments.leaseUntil, sql`clock_timestamp()`),
        ),
      )
      .returning({ id: assessments.id });
    if (!updated) return false;
    if (parsed) {
      const [pending] = await tx
        .select({ id: assessments.id })
        .from(assessments)
        .where(and(eq(assessments.reviewId, claim.reviewId), ne(assessments.state, "done")))
        .limit(1);
      if (!pending)
        await tx.update(reviews).set({ state: "ready" }).where(eq(reviews.id, claim.reviewId));
    }
    return true;
  });
}

export async function processDepartureAssessments(input: {
  db: Database;
  app: string;
  assess: (actorId: string) => Promise<DepartureAssessment>;
  limit?: number;
}) {
  const limit = z
    .number()
    .int()
    .min(1)
    .max(20)
    .parse(input.limit ?? 10);
  let completed = 0;
  let failed = 0;
  let discarded = 0;
  const deadline = performance.now() + 45_000;
  for (let i = 0; i < limit; i++) {
    // Stop between claims. Never abandon an in-flight assessment; adapters
    // bound each database statement, and the receipt always resolves its lease.
    if (performance.now() >= deadline) break;
    const claim = await claimDepartureAssessment(input.db, input.app);
    if (!claim) break;
    let result: DepartureAssessment;
    try {
      // Adapters enforce a bounded DB statement timeout. No content or raw
      // exception is persisted in the review, receipt, job metrics or logs.
      result = departureAssessmentSchema.parse(await input.assess(claim.actorId));
    } catch {
      if (await finishDepartureAssessment(input.db, claim, null)) failed++;
      else discarded++;
      continue;
    }
    if (await finishDepartureAssessment(input.db, claim, result)) completed++;
    else discarded++;
  }
  return { completed, failed, discarded };
}

/** Read-only assessment cache, not a closure receipt or an audit record.
 * Keep it for 24 hours after expiry for operational diagnosis, then remove a
 * bounded batch. The parent lock serializes deletion with all worker receipts. */
export function purgeExpiredDepartureReviews(db: Database, limit = 100) {
  const batchSize = z.number().int().min(1).max(500).parse(limit);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const expired = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(sql`${reviews.expiresAt} <= statement_timestamp() - interval '24 hours'`)
      .orderBy(asc(reviews.expiresAt), asc(reviews.id))
      .limit(batchSize)
      .for("update", { skipLocked: true });
    if (!expired.length) return { removed: 0 };
    const ids = expired.map((row) => row.id);
    await tx.delete(assessments).where(inArray(assessments.reviewId, ids));
    await tx.delete(reviews).where(inArray(reviews.id, ids));
    return { removed: ids.length };
  });
}
