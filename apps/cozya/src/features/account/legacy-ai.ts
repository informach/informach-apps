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
    // Spans may refer to a thread or to a run in our app-scoped billing ledger.
    await store.db.none(
      `DELETE FROM ai_mastra.mastra_ai_spans WHERE
        ("serviceName" = 'cozya' AND ("userId" = $1 OR "resourceId" = $1))
        OR "threadId" IN (SELECT id FROM ai_mastra.mastra_threads WHERE "resourceId" = $1 AND id LIKE 'cozya:%')
        OR "runId" IN (SELECT id::text FROM billing.credit_reservations WHERE
          (app = 'cozya' AND owner_type = 'user' AND owner_id = $1)
          OR (app = 'compasso' AND consumer_app = 'cozya' AND actor_user_id = $1))`,
      [userId],
    );
    let removed = 0;
    const deadline = performance.now() + 45_000;
    while (true) {
      // Never load titles or an unbounded memory history just to erase owned threads.
      const owned = await store.db.any<{ id: string }>(
        `SELECT id FROM ai_mastra.mastra_threads WHERE "resourceId" = $1 AND id LIKE 'cozya:%' ORDER BY id LIMIT 100`,
        [userId],
      );
      if (!owned.length) break;
      for (const thread of owned) {
        if (performance.now() >= deadline) throw new Error("Legacy Cozya cleanup remains pending");
        await memory.clearObservationalMemory(thread.id, userId);
        await memory.deleteThread({ threadId: thread.id });
        removed++;
      }
    }
    // A bare-user resource can contain another app's metadata or memory even
    // when all current threads belong to Cozya. Thread ownership cannot erase it.
    await store.db.none(
      `UPDATE ai_mastra.mastra_resources SET "workingMemory" = NULL WHERE id = $1 AND "workingMemory" LIKE '# Perfil culinário do usuário%'`,
      [userId],
    );
    return removed;
  } finally {
    await store.close();
  }
}
