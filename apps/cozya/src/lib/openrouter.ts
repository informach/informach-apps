import "server-only";

import { env } from "./env";

/**
 * Headers opcionais de atribuição recomendados pelo OpenRouter.
 *
 * Mantemos a env `OPENROUTER_X_TITLE` por compatibilidade interna, mas o header
 * HTTP correto é `X-OpenRouter-Title`.
 */
export function openRouterAttributionHeaders(): Record<string, string> {
  return {
    ...(env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER } : {}),
    ...(env.OPENROUTER_X_TITLE ? { "X-OpenRouter-Title": env.OPENROUTER_X_TITLE } : {}),
  };
}
