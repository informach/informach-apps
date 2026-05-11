/**
 * Modelo de execução por feature de IA do cozya.
 *
 * Esta é a fonte de verdade do *modelo de execução* — qual ID o caller passa
 * para o gateway (`createOpenRouter("openai/gpt-4o-mini")`). É distinto de
 * `billing.credit_pricing`, que é a fonte de verdade do *modelo de billing* —
 * qual `(feature, model)` está ativo para cobrança. Em produção os dois devem
 * bater: trocar de modelo é (1) inserir nova row em `credit_pricing` com
 * `effective_to=null` na antiga + (2) atualizar este map num PR só.
 *
 * O `satisfies Record<CozyaFeature, string>` garante que se uma feature nova
 * for adicionada à union (`CozyaFeature`) sem mapear aqui, o build falha. O
 * `as const` preserva os literais para uso direto em `withCredits({ model })`.
 *
 * Ver `packages/billing/src/seeds/credit-pricing.ts` (`COZYA_PRICING_SEED`)
 * para a tabela espelhada de pricing.
 */

export type CozyaFeature =
  | "cozya.recipe.extract_from_photo"
  | "cozya.recipe.extract_from_url"
  | "cozya.recipe.extract_from_text"
  | "cozya.recipe.generate_from_prompt"
  | "cozya.recipe.refine_conversational"
  | "cozya.recipe.transcribe_audio"
  | "cozya.recipe.parse_voice";

export const COZYA_MODELS = {
  "cozya.recipe.extract_from_photo": "openai/gpt-4o",
  "cozya.recipe.extract_from_url": "openai/gpt-4o-mini",
  "cozya.recipe.extract_from_text": "openai/gpt-4o-mini",
  "cozya.recipe.generate_from_prompt": "openai/gpt-4o-mini",
  "cozya.recipe.refine_conversational": "openai/gpt-4o-mini",
  "cozya.recipe.transcribe_audio": "openai/gpt-4o-transcribe",
  "cozya.recipe.parse_voice": "openai/gpt-4o-mini",
} as const satisfies Record<CozyaFeature, string>;

export type CozyaModel = (typeof COZYA_MODELS)[CozyaFeature];
