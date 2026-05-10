import "server-only";

import type { RateLimitStorage } from "./server-actions";

/**
 * Minimal Redis client surface required by the storage. Compatible with
 * `ioredis` (Redis 7+) without making `ioredis` a dependency of this package.
 */
type RedisMulti = {
  incr(key: string): RedisMulti;
  expire(key: string, seconds: number, mode: "NX"): RedisMulti;
  ttl(key: string): RedisMulti;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
};

export type RedisRateLimitClient = {
  multi(): RedisMulti;
};

export type RedisRateLimitStorageOptions = {
  client: RedisRateLimitClient;
  /**
   * Prefix prepended to every key. Recommended: `"<app-slug>:rl:"` (with
   * trailing colon) for app isolation when sharing a single Redis instance.
   */
  keyPrefix?: string;
};

/**
 * Fixed-window rate limiter using a Redis MULTI pipeline with `EXPIRE … NX`.
 *
 * Single round-trip; `EXPIRE NX` (Redis 7+) only sets the TTL when none is
 * currently set, so subsequent hits within the same window do not extend the
 * bucket — guarantees correct fixed-window semantics.
 *
 * Compatible with `ioredis` 5.x clients (the `multi/incr/expire/ttl/exec`
 * shape matches without further configuration).
 */
export function redisRateLimitStorage({
  client,
  keyPrefix = "",
}: RedisRateLimitStorageOptions): RateLimitStorage {
  return {
    async hit(key, windowSeconds) {
      const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
      const redisKey = `${keyPrefix}${key}:${bucket}`;
      const result = await client
        .multi()
        .incr(redisKey)
        .expire(redisKey, windowSeconds, "NX")
        .ttl(redisKey)
        .exec();
      // Each tuple is [err, value]; exec() returns null only on WATCH abort.
      const count = (result?.[0]?.[1] as number | undefined) ?? 0;
      const ttlRaw = (result?.[2]?.[1] as number | undefined) ?? windowSeconds;
      return { count, ttlSeconds: Math.max(0, ttlRaw) };
    },
  };
}
