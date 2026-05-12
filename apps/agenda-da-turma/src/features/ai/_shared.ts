import "server-only";

import { getServerSession } from "@/lib/auth";
import { billing } from "@/lib/billing";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  AGENDA_RATE_LIMITS,
  aiInvokeKey,
  enforceRateLimit,
  RateLimitedError,
} from "@/lib/rate-limit";

export type AiSubject = { readonly type: "user"; readonly id: string };

export type AiRouteGuardResult =
  | { ok: true; userId: string; subject: AiSubject }
  | { ok: false; response: Response };

/**
 * JSON response com `Content-Type: application/json; charset=utf-8` explícito.
 * O `Response.json()` nativo emite `application/json` sem charset, o que faz
 * alguns navegadores/proxies interpretarem o corpo como Latin-1 e mojibake
 * acentos pt-BR (ó → Ã³, ã → Ã£). As features de IA da Agenda retornam
 * mensagens em pt-BR — usar este helper em vez de `Response.json` direto.
 */
export function jsonUtf8(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { ...init, headers });
}

/**
 * Pré-condições compartilhadas por TODOS os route handlers de IA da Agenda:
 *
 *   1. `OPENROUTER_API_KEY` configurada (else 503 `AI_DISABLED`).
 *   2. Sessão de usuário válida (else 401 `UNAUTHORIZED`).
 *   3. Usuário dentro do cap horário anti-script (else 429 `RATE_LIMITED`
 *      com header `Retry-After`).
 *   4. Usuário com Pro entitlement (else 403 `SUBSCRIPTION_REQUIRED`).
 *
 * `errorScope` vira o prefixo das log keys (ex.: `"agenda.parse_image"` →
 * `"agenda.parse_image.openrouter_key_missing"`).
 */
export async function withAiRouteGuards(opts: { errorScope: string }): Promise<AiRouteGuardResult> {
  if (!env.OPENROUTER_API_KEY) {
    logger.error({}, `${opts.errorScope}.openrouter_key_missing`);
    return {
      ok: false,
      response: jsonUtf8({ code: "AI_DISABLED" }, { status: 503 }),
    };
  }

  const session = await getServerSession();
  if (!session?.user) {
    return {
      ok: false,
      response: jsonUtf8({ code: "UNAUTHORIZED" }, { status: 401 }),
    };
  }
  const userId = session.user.id;
  const subject: AiSubject = { type: "user", id: userId };

  try {
    await enforceRateLimit({
      key: aiInvokeKey(userId),
      ...AGENDA_RATE_LIMITS.AI_INVOKE_PER_HOUR,
    });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return {
        ok: false,
        response: jsonUtf8(
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
      response: jsonUtf8({ code: "SUBSCRIPTION_REQUIRED" }, { status: 403 }),
    };
  }

  return { ok: true, userId, subject };
}

// Re-export do helper compartilhado em `@informach/ai-core` — disponível
// para services do app que precisem normalizar `usage` de providers
// heterogêneos antes de passar pra billing.
export { normalizeUsage } from "@informach/ai-core";
