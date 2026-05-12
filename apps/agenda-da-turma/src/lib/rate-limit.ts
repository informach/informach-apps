import { env } from "./env";
import { logger } from "./logger";
import { redis } from "./redis";

/**
 * Thrown when a caller exceeds a rate limit window. Catch in actions/routes
 * to convert into a user-facing message + retry hint.
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
  /** Stable per-actor key (e.g. `agenda-da-turma.ai.invoke:user:<id>`). */
  key: string;
  /** Max events allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Fixed-window rate limiter backed by Redis (single INCR + EXPIRE). O(1) per
 * call. Buckets time into windows of `windowSeconds`.
 *
 * Behavior when REDIS_URL is unset (dev without Redis): logs a warn and
 * returns allow-all. Production must always have Redis configured (env.ts
 * guard).
 */
export async function checkRateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { key, limit, windowSeconds } = input;
  if (!redis) {
    logger.warn({ key, environment: env.NODE_ENV }, "rate_limit.no_redis_passthrough");
    return { allowed: true, count: 0, remaining: limit, retryAfterSeconds: 0 };
  }
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `agenda-da-turma:rl:${key}:${bucket}`;
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
 * Use inside route handlers / server actions before invoking AI/billing.
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
 * Catalog of named limits for the Agenda da Turma app. Centralized so
 * adjustments happen in one place and tests can assert against the same
 * constants.
 *
 * Modelo econômico: cap mensal vem dos créditos da subscription Pro
 * (70/mês). Este limite temporal é defesa anti-script independente —
 * protege contra power user que tente queimar créditos em segundos via
 * script automatizado.
 */
export const AGENDA_RATE_LIMITS = {
  /** AI invocations: 60 calls per hour per user. */
  AI_INVOKE_PER_HOUR: { limit: 60, windowSeconds: 3600 },
} as const;

/** Stable key generator for the AI invocation limit. */
export function aiInvokeKey(userId: string): string {
  return `agenda-da-turma.ai.invoke:user:${userId}`;
}
