import "server-only";

import { getKitchenAccess } from "@/features/kitchen/access";
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
 *   4. Verified email and active Pro or explicitly activated trial entitlement.
 *      Billing still requires an available credit; an exhausted trial is not unlimited AI.
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
  if (!session.user.emailVerified)
    return {
      ok: false,
      response: Response.json({ code: "EMAIL_VERIFICATION_REQUIRED" }, { status: 403 }),
    };
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

  const access = await getKitchenAccess(userId);
  if (!access.canUseAi) {
    return {
      ok: false,
      response: Response.json({ code: "SUBSCRIPTION_REQUIRED" }, { status: 403 }),
    };
  }

  return { ok: true, userId, subject };
}

// Re-export do helper compartilhado em `@informach/ai-core` para que os
// services do cozya possam continuar importando de `./_shared` sem mudança
// (e para que `agenda-da-turma` reuse o mesmo normalizador quando ganhar IA).
export { normalizeUsage } from "@informach/ai-core";
