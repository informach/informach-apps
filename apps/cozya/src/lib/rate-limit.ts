import { logger } from "./logger";
import { redis } from "./redis";

/**
 * Thrown when a caller exceeds a rate limit window. Catch in actions to
 * convert into a user-facing message ("Aguarde alguns minutos antes de usar
 * a IA novamente") with the retry hint from `retryAfterSeconds`.
 */
export class RateLimitedError extends Error {
  constructor(
    public readonly key: string,
    public readonly limit: number,
    public readonly windowSeconds: number,
    public readonly retryAfterSeconds: number,
  ) {
    super(`Rate limit exceeded for ${key}: ${limit}/${windowSeconds}s`);
    this.name = "RateLimitedError";
  }
}

export type RateLimitInput = {
  /** Stable per-actor key (e.g. `cozya.ai.invoke:user:<id>`). */
  key: string;
  /** Max events allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  /** Current count in the active window. */
  count: number;
  /** How many more events are allowed before the window resets. */
  remaining: number;
  /**
   * Seconds the caller should wait before retrying when not allowed.
   * Always 0 when `allowed: true`.
   */
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiter backed by Redis (single INCR + EXPIRE).
 *
 * Buckets time into windows of `windowSeconds` (e.g. one bucket per hour
 * when `windowSeconds=3600`). The first event in a bucket sets the TTL,
 * subsequent events INCR until the bucket expires. O(1) per call.
 *
 * Why fixed-window over sliding: anti-script defense doesn't need
 * sub-window accuracy and a sliding implementation either holds a list
 * (memory) or runs two INCRs (latency). Fixed-window is enough.
 *
 * Behavior when REDIS_URL is unset (dev without Redis): logs a warn and
 * returns allow-all. Production must always have Redis configured.
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = input;
  if (!redis) {
    logger.warn({ key }, "rate_limit.no_redis_passthrough");
    return { allowed: true, count: 0, remaining: limit, retryAfterSeconds: 0 };
  }
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `cozya:rl:${key}:${bucket}`;
  const count = await redis.incr(redisKey);
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds);
  }
  const allowed = count <= limit;
  const ttl = allowed ? 0 : Math.max(1, await redis.ttl(redisKey));
  return {
    allowed,
    count,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : ttl,
  };
}

/**
 * Enforces the rate limit by throwing `RateLimitedError` when exceeded.
 * Use this inside server actions before invoking the AI / billing pipeline.
 */
export async function enforceRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const result = await checkRateLimit(input);
  if (!result.allowed) {
    throw new RateLimitedError(
      input.key,
      input.limit,
      input.windowSeconds,
      result.retryAfterSeconds,
    );
  }
  return result;
}

/**
 * Catalog of named limits for the Cozya app. Centralized so adjustments
 * happen in one place and tests can assert against the same constants.
 *
 * Modelo econômico (ver `packages/billing/CLAUDE.md` §5.5): cap mensal
 * vem dos créditos da subscription Pro (30/mês). Este limite temporal
 * é defesa anti-script independente — protege contra um power user que
 * tente queimar 30 créditos em segundos via script automatizado.
 */
export const COZYA_RATE_LIMITS = {
  /** AI invocations: 10 calls per hour per user. */
  AI_INVOKE_PER_HOUR: { limit: 10, windowSeconds: 3600 },
} as const;

/** Stable key generator for the AI invocation limit. */
export function aiInvokeKey(userId: string): string {
  return `cozya.ai.invoke:user:${userId}`;
}
