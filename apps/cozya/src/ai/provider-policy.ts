import type { CozyaModel } from "./models";

/** USD per million tokens, verified against the provider catalog on 2026-11-10. */
export const COZYA_MODEL_PRICES = {
  "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/gpt-4o": { prompt: 2.5, completion: 10 },
  "openai/gpt-4o-transcribe": { prompt: 2.5, completion: 10 },
} as const satisfies Record<CozyaModel, { prompt: number; completion: number }>;

/** A quote may change provider within this price ceiling, never silently change model. */
export function cozyaModelPolicy(model: CozyaModel) {
  return { provider: { require_parameters: true, max_price: COZYA_MODEL_PRICES[model] } };
}
