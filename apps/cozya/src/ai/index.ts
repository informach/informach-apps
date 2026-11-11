import "server-only";

import { createMastra } from "@informach/ai-core/mastra";
import { getOpenRouter } from "@/lib/openrouter";
import { COZYA_MODELS } from "./models";
import { cozyaModelPolicy } from "./provider-policy";
import { createRecipeParserAgent } from "./recipe-parser/agent";
import { createRecipeRefinerAgent } from "./recipe-refiner/agent";

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
 * Quotes are bound to the selected model. Provider routing enforces the reviewed
 * token price ceiling; no more expensive model is substituted after acceptance.
 */
export function getMastra(): Mastra {
  if (cached) return cached;

  const openrouter = getOpenRouter();
  // Stateless extraction: no conversational memory or content-bearing trace exporter.
  // Operational token/billing telemetry remains in our ai.agent_runs recorder.

  const textModel = COZYA_MODELS["cozya.recipe.extract_from_text"];
  const visionModel = COZYA_MODELS["cozya.recipe.extract_from_photo"];
  const refineModel = COZYA_MODELS["cozya.recipe.refine_conversational"];

  const recipeParser = createRecipeParserAgent({
    model: openrouter(textModel, cozyaModelPolicy(textModel)),
  });

  const recipeParserVision = createRecipeParserAgent({
    id: "recipeParserVision",
    name: "recipeParserVision",
    model: openrouter(visionModel, cozyaModelPolicy(visionModel)),
  });

  const recipeRefiner = createRecipeRefinerAgent({
    model: openrouter(refineModel, cozyaModelPolicy(refineModel)),
  });

  cached = createMastra({
    agents: { recipeParser, recipeParserVision, recipeRefiner },
    // Mastra debug/error payloads can contain full model output. Our sanitized recorder
    // remains responsible for diagnostics, even when MASTRA_LOG_LEVEL=debug in the environment.
    logger: false,
  });
  return cached;
}
