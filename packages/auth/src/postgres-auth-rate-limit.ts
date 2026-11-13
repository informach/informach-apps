import { randomUUID } from "node:crypto";
import { type Database, eq, sql } from "@informach/db";
import { rateLimit } from "@informach/db/schema";
import type { BetterAuthOptions } from "better-auth";

type Storage = NonNullable<NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]>;

/** App-scoped, atomic fixed-window limiter. Accounts do not share another app's counter. */
export function postgresAuthRateLimit(db: Database, app: string): Storage {
  const scoped = (key: string) => `web-auth:${app}:${key}`;
  return {
    async consume(key, rule) {
      return db.transaction(async (tx) => {
        const bucket = scoped(key);
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${bucket}, 0))`);
        const [row] = await tx.select().from(rateLimit).where(eq(rateLimit.key, bucket));
        const now = Date.now();
        const expired = !row?.lastRequest || now - row.lastRequest >= rule.window * 1000;
        if (row && !expired && row.count >= rule.max)
          return {
            allowed: false,
            retryAfter: Math.max(
              1,
              Math.ceil(((row.lastRequest ?? now) + rule.window * 1000 - now) / 1000),
            ),
          };
        const count = expired ? 1 : (row?.count ?? 0) + 1;
        // This namespaced store uses lastRequest as the beginning of the window.
        // Advancing it on each attempt would accumulate steady traffic indefinitely.
        const windowStart = expired ? now : (row?.lastRequest ?? now);
        await tx
          .insert(rateLimit)
          .values({ id: randomUUID(), key: bucket, count, lastRequest: windowStart })
          .onConflictDoUpdate({ target: rateLimit.key, set: { count, lastRequest: windowStart } });
        return { allowed: true, retryAfter: null };
      });
    },
  };
}
