import "server-only";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { and, asc, db, eq, lt, sql } from "@informach/db";
import {
  agentRuns,
  cozyaAiOperations,
  cozyaProductEvents,
  cozyaTrialClaims,
} from "@informach/db/schema";
import { recoverInterruptedAiOperation } from "@/features/ai/recovery";
import { env } from "@/lib/env";
import { purgeLegacyCozyaAi } from "./legacy-ai";

/** Run hourly. Bounded batches allow catch-up without loading recipe contents. */
export async function maintainCozyaData(now = new Date()) {
  // Keep unresolved billing work eligible for the next batch, even past content retention.
  const resolved = sql`${cozyaAiOperations.statusCode} IS NOT NULL AND (${cozyaAiOperations.statusCode} < 500 OR ${cozyaAiOperations.response}->>'code' = 'OPERATION_INTERRUPTED')`;
  const stalled = await db
    .select({
      id: cozyaAiOperations.id,
      userId: cozyaAiOperations.userId,
    })
    .from(cozyaAiOperations)
    .where(
      and(
        sql`(${cozyaAiOperations.statusCode} IS NULL OR (${cozyaAiOperations.statusCode} >= 500 AND coalesce(${cozyaAiOperations.response}->>'code', '') <> 'OPERATION_INTERRUPTED'))`,
        lt(cozyaAiOperations.createdAt, new Date(now.getTime() - 3600000)),
      ),
    )
    .orderBy(asc(cozyaAiOperations.createdAt), asc(cozyaAiOperations.id))
    .limit(100);
  let compensated = 0;
  for (const operation of stalled) {
    if ((await recoverInterruptedAiOperation(operation.id, operation.userId, now)).compensated)
      compensated++;
  }
  const expired = await db
    .update(cozyaAiOperations)
    .set({ response: null, statusCode: 410 })
    .where(
      and(
        lt(cozyaAiOperations.expiresAt, now),
        sql`${cozyaAiOperations.response} IS NOT NULL`,
        resolved,
      ),
    )
    .returning({ id: cozyaAiOperations.id });
  const cutoff = new Date(now.getTime() - 90 * 86400000);
  await db.delete(cozyaAiOperations).where(and(lt(cozyaAiOperations.createdAt, cutoff), resolved));
  const events = await db
    .delete(cozyaProductEvents)
    .where(lt(cozyaProductEvents.occurredAt, cutoff))
    .returning({ id: cozyaProductEvents.id });
  const runs = await db
    .delete(agentRuns)
    .where(and(eq(agentRuns.app, "cozya"), lt(agentRuns.startedAt, cutoff)))
    .returning({ id: agentRuns.id });
  // Older releases logged transcript excerpts and provider exception strings.
  await db
    .update(agentRuns)
    .set({ metadata: sql`${agentRuns.metadata} - 'textPreview' - 'error'` })
    .where(
      and(
        eq(agentRuns.app, "cozya"),
        sql`(${agentRuns.metadata} ? 'textPreview' OR ${agentRuns.metadata} ? 'error')`,
      ),
    );
  await db
    .delete(cozyaTrialClaims)
    .where(
      and(
        sql`${cozyaTrialClaims.userId} IS NULL`,
        lt(cozyaTrialClaims.startedAt, new Date(now.getTime() - 365 * 86400000)),
      ),
    );

  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  let legacyUsers: { id: string }[];
  try {
    legacyUsers = await store.db.any<{ id: string }>(
      `SELECT DISTINCT "resourceId" AS id FROM ai_mastra.mastra_threads WHERE id LIKE 'cozya:%' UNION SELECT id FROM ai_mastra.mastra_resources WHERE "workingMemory" LIKE '# Perfil culinário do usuário%' LIMIT 100`,
    );
    await store.db.none(
      `DELETE FROM ai_mastra.mastra_ai_spans WHERE "traceId" IN (SELECT "traceId" FROM ai_mastra.mastra_ai_spans WHERE "serviceName" = 'cozya' OR "threadId" LIKE 'cozya:%' OR "runId" IN (SELECT id::text FROM billing.credit_reservations WHERE app = 'cozya'))`,
    );
  } finally {
    await store.close();
  }
  for (const user of legacyUsers) await purgeLegacyCozyaAi(user.id);
  return {
    recoveredOperations: stalled.length,
    compensated,
    expiredPreviews: expired.length,
    deletedEvents: events.length,
    deletedRuns: runs.length,
    legacyUsers: legacyUsers.length,
  };
}
