import type { CozyaModel } from "./models";

/**
 * Lista de modelos fallback por modelo primário, em ordem de preferência.
 * Quando o primário falha (provider down, quota, 5xx), o OpenRouter tenta o
 * próximo modelo e só cobra o que efetivamente respondeu.
 *
 * O cozya não muda o modelo primário em runtime — fallback é "rede de
 * segurança" para indisponibilidade transitória, não A/B test ou cost-routing.
 *
 * - Para o modelo de chat default (`gpt-4o-mini`), promovemos o vision-capable
 *   `gpt-4o` como fallback porque mantém o mesmo provider (OpenAI) e suporta
 *   estruturação por schema sem ajuste de prompt.
 * - Para vision (`gpt-4o`), Claude 3.5 Sonnet é o backup natural — mesma
 *   capacidade multimodal, fluência PT-BR.
 * - Whisper não tem substituto adequado dentro do OpenRouter; deixamos vazio
 *   para que falhas peguem o `withRetry` em cima e/ou propagem como erro.
 */
export const COZYA_FALLBACKS: Record<string, readonly string[]> = {
  "openai/gpt-4o-mini": ["openai/gpt-4o"],
  "openai/gpt-4o": ["anthropic/claude-3.5-sonnet"],
  "openai/whisper-1": [],
};

/**
 * Constrói o `extraBody` do `OpenRouterChatSettings` com a lista canônica de
 * modelos (primário + fallbacks). Quando não há fallback configurado para o
 * primário, devolve objeto vazio para não enviar `models` ao OpenRouter (o
 * comportamento default sem `models` no body é "tente apenas o primário").
 */
export function withModelFallbacks(primary: CozyaModel): { extraBody?: { models: string[] } } {
  const fallbacks = COZYA_FALLBACKS[primary] ?? [];
  if (fallbacks.length === 0) return {};
  return { extraBody: { models: [primary, ...fallbacks] } };
}
