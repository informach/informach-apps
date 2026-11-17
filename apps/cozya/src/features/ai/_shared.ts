import "server-only";
import { FamilyError } from "@informach/family";

import { cozyaAuthority } from "@/features/family/context";
import { validateFamilyChoice } from "@/features/family/context-repository";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  aiInvokeKey,
  COZYA_RATE_LIMITS,
  enforceRateLimit,
  RateLimitedError,
} from "@/lib/rate-limit";
import { aiErrorResponse } from "./errors";
import type { CozyaAiActor } from "./wallet-repository";

export type AiRouteGuardResult =
  | { ok: true; userId: string; actor: CozyaAiActor }
  | { ok: false; response: Response };

/**
 * Shared pre-conditions for every Cozya AI route handler:
 *
 *   1. `OPENROUTER_API_KEY` is configured (else 503 `AI_DISABLED`).
 *   2. The request has a valid user session (else 401 `UNAUTHORIZED`).
 *   3. The user is under the per-hour anti-script invocation limit
 *      (else 429 `RATE_LIMITED` with `Retry-After`).
 *   4. Verified email and current membership in the family shown in the browser.
 *      Purchased credits remain spendable without an active subscription.
 *
 * `errorScope` is used for the structured log key emitted when the OpenRouter
 * key is missing (e.g. `"cozya.parse_text"` → `"cozya.parse_text.openrouter_key_missing"`).
 */
export async function withAiRouteGuards(opts: {
  request: Request;
  errorScope: string;
}): Promise<AiRouteGuardResult> {
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

  const actor = await cozyaAuthority(userId);
  if (
    !actor.familyGroupId ||
    opts.request.headers.get("X-Compasso-Family") !== actor.familyGroupId
  ) {
    return {
      ok: false,
      response: Response.json({ code: "FAMILY_CONTEXT_CHANGED" }, { status: 409 }),
    };
  }

  try {
    await validateFamilyChoice(userId, actor.familyGroupId);
  } catch (error) {
    if (error instanceof FamilyError) return { ok: false, response: aiErrorResponse(error) };
    throw error;
  }
  return { ok: true, userId, actor: { ...actor, familyGroupId: actor.familyGroupId } };
}

// Re-export do helper compartilhado em `@informach/ai-core` para que os
// services do cozya possam continuar importando de `./_shared` sem mudança
// (e para que `agenda-da-turma` reuse o mesmo normalizador quando ganhar IA).
export { normalizeUsage } from "@informach/ai-core";
