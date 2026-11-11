import type { Database } from "@informach/db";
import { FamilyClosureScopeError } from "@informach/family/closure";
import {
  detachClosedFamilyActor,
  lockFamilyDetachmentScope,
  prepareFamilyResumption,
} from "@informach/family/closure-detachment";
import { type WebClosureAuthority, WebClosureError } from "./closure-contract";
import { processWebClosureSteps, type WebClosureAdapter } from "./closure-steps";

const frozenActor = (authority: WebClosureAuthority) => ({
  userId: authority.actorId,
  operationId: authority.operationId,
  expectedRevision: authority.frozenRevision,
});

export const familyWebClosureAdapter: WebClosureAdapter = {
  async prepare(tx, authority) {
    const scope = await lockFamilyDetachmentScope(tx, frozenActor(authority));
    return {
      version: 1,
      fingerprint: scope.fingerprint,
      personalRecords:
        scope.removePeople.length + scope.memberships.filter((m) => !m.revoked).length,
      sharedRecords: scope.preservePeople.length + scope.retainedProfiles.length,
      credentials: 0,
      blockers: scope.blocked ? ["responsibilities"] : [],
    };
  },
  async execute(tx, context) {
    try {
      if (context.phase === "resume")
        return await prepareFamilyResumption(tx, frozenActor(context));
      if (!context.plan || context.plan.blockers.length) throw new WebClosureError("not-ready");
      await detachClosedFamilyActor(tx, frozenActor(context), context.plan.fingerprint);
    } catch (error) {
      if (error instanceof FamilyClosureScopeError) throw new WebClosureError("stale-plan");
      throw error;
    }
  },
};

/** The coordinator admits this domain only after billing and all app receipts. */
export function processFamilyWebClosures(db: Database) {
  return processWebClosureSteps({ db, domain: "family", adapter: familyWebClosureAdapter });
}
