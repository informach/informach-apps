import "server-only";

import {
  checkTrialAdmission,
  grantNoticeTrialCredits,
  type NoticeTrialGrant,
} from "@/features/notices/trial";
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
 *   4. Conta com Pro entitlement (else 403 `SUBSCRIPTION_REQUIRED`), ou com
 *      franquia de teste quando a rota declara `freeTrial`.
 *
 * `errorScope` vira o prefixo das log keys (ex.: `"agenda.parse_image"` →
 * `"agenda.parse_image.openrouter_key_missing"`).
 */
export async function withAiRouteGuards(opts: {
  errorScope: string;
  /**
   * Resolve a conta titular a partir de quem está operando. Sem isso o titular
   * é o próprio usuário — correto para conta de um adulto só. Rotas que sabem
   * de qual criança se trata devem resolver pelo perfil, senão um segundo
   * adulto convidado é tratado como Free mesmo numa família Pro.
   */
  ownerId?: (userId: string) => Promise<string>;
  /**
   * Quando presente, o plano gratuito entra pela franquia de teste em vez de
   * receber `SUBSCRIPTION_REQUIRED`. O valor diz qual concessão financia a
   * chamada — ver `features/notices/trial.ts`.
   */
  freeTrial?: NoticeTrialGrant;
}): Promise<AiRouteGuardResult> {
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

  // O dono da franquia é a conta titular, não quem está operando: um segundo
  // adulto convidado usa o plano e os créditos da família.
  const ownerId = opts.ownerId ? await opts.ownerId(userId) : userId;
  const isPro = await billing.hasProSubscription({ type: "user", id: ownerId });
  if (!isPro) {
    // Rotas que fazem parte do fluxo único de importação entram pela franquia
    // de teste em vez do gate Pro seco — ver `features/notices/trial.ts`. A
    // admissão é a MESMA de `reserveNoticeParse`: e-mail confirmado, orçamento
    // diário global e teto de importações. Checar só o teto deixava uma conta
    // não verificada gastar IA por conta da casa.
    if (opts.freeTrial) {
      const admission = await checkTrialAdmission(
        userId,
        ownerId,
        env.AGENDA_TRIAL_DAILY_BUDGET,
        opts.freeTrial,
      );
      if (admission.ok) {
        await grantNoticeTrialCredits(ownerId, opts.freeTrial);
        return { ok: true, userId, subject: { type: "user", id: ownerId } };
      }
      logger.info({ userId, code: admission.code }, `${opts.errorScope}.trial_denied`);
      return {
        ok: false,
        response: jsonUtf8(
          { code: admission.code },
          { status: admission.code === "TRIAL_BUSY" ? 503 : 403 },
        ),
      };
    }
    return {
      ok: false,
      response: jsonUtf8({ code: "SUBSCRIPTION_REQUIRED" }, { status: 403 }),
    };
  }

  return { ok: true, userId, subject: { type: "user", id: ownerId } };
}

// Re-export do helper compartilhado em `@informach/ai-core` — disponível
// para services do app que precisem normalizar `usage` de providers
// heterogêneos antes de passar pra billing.
export { normalizeUsage } from "@informach/ai-core";
