import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, type Database, eq, gt, inArray, ne, sql } from "@informach/db";
import {
  accountWebClosures as closures,
  accountWebClosureSteps as steps,
} from "@informach/db/schema";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import {
  closureDomains,
  sameClosureCatalog,
  type WebClosureAuthority,
  WebClosureError,
  type WebClosureExecution,
  type WebClosurePlan,
  webClosurePlanSchema,
} from "./closure-contract";
import {
  auditClosure,
  type ClosureTransaction,
  frozenClosure,
  lockClosure,
  preparedClosure,
} from "./closure-internal";

const claimSchema = z.strictObject({
  id: z.uuid(),
  closureId: z.uuid(),
  actorId: z.string().min(1).max(200),
  domain: z.string().min(1).max(84),
  phase: z.enum(["prepare", "erase", "resume"]),
  frozenRevision: z.number().int().positive(),
  token: z.uuid(),
});
export type WebClosureClaim = z.infer<typeof claimSchema>;
const phaseState = { prepare: "preparing", erase: "executing", resume: "resuming" } as const;

/** The worker fixes its domain in server composition. Billing settles first;
 * family detachment waits for every app. Preparation is read-only and independent. */
export function claimWebClosureStep(db: Database, domain: string) {
  if (!closureDomains().includes(domain)) throw new WebClosureError("unsupported-domain");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10s'`);
    const due = alias(steps, "due_closure_step");
    const parent = alias(closures, "due_closure");
    const [job] = await tx
      .select({ step: due, closure: parent })
      .from(due)
      .innerJoin(parent, eq(parent.id, due.closureId))
      .where(
        and(
          eq(due.domain, domain),
          inArray(due.state, ["queued", "running"]),
          sql`${due.availableAt} <= clock_timestamp()`,
          sql`(${due.leaseUntil} is null or ${due.leaseUntil} <= clock_timestamp())`,
          sql`((${due.phase} = 'prepare' and ${parent.state} in ('preparing','repreparing')) or (${due.phase} = 'erase' and ${parent.state} = 'executing') or (${due.phase} = 'resume' and ${parent.state} = 'resuming'))`,
          sql`(${due.phase} = 'prepare' or ${due.domain} = 'billing' or (
        exists (select 1 from ${steps} billing_step where billing_step.closure_id = ${parent.id} and billing_step.phase = ${due.phase} and billing_step.domain = 'billing' and billing_step.state = 'done')
        and (${due.domain} <> 'family' or not exists (select 1 from ${steps} app_step where app_step.closure_id = ${parent.id} and app_step.phase = ${due.phase} and app_step.domain <> 'family' and app_step.state <> 'done'))
      ))`,
        ),
      )
      .orderBy(asc(due.availableAt), asc(due.id))
      .limit(1)
      .for("update", { of: [parent, due], skipLocked: true });
    if (!job) return null;
    if (!sameClosureCatalog(job.closure.catalog)) throw new WebClosureError("catalog-changed");
    await frozenClosure(tx, job.closure);
    const token = randomUUID();
    await tx
      .update(steps)
      .set({
        state: "running",
        attempts: sql`${steps.attempts} + 1`,
        leaseToken: token,
        leaseUntil: sql`clock_timestamp() + interval '90 seconds'`,
        lastError: null,
      })
      .where(eq(steps.id, job.step.id));
    return {
      id: job.step.id,
      closureId: job.closure.id,
      actorId: job.closure.actorId,
      frozenRevision: job.closure.frozenRevision,
      domain,
      phase: job.step.phase,
      token,
    } satisfies WebClosureClaim;
  });
}

async function currentClaim(tx: ClosureTransaction, raw: WebClosureClaim) {
  const claim = claimSchema.parse(raw);
  await tx.execute(sql`set local statement_timeout = '10s'`);
  const row = await lockClosure(tx, claim.closureId);
  if (
    row.actorId !== claim.actorId ||
    row.frozenRevision !== claim.frozenRevision ||
    (row.state !== phaseState[claim.phase] &&
      !(claim.phase === "prepare" && row.state === "repreparing"))
  )
    return null;
  if (!sameClosureCatalog(row.catalog) || !closureDomains(row.catalog).includes(claim.domain))
    return null;
  const [step] = await tx
    .select()
    .from(steps)
    .where(
      and(
        eq(steps.id, claim.id),
        eq(steps.closureId, row.id),
        eq(steps.domain, claim.domain),
        eq(steps.phase, claim.phase),
        eq(steps.state, "running"),
        eq(steps.leaseToken, claim.token),
        gt(steps.leaseUntil, sql`clock_timestamp()`),
      ),
    )
    .for("update");
  return step ? { row, step, claim } : null;
}

async function executionContext(
  tx: ClosureTransaction,
  claim: WebClosureClaim,
): Promise<WebClosureExecution> {
  if (claim.phase === "prepare") throw new WebClosureError("stale-claim");
  const [preparation] = await tx
    .select({ plan: steps.plan })
    .from(steps)
    .where(
      and(
        eq(steps.closureId, claim.closureId),
        eq(steps.domain, claim.domain),
        eq(steps.phase, "prepare"),
        eq(steps.state, "done"),
      ),
    );
  const plan = preparation?.plan ? webClosurePlanSchema.parse(preparation.plan) : null;
  if (claim.phase === "erase" && (!plan || plan.blockers.length))
    throw new WebClosureError("not-ready");
  return {
    actorId: claim.actorId,
    operationId: claim.closureId,
    frozenRevision: claim.frozenRevision,
    phase: claim.phase,
    plan,
  };
}

/** Extend only a live, exact execution claim; never resurrect an elapsed lease
 * or a worker invalidated by a pause/new consent. No domain locks are acquired. */
export function renewWebClosureStep(db: Database, raw: WebClosureClaim) {
  if (raw.phase === "prepare") throw new WebClosureError("stale-claim");
  return db.transaction(async (tx) => {
    const current = await currentClaim(tx, raw);
    if (!current) return false;
    await frozenClosure(tx, current.row);
    await tx
      .update(steps)
      .set({ leaseUntil: sql`clock_timestamp() + interval '90 seconds'` })
      .where(eq(steps.id, current.step.id));
    return true;
  });
}

async function reconcileWithLease(db: Database, claim: WebClosureClaim, run: () => Promise<void>) {
  let lost = false;
  let renewal: Promise<void> | undefined;
  const deadline = performance.now() + 150_000;
  const timer = setInterval(() => {
    if (renewal || lost) return;
    renewal = (async () => {
      try {
        if (performance.now() >= deadline || !(await renewWebClosureStep(db, claim))) lost = true;
      } catch {
        // A failed ownership check fails closed, even if provider work succeeds.
        lost = true;
      } finally {
        renewal = undefined;
      }
    })();
  }, 20_000);
  timer.unref();
  try {
    await run();
  } finally {
    clearInterval(timer);
    await renewal;
  }
  if (lost || performance.now() >= deadline) throw new WebClosureError("stale-claim");
}

async function recordCompletion(
  tx: ClosureTransaction,
  claim: WebClosureClaim,
  plan: WebClosurePlan | null,
) {
  const [recorded] = await tx
    .update(steps)
    .set({
      state: "done",
      plan,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      completedAt: sql`clock_timestamp()`,
    })
    .where(
      and(
        eq(steps.id, claim.id),
        eq(steps.leaseToken, claim.token),
        eq(steps.state, "running"),
        gt(steps.leaseUntil, sql`clock_timestamp()`),
      ),
    )
    .returning({ id: steps.id });
  // An elapsed lease must roll back domain effects as well as the receipt.
  if (!recorded) throw new WebClosureError("stale-claim");
  await logAuditEventStrict(
    "user.web_closure_step_completed",
    claim.actorId,
    {
      scope: "compasso-web",
      operationId: claim.closureId,
      domain: claim.domain,
      phase: claim.phase,
    },
    { writer: tx },
  );
}

export function finishWebClosurePreparation(
  db: Database,
  raw: WebClosureClaim,
  rawPlan: WebClosurePlan,
) {
  const plan = webClosurePlanSchema.parse(rawPlan);
  return prepareWebClosureStep(db, raw, async () => plan);
}

/** Domain authority, selection and its receipt share the fenced transaction.
 * Like execution, the adapter takes family locks before participation locks. */
export function prepareWebClosureStep(
  db: Database,
  raw: WebClosureClaim,
  prepare: (tx: ClosureTransaction, authority: WebClosureAuthority) => Promise<WebClosurePlan>,
) {
  if (raw.phase !== "prepare") throw new WebClosureError("stale-claim");
  return db.transaction(async (tx) => {
    const current = await currentClaim(tx, raw);
    if (!current) return false;
    const plan = webClosurePlanSchema.parse(
      await prepare(tx, {
        actorId: current.row.actorId,
        operationId: current.row.id,
        frozenRevision: current.row.frozenRevision,
      }),
    );
    await frozenClosure(tx, current.row);
    await recordCompletion(tx, current.claim, plan);
    const [pending] = await tx
      .select({ id: steps.id })
      .from(steps)
      .where(
        and(
          eq(steps.closureId, current.row.id),
          eq(steps.phase, "prepare"),
          ne(steps.state, "done"),
        ),
      )
      .limit(1);
    if (!pending) {
      const prepared = await preparedClosure(tx, current.row);
      if (!prepared.blocked) {
        const state = current.row.state === "repreparing" ? "review_required" : "ready";
        await tx.update(closures).set({ state }).where(eq(closures.id, current.row.id));
        await auditClosure(tx, current.row, state);
      }
    }
    return true;
  });
}

/** Effects must be PostgreSQL-only, scoped by the domain and revalidated against
 * the exact prepared plan. No network/provider calls inside this transaction.
 * Billing/provider idempotency is completed outside, then verified here by its adapter.
 * The callback takes family locks BEFORE its frozen-participation/content guards. */
export function commitWebClosureStep(
  db: Database,
  raw: WebClosureClaim,
  effect: (tx: ClosureTransaction, context: WebClosureExecution) => Promise<void>,
) {
  if (raw.phase === "prepare") throw new WebClosureError("stale-claim");
  const phase = raw.phase;
  return db.transaction(async (tx) => {
    const current = await currentClaim(tx, raw);
    if (!current) return false;
    await effect(tx, await executionContext(tx, current.claim));
    // The request stays locked throughout. This final guard also rolls back an
    // unsupported/manual participation transition racing the domain transaction.
    await frozenClosure(tx, current.row);
    await recordCompletion(tx, current.claim, null);
    const [pending] = await tx
      .select({ id: steps.id })
      .from(steps)
      .where(
        and(eq(steps.closureId, current.row.id), eq(steps.phase, phase), ne(steps.state, "done")),
      )
      .limit(1);
    if (!pending && phase === "erase") {
      await tx.update(closures).set({ state: "finalizing" }).where(eq(closures.id, current.row.id));
      await auditClosure(tx, current.row, "finalizing");
    }
    return true;
  });
}

/** Persist only a classified outcome, never provider messages or private data. */
export function failWebClosureStep(
  db: Database,
  raw: WebClosureClaim,
  reason: "step_failed" | "scope_changed",
) {
  z.enum(["step_failed", "scope_changed"]).parse(reason);
  return db.transaction(async (tx) => {
    const current = await currentClaim(tx, raw);
    if (!current) return false;
    if (reason === "scope_changed" && raw.phase === "erase") {
      // Stop the whole operation, including already leased app work. External
      // effects still use their previously authorized, domain-checked selection;
      // their late database completion can no longer use these tokens.
      await tx
        .update(steps)
        .set({
          state: "queued",
          leaseToken: null,
          leaseUntil: null,
          lastError: sql`case when ${steps.id} = ${current.step.id} then 'scope_changed' else ${steps.lastError} end`,
          availableAt: sql`clock_timestamp()`,
        })
        .where(
          and(
            eq(steps.closureId, current.row.id),
            eq(steps.phase, "erase"),
            ne(steps.state, "done"),
          ),
        );
      await tx.update(closures).set({ state: "paused" }).where(eq(closures.id, current.row.id));
      await auditClosure(tx, current.row, "paused");
      return true;
    }
    await tx
      .update(steps)
      .set({
        state: "queued",
        leaseToken: null,
        leaseUntil: null,
        lastError: reason,
        availableAt: sql`clock_timestamp() + least(${steps.attempts} * 15, 300) * interval '1 second'`,
      })
      .where(eq(steps.id, current.step.id));
    return true;
  });
}

export type WebClosureAdapter = {
  prepare: (tx: ClosureTransaction, authority: WebClosureAuthority) => Promise<WebClosurePlan>;
  /** Bounded, idempotent reconciliation/provider work outside DB locks. Erasure
   * must revalidate its plan before provider deletion. Resume must target only
   * the admitted operation/revision so late work cannot affect newly created data. */
  beforeCommit?: (context: WebClosureExecution) => Promise<void>;
  execute: (tx: ClosureTransaction, context: WebClosureExecution) => Promise<void>;
};

/** Server composition fixes the domain and adapter; HTTP supplies neither actor
 * nor callbacks. Failures remain retryable and contain no private exception text. */
export async function processWebClosureSteps(input: {
  db: Database;
  domain: string;
  adapter: WebClosureAdapter;
  limit?: number;
}) {
  const limit = z
    .number()
    .int()
    .min(1)
    .max(20)
    .parse(input.limit ?? 10);
  let completed = 0,
    failed = 0,
    discarded = 0;
  const deadline = performance.now() + 45_000;
  for (let index = 0; index < limit && performance.now() < deadline; index++) {
    const claim = await claimWebClosureStep(input.db, input.domain);
    if (!claim) break;
    try {
      let recorded: boolean;
      if (claim.phase === "prepare")
        recorded = await prepareWebClosureStep(input.db, claim, input.adapter.prepare);
      else {
        if (input.adapter.beforeCommit) {
          const context = await input.db.transaction(async (tx) => {
            const current = await currentClaim(tx, claim);
            if (!current) return null;
            await frozenClosure(tx, current.row);
            return executionContext(tx, current.claim);
          });
          if (!context) {
            discarded++;
            continue;
          }
          const beforeCommit = input.adapter.beforeCommit;
          await reconcileWithLease(input.db, claim, () => beforeCommit(context));
        }
        recorded = await commitWebClosureStep(input.db, claim, input.adapter.execute);
      }
      if (recorded) completed++;
      else discarded++;
    } catch (error) {
      const reason =
        error instanceof WebClosureError && ["stale-plan", "catalog-changed"].includes(error.code)
          ? "scope_changed"
          : "step_failed";
      if (await failWebClosureStep(input.db, claim, reason)) failed++;
      else discarded++;
    }
  }
  return { completed, failed, discarded };
}
