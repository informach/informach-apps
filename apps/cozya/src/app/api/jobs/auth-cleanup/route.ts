import {
  cleanupExpiredInvitations,
  cleanupExpiredVerifications,
  cleanupStaleRateLimit,
} from "@informach/auth/maintenance";
import { rejectUnauthorizedCron } from "@/lib/cron";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

/**
 * Cron sweeper for auth maintenance — recommended cadence: ~daily.
 *
 * Idempotent helpers from `@informach/auth/maintenance`:
 *   - `cleanupExpiredVerifications` — deletes `core.verifications` rows past `expiresAt`.
 *   - `cleanupExpiredInvitations`   — flips pending `core.invitations` to `expired`
 *                                     (no-op in cozya since organizations are off, but cheap).
 *   - `cleanupStaleRateLimit`       — deletes `core.rate_limit` older than 1h
 *                                     (no-op when `secondaryStorage` Redis is active,
 *                                     which cozya currently has wired in `lib/auth.ts`).
 */
export async function POST(request: Request): Promise<Response> {
  const unauthorized = rejectUnauthorizedCron(request);
  if (unauthorized) {
    return unauthorized;
  }

  const [verifications, invitations, rateLimit] = await Promise.all([
    cleanupExpiredVerifications(),
    cleanupExpiredInvitations(),
    cleanupStaleRateLimit(),
  ]);

  const result = { verifications, invitations, rateLimit };
  if (verifications + invitations + rateLimit > 0) {
    logger.info(result, "auth.cron.cleanup");
  }

  return Response.json(result);
}
