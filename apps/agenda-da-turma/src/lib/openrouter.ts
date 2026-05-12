import "server-only";

import { createOpenRouter } from "@informach/ai-core/providers";
import { env } from "./env";

/**
 * Headers opcionais de atribuição recomendados pelo OpenRouter.
 *
 * Mantemos a env `OPENROUTER_X_TITLE` por compatibilidade interna, mas o
 * header HTTP correto é `X-OpenRouter-Title`.
 */
export function openRouterAttributionHeaders(): Record<string, string> {
  return {
    ...(env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER } : {}),
    ...(env.OPENROUTER_X_TITLE ? { "X-OpenRouter-Title": env.OPENROUTER_X_TITLE } : {}),
  };
}

let cachedOpenRouter: ReturnType<typeof createOpenRouter> | null = null;

/**
 * Factory cached do provider OpenRouter para todas as chamadas de IA do app.
 * Compartilhada entre `getMastra()` (que constrói os agents do app) e
 * eventuais services que chamem `generateText`/`generateObject` direto.
 *
 * Lazy + cached: postpõe a inicialização para o primeiro uso (não toca env
 * durante import) e zero-cost em chamadas subsequentes.
 *
 * Throw early se `OPENROUTER_API_KEY` não estiver setada — os route handlers
 * de IA já gateiam isso via `withAiRouteGuards` (503 AI_DISABLED) antes de
 * chegar aqui, então cair neste throw indica que alguém esqueceu o guard.
 */
export function getOpenRouter(): ReturnType<typeof createOpenRouter> {
  if (cachedOpenRouter) return cachedOpenRouter;
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not configured. AI route handlers should gate with withAiRouteGuards before calling getOpenRouter().",
    );
  }
  cachedOpenRouter = createOpenRouter({
    apiKey,
    ...(env.OPENROUTER_X_TITLE ? { appName: env.OPENROUTER_X_TITLE } : {}),
    ...(env.OPENROUTER_HTTP_REFERER ? { appUrl: env.OPENROUTER_HTTP_REFERER } : {}),
  });
  return cachedOpenRouter;
}
