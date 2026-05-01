import "server-only";
import { db } from "@informach/db";
import { invitations, rateLimit, verifications } from "@informach/db/schema";
import { and, eq, lt } from "drizzle-orm";

/**
 * Idempotent cleanup helpers for cron jobs (e.g. Railway Scheduler). Each
 * function returns the number of rows it touched so the caller can log/alert.
 *
 * They use the same `@informach/db` instance the auth package writes to —
 * apps just need to expose them via a route handler protected by a shared
 * secret. See `PRODUCTION.md` for an example.
 */

export async function cleanupExpiredVerifications(now: Date = new Date()): Promise<number> {
  const result = await db
    .delete(verifications)
    .where(lt(verifications.expiresAt, now))
    .returning({ id: verifications.id });
  return result.length;
}

export async function cleanupExpiredInvitations(now: Date = new Date()): Promise<number> {
  const result = await db
    .update(invitations)
    .set({ status: "expired" })
    .where(and(eq(invitations.status, "pending"), lt(invitations.expiresAt, now)))
    .returning({ id: invitations.id });
  return result.length;
}

export async function cleanupStaleRateLimit(maxAgeSeconds = 3600): Promise<number> {
  const threshold = Date.now() - maxAgeSeconds * 1000;
  const result = await db
    .delete(rateLimit)
    .where(lt(rateLimit.lastRequest, threshold))
    .returning({ id: rateLimit.id });
  return result.length;
}
