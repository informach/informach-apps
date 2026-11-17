import "server-only";
import { createHash } from "node:crypto";
import {
  type WebClosureAuthority,
  WebClosureError,
  type WebClosureExecution,
  type WebClosurePlan,
} from "@informach/account/closure";
import { lockFrozenWebParticipation } from "@informach/auth/web-participation";
import { db, eq, sql } from "@informach/db";
import { cozyaProfiles } from "@informach/db/schema";
import {
  type CozyaCleanupTransaction,
  clearCozyaAiCaches,
  clearCozyaPrivateContent,
  lockSettledCozyaCleanup,
  PendingAiCleanupError,
} from "./cleanup-repository";

async function authorize(tx: CozyaCleanupTransaction, authority: WebClosureAuthority) {
  await lockFrozenWebParticipation(tx, {
    userId: authority.actorId,
    operationId: authority.operationId,
    expectedRevision: authority.frozenRevision,
  });
}

export async function assertCozyaClosurePlan(context: WebClosureExecution) {
  const current = await db.transaction((tx) => prepareCozyaClosure(tx, context));
  if (!context.plan || current.blockers.length || current.fingerprint !== context.plan.fingerprint)
    throw new WebClosureError("stale-plan");
}

/** Hash only stable IDs/versions, in bounded pages. Culinary content never leaves
 * this domain or enters the coordinator. Expiring technical caches are not part
 * of the persistent-content selection; they are cleaned under the same freeze. */
export async function prepareCozyaClosure(
  tx: CozyaCleanupTransaction,
  authority: WebClosureAuthority,
): Promise<WebClosurePlan> {
  await tx.execute(sql`set local statement_timeout = '10s'`);
  await authorize(tx, authority);
  const hash = createHash("sha256").update(
    JSON.stringify([
      "cozya-closure-v1",
      authority.actorId,
      authority.operationId,
      authority.frozenRevision,
    ]),
  );
  let cursor = "",
    personalRecords = 0;
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Cozya closure selection deadline");
    const rows = await tx.execute<{ key: string; version: string }>(sql`with owned as (
      select 'profile:' || user_id as key, extract(epoch from updated_at)::text as version from cozya.profiles where user_id = ${authority.actorId}
      union all select 'recipe:' || id::text, extract(epoch from updated_at)::text from cozya.recipes where user_id = ${authority.actorId}
      union all select 'meal:' || id::text, extract(epoch from updated_at)::text from cozya.meals where user_id = ${authority.actorId}
      union all select 'list:' || id::text, extract(epoch from generated_at)::text from cozya.shopping_lists where user_id = ${authority.actorId}
      union all select 'item:' || i.id::text, extract(epoch from l.generated_at)::text from cozya.shopping_items i join cozya.shopping_lists l on l.id = i.list_id where l.user_id = ${authority.actorId}
      union all select 'cooking:' || id::text, extract(epoch from updated_at)::text from cozya.cooking_sessions where user_id = ${authority.actorId}
    ) select key, version from owned where key > ${cursor} order by key limit 250`);
    for (const row of rows) hash.update(JSON.stringify([row.key, row.version]));
    personalRecords += rows.length;
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1]?.key ?? cursor;
  }
  const blockers: WebClosurePlan["blockers"] = [];
  try {
    await lockSettledCozyaCleanup(tx, authority.actorId);
  } catch (error) {
    if (error instanceof PendingAiCleanupError) blockers.push("pending_operations");
    else throw error;
  }
  return {
    version: 1,
    fingerprint: hash.digest("hex"),
    personalRecords,
    sharedRecords: 0,
    credentials: 0,
    blockers,
  };
}

/** Provider-owned memory must be removed through Mastra before the DB receipt.
 * A missing storage table is a failure, never an empty cleanup confirmation. */
async function requireLegacyCozyaCleanup(tx: CozyaCleanupTransaction, userId: string) {
  const [result] = await tx.execute<{ pending: boolean }>(sql`select (
    exists (select 1 from ai_mastra.mastra_threads where "resourceId" = ${userId} and id like 'cozya:%')
    or exists (select 1 from ai_mastra.mastra_resources where id = ${userId} and "workingMemory" like '# Perfil culinário do usuário%')
    or exists (select 1 from ai_mastra.mastra_ai_spans where ("serviceName" = 'cozya' and ("userId" = ${userId} or "resourceId" = ${userId}))
      or "runId" in (select id::text from billing.credit_reservations where (app = 'cozya' and owner_type = 'user' and owner_id = ${userId}) or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${userId})))
  ) as pending`);
  if (!result || result.pending) throw new PendingAiCleanupError();
}

/** Invoked inside commitWebClosureStep, so effects and receipt commit together. */
export async function executeCozyaClosure(
  tx: CozyaCleanupTransaction,
  context: WebClosureExecution,
) {
  await authorize(tx, context);
  await lockSettledCozyaCleanup(tx, context.actorId);
  if (context.phase === "resume") {
    await clearCozyaAiCaches(tx, context.actorId);
    return;
  }
  const current = await prepareCozyaClosure(tx, context);
  if (!context.plan || current.blockers.length || current.fingerprint !== context.plan.fingerprint)
    throw new WebClosureError("stale-plan");
  await requireLegacyCozyaCleanup(tx, context.actorId);
  await clearCozyaPrivateContent(tx, context.actorId);
  await tx.delete(cozyaProfiles).where(eq(cozyaProfiles.userId, context.actorId));
}
