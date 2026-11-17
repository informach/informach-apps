import { randomUUID } from "node:crypto";
import {
  closeWebParticipation,
  freezeWebParticipation,
  readWebParticipation,
  resumeWebParticipation,
} from "@informach/auth/web-participation";
import { and, type Database, eq, gt, ne, sql } from "@informach/db";
import {
  accountDepartureAssessments as assessments,
  accountWebClosures as closures,
  accountWebClosureConsents as consents,
  accountDepartureReviews as reviews,
  accountWebClosureSteps as steps,
} from "@informach/db/schema";
import { notInArray } from "drizzle-orm";
import { z } from "zod";
import {
  type ClosureActor,
  closureCatalog,
  closureDomains,
  sameClosureCatalog,
  WebClosureError,
} from "./closure-contract";
import {
  auditClosure,
  enqueueClosurePhase,
  frozenClosure,
  lockClosure,
  lockClosureActor,
  preparedClosure,
  requireClosureActor,
} from "./closure-internal";

export {
  type ClosureActor,
  type WebClosureAuthority,
  WebClosureError,
  type WebClosureExecution,
  type WebClosurePlan,
  webClosurePlanSchema,
} from "./closure-contract";
export {
  claimWebClosureStep,
  commitWebClosureStep,
  failWebClosureStep,
  finishWebClosurePreparation,
  prepareWebClosureStep,
  processWebClosureSteps,
  renewWebClosureStep,
  type WebClosureAdapter,
  type WebClosureClaim,
} from "./closure-steps";

/** Internal until every domain adapter is installed. This captures preparation
 * intent only; irreversible effects require a separate consent to the frozen plan. */
export function beginWebClosure(db: Database, actor: ClosureActor, sourceReviewId: string) {
  z.uuid().parse(sourceReviewId);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const [existing] = await tx
      .select()
      .from(closures)
      .where(and(eq(closures.actorId, actor.actorId), ne(closures.state, "cancelled")))
      .for("update");
    if (existing) {
      if (existing.sourceReviewId !== sourceReviewId)
        throw new WebClosureError("already-requested");
      return existing.id;
    }
    const [review] = await tx
      .select({ id: reviews.id })
      .from(reviews)
      .where(
        and(
          eq(reviews.id, sourceReviewId),
          eq(reviews.actorId, actor.actorId),
          eq(reviews.state, "ready"),
          gt(reviews.expiresAt, sql`clock_timestamp()`),
        ),
      )
      .for("share");
    if (!review) throw new WebClosureError("review-unavailable");
    const appReviews = await tx
      .select({ app: assessments.app, state: assessments.state })
      .from(assessments)
      .where(eq(assessments.reviewId, sourceReviewId))
      .orderBy(assessments.app);
    const catalog = closureCatalog();
    if (
      !sameClosureCatalog(appReviews.map((row) => row.app)) ||
      appReviews.some((row) => row.state !== "done")
    )
      throw new WebClosureError("review-unavailable");
    const current = await readWebParticipation(tx, actor.actorId);
    if (current.state !== "active") throw new WebClosureError("already-requested");
    const id = randomUUID();
    const [row] = await tx
      .insert(closures)
      .values({
        id,
        actorId: actor.actorId,
        sourceReviewId,
        catalog,
        frozenRevision: current.revision + 1,
      })
      .returning();
    if (!row) throw new Error("Closure insert failed");
    await freezeWebParticipation(tx, {
      userId: actor.actorId,
      operationId: id,
      expectedRevision: current.revision,
    });
    await enqueueClosurePhase(tx, row, "prepare");
    await auditClosure(tx, row, "preparing");
    return id;
  });
}

export function readWebClosure(db: Database, actor: ClosureActor, closureId: string) {
  z.uuid().parse(closureId);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const row = await lockClosure(tx, closureId, actor.actorId);
    const records = await tx
      .select({
        domain: steps.domain,
        phase: steps.phase,
        state: steps.state,
        attempts: steps.attempts,
        plan: steps.plan,
        lastError: steps.lastError,
        completedAt: steps.completedAt,
      })
      .from(steps)
      .where(eq(steps.closureId, row.id))
      .orderBy(steps.phase, steps.domain);
    const prepared = ["ready", "review_required"].includes(row.state)
      ? await preparedClosure(tx, row)
      : null;
    return {
      id: row.id,
      scope: row.scope,
      state: row.state,
      planRevision: row.planRevision,
      createdAt: row.createdAt,
      confirmedAt: row.confirmedAt,
      completedAt: row.completedAt,
      digest: prepared?.digest ?? null,
      steps: records,
    };
  });
}

/** Reauthentication returns to a fixed path; the operation is resolved from
 * the authenticated owner instead of retaining an arbitrary URL identifier. */
export async function readCurrentWebClosure(db: Database, actor: ClosureActor) {
  const current = await db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const [row] = await tx
      .select({ id: closures.id })
      .from(closures)
      .where(and(eq(closures.actorId, actor.actorId), ne(closures.state, "cancelled")))
      .limit(1);
    return row;
  });
  return current ? readWebClosure(db, actor, current.id) : null;
}

export function confirmWebClosure(
  db: Database,
  actor: ClosureActor,
  closureId: string,
  digest: string,
) {
  z.uuid().parse(closureId);
  z.string()
    .regex(/^[a-f0-9]{64}$/)
    .parse(digest);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const row = await lockClosure(tx, closureId, actor.actorId);
    if (
      ["executing", "finalizing", "completed"].includes(row.state) &&
      row.consentDigest === digest
    )
      return row.id;
    if (row.state !== "ready" && row.state !== "review_required")
      throw new WebClosureError("not-ready");
    const prepared = await preparedClosure(tx, row);
    if (prepared.blocked) throw new WebClosureError("not-ready");
    if (prepared.digest !== digest) throw new WebClosureError("stale-plan");
    await frozenClosure(tx, row);
    await tx.insert(consents).values({
      closureId: row.id,
      revision: row.planRevision,
      digest: prepared.digest,
      plans: prepared.plans,
    });
    await enqueueClosurePhase(tx, row, "erase");
    await tx
      .update(closures)
      .set({ state: "executing", consentDigest: digest, confirmedAt: sql`clock_timestamp()` })
      .where(eq(closures.id, row.id));
    await auditClosure(tx, row, "executing");
    return row.id;
  });
}

/** Partial erasure cannot be undone. Re-plan unfinished domains with fresh
 * consent; retain completed receipts and the exact previous authorization. */
export function reprepareWebClosureRemainder(db: Database, actor: ClosureActor, closureId: string) {
  z.uuid().parse(closureId);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const row = await lockClosure(tx, closureId, actor.actorId);
    if (!["paused", "repreparing", "review_required"].includes(row.state))
      throw new WebClosureError("not-ready");
    if (!sameClosureCatalog(row.catalog)) throw new WebClosureError("catalog-changed");
    await frozenClosure(tx, row);
    // Preserve authorizations from older coordinator deployments too. This is
    // the only point at which their prepared rows are about to be replaced.
    if (row.state === "paused") {
      const previous = await preparedClosure(tx, row);
      if (previous.digest !== row.consentDigest || !row.confirmedAt)
        throw new WebClosureError("stale-plan");
      await tx
        .insert(consents)
        .values({
          closureId: row.id,
          revision: row.planRevision,
          digest: previous.digest,
          plans: previous.plans,
          confirmedAt: row.confirmedAt,
        })
        .onConflictDoNothing({ target: [consents.closureId, consents.revision] });
    }
    const completed = await tx
      .select({ domain: steps.domain })
      .from(steps)
      .where(and(eq(steps.closureId, row.id), eq(steps.phase, "erase"), eq(steps.state, "done")));
    if (completed.length === closureDomains(row.catalog).length)
      throw new WebClosureError("not-ready");
    await tx
      .update(steps)
      .set({
        state: "queued",
        plan: null,
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        completedAt: null,
        availableAt: sql`clock_timestamp()`,
      })
      .where(
        and(
          eq(steps.closureId, row.id),
          eq(steps.phase, "prepare"),
          completed.length
            ? notInArray(
                steps.domain,
                completed.map((step) => step.domain),
              )
            : undefined,
        ),
      );
    await tx
      .update(closures)
      .set({
        state: "repreparing",
        planRevision: row.planRevision + 1,
      })
      .where(eq(closures.id, row.id));
    await auditClosure(tx, row, "repreparing");
    return row.id;
  });
}

/** Recheck settled operations or changed responsibilities before consent, while
 * staying frozen. Old workers and confirmation digests cannot authorize a new
 * selection. No erasure or resumption work can be restarted by this action. */
export function refreshWebClosurePreparation(db: Database, actor: ClosureActor, closureId: string) {
  z.uuid().parse(closureId);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const row = await lockClosure(tx, closureId, actor.actorId);
    if (row.state !== "preparing" && row.state !== "ready")
      throw new WebClosureError("irreversible");
    if (!sameClosureCatalog(row.catalog)) throw new WebClosureError("catalog-changed");
    await frozenClosure(tx, row);
    await tx
      .update(steps)
      .set({
        state: "queued",
        plan: null,
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        completedAt: null,
        availableAt: sql`clock_timestamp()`,
      })
      .where(and(eq(steps.closureId, row.id), eq(steps.phase, "prepare")));
    await tx.update(closures).set({ state: "preparing" }).where(eq(closures.id, row.id));
    await auditClosure(tx, row, "preparing");
    return row.id;
  });
}

/** Cancellation first settles reservations and clears stale app caches. It never
 * directly resumes participation while work from the former revision survives. */
export function requestWebClosureResumption(db: Database, actor: ClosureActor, closureId: string) {
  z.uuid().parse(closureId);
  return db.transaction(async (tx) => {
    await requireClosureActor(tx, actor);
    const row = await lockClosure(tx, closureId, actor.actorId);
    if (row.state === "resuming" || row.state === "cancelled") return row.id;
    if (row.state !== "preparing" && row.state !== "ready")
      throw new WebClosureError("irreversible");
    await frozenClosure(tx, row);
    await tx
      .update(steps)
      .set({
        state: "cancelled",
        leaseToken: null,
        leaseUntil: null,
        completedAt: sql`clock_timestamp()`,
        lastError: null,
      })
      .where(and(eq(steps.closureId, row.id), eq(steps.phase, "prepare"), ne(steps.state, "done")));
    await enqueueClosurePhase(tx, row, "resume");
    await tx.update(closures).set({ state: "resuming" }).where(eq(closures.id, row.id));
    await auditClosure(tx, row, "resuming");
    return row.id;
  });
}

/** Central maintenance only. Runs after domain transactions, with no family or
 * content locks. Incomplete adapters/receipts can never close or reopen access. */
export function finalizeWebClosure(db: Database, closureId: string) {
  z.uuid().parse(closureId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const [owner] = await tx
      .select({ actorId: closures.actorId })
      .from(closures)
      .where(eq(closures.id, closureId));
    if (!owner) throw new WebClosureError("not-found");
    await lockClosureActor(tx, owner.actorId);
    const row = await lockClosure(tx, closureId);
    if (row.state === "completed" || row.state === "cancelled") return row.state;
    if (row.state !== "finalizing" && row.state !== "resuming")
      throw new WebClosureError("not-ready");
    if (!sameClosureCatalog(row.catalog)) throw new WebClosureError("catalog-changed");
    const phase = row.state === "resuming" ? "resume" : "erase";
    const receipts = await tx
      .select({ domain: steps.domain, state: steps.state })
      .from(steps)
      .where(and(eq(steps.closureId, row.id), eq(steps.phase, phase)))
      .orderBy(steps.domain);
    if (
      JSON.stringify(receipts.map((step) => step.domain)) !==
        JSON.stringify(closureDomains(row.catalog)) ||
      receipts.some((step) => step.state !== "done")
    )
      throw new WebClosureError("not-ready");
    await frozenClosure(tx, row);
    const transition = {
      userId: row.actorId,
      operationId: row.id,
      expectedRevision: row.frozenRevision,
    };
    if (phase === "resume") await resumeWebParticipation(tx, transition);
    else await closeWebParticipation(tx, transition);
    const state = phase === "resume" ? "cancelled" : "completed";
    await tx
      .update(closures)
      .set({ state, completedAt: sql`clock_timestamp()` })
      .where(eq(closures.id, row.id));
    await auditClosure(tx, row, state);
    return state;
  });
}

/** Finalization is idempotent and uses the same session/operation locks as
 * authenticated requests. Only fully acknowledged operations enter the batch. */
export async function finalizeReadyWebClosures(db: Database, limit = 10) {
  z.number().int().min(1).max(50).parse(limit);
  const candidates = await db
    .select({ id: closures.id })
    .from(closures)
    .where(sql`
    ${closures.state} in ('finalizing', 'resuming') and not exists (
      select 1 from ${steps} pending where pending.closure_id = ${closures.id}
      and pending.phase = case when ${closures.state} = 'resuming' then 'resume' else 'erase' end
      and pending.state <> 'done'
    )`)
    .orderBy(closures.createdAt, closures.id)
    .limit(limit);
  let completed = 0,
    failed = 0;
  const deadline = performance.now() + 45_000;
  for (const candidate of candidates) {
    if (performance.now() >= deadline) break;
    try {
      await finalizeWebClosure(db, candidate.id);
      completed++;
    } catch {
      // A failed finalization is visible to the job recorder/HTTP caller and
      // remains durable for another attempt. Never include private error text.
      failed++;
    }
  }
  return { completed, failed, discarded: 0 };
}
