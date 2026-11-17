import { logAuditEventStrict } from "@informach/auth";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import {
  lockRecentCentralAuthentication,
  lockWebSessionChanges,
} from "@informach/auth/web-sessions";
import { and, type Database, eq, sql } from "@informach/db";
import {
  accountWebClosures as closures,
  accountWebClosureSteps as steps,
} from "@informach/db/schema";
import {
  type ClosureActor,
  closureActorSchema,
  closureDomains,
  sameClosureCatalog,
  WebClosureError,
  webClosurePlanDigest,
  webClosurePlanSchema,
} from "./closure-contract";

export type ClosureTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type ClosureRow = typeof closures.$inferSelect;

/** Serializes central requests with finalization before either takes session or
 * closure locks. Finalization revokes those sessions, so the order is shared. */
export async function lockClosureActor(tx: ClosureTransaction, actorId: string) {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`account:closure:${actorId}`}, 0))`,
  );
  await lockWebSessionChanges(tx, actorId);
}
export async function requireClosureActor(tx: ClosureTransaction, raw: ClosureActor) {
  const actor = closureActorSchema.parse(raw);
  await lockClosureActor(tx, actor.actorId);
  if (!(await lockRecentCentralAuthentication(tx, actor.actorId, actor.sessionId)))
    throw new WebClosureError("unauthorized");
  return actor;
}
export async function lockClosure(tx: ClosureTransaction, id: string, actorId?: string) {
  const [row] = await tx
    .select()
    .from(closures)
    .where(
      and(eq(closures.id, id), actorId === undefined ? undefined : eq(closures.actorId, actorId)),
    )
    .for("update");
  if (!row) throw new WebClosureError("not-found");
  return row;
}
export const frozenClosure = (tx: ClosureTransaction, row: ClosureRow) =>
  lockFrozenWebParticipation(tx, {
    userId: row.actorId,
    operationId: row.id,
    expectedRevision: row.frozenRevision,
  });
export async function auditClosure(
  tx: ClosureTransaction,
  row: ClosureRow,
  state: ClosureRow["state"],
) {
  await logAuditEventStrict(
    "user.web_closure_changed",
    row.actorId,
    { scope: "compasso-web", operationId: row.id, state },
    { writer: tx },
  );
}
export async function preparedClosure(tx: ClosureTransaction, row: ClosureRow) {
  if (!sameClosureCatalog(row.catalog)) throw new WebClosureError("catalog-changed");
  const records = await tx
    .select()
    .from(steps)
    .where(and(eq(steps.closureId, row.id), eq(steps.phase, "prepare")))
    .orderBy(steps.domain);
  const required = closureDomains(row.catalog);
  if (
    JSON.stringify(records.map((step) => step.domain)) !== JSON.stringify(required) ||
    records.some((step) => step.state !== "done" || step.plan === null)
  )
    throw new WebClosureError("not-ready");
  const plans = records.map((step) => ({
    domain: step.domain,
    plan: webClosurePlanSchema.parse(step.plan),
  }));
  return {
    plans,
    blocked: plans.some((item) => item.plan.blockers.length > 0),
    digest: webClosurePlanDigest(plans, row.planRevision),
  };
}
export async function enqueueClosurePhase(
  tx: ClosureTransaction,
  row: ClosureRow,
  phase: "prepare" | "erase" | "resume",
) {
  await tx
    .insert(steps)
    .values(closureDomains(row.catalog).map((domain) => ({ closureId: row.id, domain, phase })))
    .onConflictDoNothing({ target: [steps.closureId, steps.domain, steps.phase] });
}
