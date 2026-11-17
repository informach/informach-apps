import "server-only";
import type { DepartureAssessment } from "@informach/account/departure-reviews";
import { db, sql } from "@informach/db";

/** Aggregate presence only. A culinary profile belongs to this adult, even when
 * the wallet is shared. Provider-owned storage is read, never migrated here.
 * Missing Mastra tables are an assessment failure, never an empty account. */
export function assessCozyaDeparture(actorId: string): Promise<DepartureAssessment> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '10000ms'`);
    const [presence] = await tx.execute<{
      hasPersonalData: boolean;
      pendingOperations: number;
    }>(sql`select (
      exists (select 1 from cozya.profiles where user_id = ${actorId})
      or exists (select 1 from cozya.recipes where user_id = ${actorId})
      or exists (select 1 from cozya.meals where user_id = ${actorId})
      or exists (select 1 from cozya.shopping_lists where user_id = ${actorId})
      or exists (select 1 from cozya.cooking_sessions where user_id = ${actorId})
      or exists (select 1 from cozya.product_events where user_id = ${actorId})
      or exists (select 1 from cozya.ai_operations where user_id = ${actorId} and response is not null)
      or exists (select 1 from ai.operation_receipts where app = 'cozya' and actor_user_id = ${actorId})
      or exists (select 1 from ai.agent_runs where app = 'cozya' and (
        metadata->>'userId' = ${actorId}
        or id in (select id from billing.credit_reservations where
          (app = 'cozya' and owner_type = 'user' and owner_id = ${actorId})
          or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${actorId}))
        or metadata->>'reservationId' in (select id::text from billing.credit_reservations where
          (app = 'cozya' and owner_type = 'user' and owner_id = ${actorId})
          or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${actorId}))
      ))
      or exists (select 1 from ai_mastra.mastra_threads where "resourceId" = ${actorId} and id like 'cozya:%')
      or exists (select 1 from ai_mastra.mastra_resources where id = ${actorId} and "workingMemory" like '# Perfil culinário do usuário%')
      or exists (select 1 from ai_mastra.mastra_ai_spans where
        ("serviceName" = 'cozya' and ("userId" = ${actorId} or "resourceId" = ${actorId}))
        or "threadId" in (select id from ai_mastra.mastra_threads where "resourceId" = ${actorId} and id like 'cozya:%')
        or "runId" in (select id::text from billing.credit_reservations where
          (app = 'cozya' and owner_type = 'user' and owner_id = ${actorId})
          or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${actorId}))
      )
    ) as "hasPersonalData", (
      select count(*)::integer from (
        select id from cozya.ai_operations where user_id = ${actorId}
          and (status_code is null or (status_code >= 500 and coalesce(response->>'code', '') <> 'OPERATION_INTERRUPTED'))
        union select run_id from ai.operation_receipts where app = 'cozya' and actor_user_id = ${actorId}
          and phase = 'processing'
        union select id from billing.credit_reservations where status = 'active' and (
          (app = 'cozya' and owner_type = 'user' and owner_id = ${actorId})
          or (app = 'compasso' and consumer_app = 'cozya' and actor_user_id = ${actorId}))
      ) pending
    ) as "pendingOperations"`);
    if (!presence) throw new Error("Cozya departure assessment unavailable");
    return {
      version: 1,
      ...presence,
      managedProfiles: 0,
      sharedProfiles: 0,
      hasSharedData: false,
      activeCredentials: 0,
    };
  });
}
