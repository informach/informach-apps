import "server-only";
import type { WebClosureExecution } from "@informach/account/closure";
import { collectCozyaClosureSteps } from "@/lib/account";
import {
  assertCozyaClosurePlan,
  executeCozyaClosure,
  prepareCozyaClosure,
} from "./closure-repository";
import { purgeLegacyCozyaAi } from "./legacy-ai";
import { recoverCozyaCleanupOperations } from "./repository";

/** A late resume never performs a broad external erasure. Legacy memory belongs
 * only to confirmed erasure; the coordinator cannot reopen after that consent. */
async function reconcileCozyaClosure(context: WebClosureExecution) {
  await recoverCozyaCleanupOperations(context.actorId);
  if (context.phase !== "erase") return;
  await assertCozyaClosurePlan(context);
  await purgeLegacyCozyaAi(context.actorId);
}

/** Internal until the complete seven-domain lifecycle is wired and verified. */
export function processCozyaClosures() {
  return collectCozyaClosureSteps({
    prepare: prepareCozyaClosure,
    beforeCommit: reconcileCozyaClosure,
    execute: executeCozyaClosure,
  });
}
