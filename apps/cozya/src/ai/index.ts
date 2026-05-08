import "server-only";

import { createDefaultLogger } from "@informach/ai-core/logger";
import { createMastra, createPostgresStore, createSharedMemory } from "@informach/ai-core/mastra";
import { env } from "@/lib/env";
import { getOpenRouter } from "@/lib/openrouter";
import { withModelFallbacks } from "./fallbacks";
import { COZYA_MODELS } from "./models";
import { createRecipeParserAgent } from "./recipe-parser/agent";

type Mastra = ReturnType<typeof createMastra>;

let cached: Mastra | null = null;

/**
 * Lazy Mastra factory. Postpones the Postgres pool + provider instantiation
 * until the first AI call instead of opening it at module import time. Cached
 * after the first call so subsequent invocations are zero-cost.
 *
 * Two parser agents share the same instructions/schema but differ in the
 * underlying model. Vision flow uses gpt-4o (per cozya/CLAUDE.md §2 +
 * credit_pricing seed); text/voice/url flows use the cheaper gpt-4o-mini.
 *
 * All model calls route through OpenRouter as the single gateway — IDs are
 * prefixed with `openai/` per OpenRouter convention. Whisper transcription
 * (separate flow in features/ai/transcribe-service.ts) uses the same gateway
 * via OpenAI-compatible /audio/transcriptions endpoint.
 *
 * Fallback routing: each agent receives `extraBody.models` derived from
 * `withModelFallbacks(primary)`. When the primary is unavailable (provider
 * down, quota), OpenRouter falls through to the next model in the list and
 * bills only the model that actually answered. See `apps/cozya/src/ai/fallbacks.ts`.
 */
export function getMastra(): Mastra {
  if (cached) return cached;

  const openrouter = getOpenRouter();
  const storage = createPostgresStore({ connectionString: env.DATABASE_URL });
  const memory = createSharedMemory({ storage });

  const textModel = COZYA_MODELS["cozya.recipe.extract_from_text"];
  const visionModel = COZYA_MODELS["cozya.recipe.extract_from_photo"];

  const recipeParser = createRecipeParserAgent({
    model: openrouter(textModel, withModelFallbacks(textModel)),
    memory,
  });

  const recipeParserVision = createRecipeParserAgent({
    id: "recipeParserVision",
    name: "recipeParserVision",
    model: openrouter(visionModel, withModelFallbacks(visionModel)),
    memory,
  });

  cached = createMastra({
    agents: { recipeParser, recipeParserVision },
    storage,
    logger: createDefaultLogger({ name: "cozya", level: env.MASTRA_LOG_LEVEL }),
  });
  return cached;
}
