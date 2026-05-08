import "server-only";

import { createOpenRouter } from "@informach/ai-core/providers";
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

let cachedOpenRouter: ReturnType<typeof createOpenRouter> | null = null;

/**
 * Factory cached do provider OpenRouter para todas as chamadas de IA do
 * cozya. Compartilhada entre o `getMastra()` (que constrói os agents
 * `recipeParser`/`recipeParserVision`) e os services que ainda chamam
 * `generateText` direto (ex.: `researchRecipeFromPrompt`).
 *
 * Lazy + cached pelo mesmo motivo do `getMastra()`: postpõe a inicialização
 * para o primeiro uso (não toca env durante import) e zero-cost em chamadas
 * subsequentes. Os headers de atribuição são lidos do `env` em chamada única
 * — re-criar o provider a cada request seria desperdício de alocação.
 */
export function getOpenRouter(): ReturnType<typeof createOpenRouter> {
  if (cachedOpenRouter) return cachedOpenRouter;
  cachedOpenRouter = createOpenRouter({
    apiKey: env.OPENROUTER_API_KEY,
    ...(env.OPENROUTER_X_TITLE ? { appName: env.OPENROUTER_X_TITLE } : {}),
    ...(env.OPENROUTER_HTTP_REFERER ? { appUrl: env.OPENROUTER_HTTP_REFERER } : {}),
  });
  return cachedOpenRouter;
}
