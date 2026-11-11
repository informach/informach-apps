import type { Database } from "@informach/db";
import {
  ediDevices,
  ediEntitlements,
  ediOutbox,
  ediRequestNonces,
  users,
} from "@informach/db/schema";
import { and, eq, or, sql } from "drizzle-orm";

/** Presence only, for the authenticated person's shared-account review. Edi
 * remains independent: no keys, license payloads, devices or jobs are altered. */
export async function inspectEdiIdentityDependencies(db: Database, actorId: string) {
  const [presence] = await db
    .select({
      devicesPresent:
        sql<boolean>`exists (select 1 from ${ediDevices} d where d.user_id = ${actorId})`.mapWith(
          Boolean,
        ),
      licenseRecordPresent:
        sql<boolean>`exists (select 1 from ${ediEntitlements} e where e.user_id = ${actorId})`.mapWith(
          Boolean,
        ),
      pendingOperationPresent:
        sql<boolean>`exists (select 1 from ${ediOutbox} o where o.processed_at is null and ((o.kind = 'reconcile_entitlement' and o.subject_id = ${actorId}) or (o.kind = 'revoke_device' and exists (select 1 from ${ediDevices} d where d.user_id = ${actorId} and d.id::text = o.subject_id))))`.mapWith(
          Boolean,
        ),
      replayProofsPresent:
        sql<boolean>`exists (select 1 from ${ediRequestNonces} n where n.user_id = ${actorId})`.mapWith(
          Boolean,
        ),
    })
    .from(users)
    .where(
      and(
        eq(users.id, actorId),
        eq(users.emailVerified, true),
        or(eq(users.banned, false), sql`${users.banExpiresAt} <= statement_timestamp()`),
      ),
    );
  if (!presence) throw new Error("Shared identity is unavailable");
  return presence;
}
