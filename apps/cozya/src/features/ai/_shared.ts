import "server-only";

import { billing } from "@/features/billing/service";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  aiInvokeKey,
  COZYA_RATE_LIMITS,
  enforceRateLimit,
  RateLimitedError,
} from "@/lib/rate-limit";

export type AiSubject = { readonly type: "user"; readonly id: string };

export type AiRouteGuardResult =
  | { ok: true; userId: string; subject: AiSubject }
  | { ok: false; response: Response };

/**
 * Shared pre-conditions for every Cozya AI route handler:
 *
 *   1. `OPENROUTER_API_KEY` is configured (else 503 `AI_DISABLED`).
 *   2. The request has a valid user session (else 401 `UNAUTHORIZED`).
 *   3. The user is under the per-hour anti-script invocation limit
 *      (else 429 `RATE_LIMITED` with `Retry-After`).
 *   4. The user has Pro entitlement (else 403 `SUBSCRIPTION_REQUIRED`).
 *
 * `errorScope` is used for the structured log key emitted when the OpenRouter
 * key is missing (e.g. `"cozya.parse_text"` → `"cozya.parse_text.openrouter_key_missing"`).
 */
export async function withAiRouteGuards(opts: { errorScope: string }): Promise<AiRouteGuardResult> {
  if (!env.OPENROUTER_API_KEY) {
    logger.error({}, `${opts.errorScope}.openrouter_key_missing`);
    return {
      ok: false,
      response: Response.json({ code: "AI_DISABLED" }, { status: 503 }),
    };
  }

  const session = await getServerSession();
  if (!session?.user) {
    return {
      ok: false,
      response: Response.json({ code: "UNAUTHORIZED" }, { status: 401 }),
    };
  }
  const userId = session.user.id;
  const subject: AiSubject = { type: "user", id: userId };

  try {
    await enforceRateLimit({
      key: aiInvokeKey(userId),
      ...COZYA_RATE_LIMITS.AI_INVOKE_PER_HOUR,
    });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        ok: false,
        response: Response.json(
          { code: "RATE_LIMITED", retryAfter: err.retryAfterSeconds },
          {
            status: 429,
            headers: { "Retry-After": String(err.retryAfterSeconds) },
          },
        ),
      };
    }
    throw err;
  }

  const isPro = await billing.hasProSubscription(subject);
  if (!isPro) {
    return {
      ok: false,
      response: Response.json({ code: "SUBSCRIPTION_REQUIRED" }, { status: 403 }),
    };
  }

  return { ok: true, userId, subject };
}

/**
 * Normalizes AI SDK v5 usage shapes (`inputTokens`/`outputTokens`) and legacy
 * shapes (`promptTokens`/`completionTokens`) into a single struct accepted by
 * `agentRunRecorder.finish`. Treats missing or negative values as 0.
 */
export function normalizeUsage(raw: unknown): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  const u = (raw ?? {}) as Record<string, unknown>;
  const promptTokens = numberOr(u.inputTokens ?? u.promptTokens, 0);
  const completionTokens = numberOr(u.outputTokens ?? u.completionTokens, 0);
  const totalTokens = numberOr(u.totalTokens, promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}
