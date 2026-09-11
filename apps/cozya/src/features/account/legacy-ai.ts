import "server-only";
import { createPostgresStore } from "@informach/ai-core/mastra";
import { env } from "@/lib/env";

/** Data cleanup through the installed Mastra store. No DDL; ai_mastra remains framework-owned. */
export async function purgeLegacyCozyaAi(userId: string) {
  const store = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
    max: 1,
  });
  try {
    const memory = await store.getStore("memory");
    if (!memory) throw new Error("Mastra memory storage unavailable for cleanup");
    const threads = await memory.listThreads({ filter: { resourceId: userId }, perPage: false });
    const owned = threads.threads.filter((thread) => thread.id.startsWith("cozya:"));
    const threadIds = owned.map((thread) => thread.id);
    // Spans may refer to a thread or to a run in our app-scoped billing ledger.
    await store.db.none(
      `DELETE FROM ai_mastra.mastra_ai_spans WHERE "traceId" IN (
      SELECT "traceId" FROM ai_mastra.mastra_ai_spans WHERE
        ("serviceName" = 'cozya' AND ("userId" = $1 OR "resourceId" = $1))
        OR "threadId" = ANY($2::text[])
        OR "runId" IN (SELECT id::text FROM billing.credit_reservations WHERE app = 'cozya' AND owner_type = 'user' AND owner_id = $1)
    )`,
      [userId, threadIds],
    );
    for (const thread of owned) await memory.deleteThread({ threadId: thread.id });
    if (owned.length > 0 && owned.length === threads.threads.length) {
      await memory.clearObservationalMemory(null, userId);
      await store.db.none("DELETE FROM ai_mastra.mastra_resources WHERE id = $1", [userId]);
    } else {
      // Older Cozya used the bare user id for a shared resource. Remove its culinary profile
      // only when the stored template identifies it, preserving unrelated app resources.
      await store.db.none(
        `UPDATE ai_mastra.mastra_resources SET "workingMemory" = NULL WHERE id = $1 AND "workingMemory" LIKE '# Perfil culinário do usuário%'`,
        [userId],
      );
    }
    return owned.length;
  } finally {
    await store.close();
  }
}
