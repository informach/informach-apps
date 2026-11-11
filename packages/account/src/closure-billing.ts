import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import {
  type BillingClosureDeps,
  BillingClosureError,
  commitBillingClosure,
  lockBillingClosureScope,
  reconcileBillingClosure,
} from "@informach/billing/closure";
import { type WebClosureAuthority, WebClosureError } from "./closure-contract";
import { processWebClosureSteps, type WebClosureAdapter } from "./closure-steps";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});
async function classify<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof BillingClosureError && error.code === "scope_changed")
      throw new WebClosureError("stale-plan");
    throw error;
  }
}

export function createBillingWebClosureAdapter(deps: BillingClosureDeps): WebClosureAdapter {
  return {
    async prepare(tx, authority) {
      const scope = await lockBillingClosureScope(tx, frozenActor(authority));
      return {
        version: 1,
        fingerprint: scope.fingerprint,
        personalRecords: 0,
        sharedRecords: scope.retainedRecords,
        credentials: scope.futureIntents.filter((intent) =>
          ["setup_pending", "setup_ready", "scheduling", "scheduled", "review"].includes(
            intent.state,
          ),
        ).length,
        blockers: [
          ...(scope.pendingOperations ? ["pending_operations" as const] : []),
          ...(scope.financialReview ? ["financial_review" as const] : []),
        ],
      };
    },
    async beforeCommit(context) {
      // Desisting before consent must never cancel a subscription or a purchase.
      if (context.phase === "resume") return;
      if (!context.plan || context.plan.blockers.length) throw new WebClosureError("not-ready");
      const fingerprint = context.plan.fingerprint;
      await classify(() => reconcileBillingClosure(deps, frozenActor(context), fingerprint));
    },
    async execute(tx, context) {
      if (context.phase === "resume") {
        await lockFrozenWebParticipation(tx, frozenActor(context));
        return;
      }
      if (!context.plan || context.plan.blockers.length) throw new WebClosureError("not-ready");
      const fingerprint = context.plan.fingerprint;
      await classify(() => commitBillingClosure(tx, frozenActor(context), fingerprint));
    },
  };
}

export function processBillingWebClosures(deps: BillingClosureDeps) {
  return processWebClosureSteps({
    db: deps.db,
    domain: "billing",
    adapter: createBillingWebClosureAdapter(deps),
  });
}
