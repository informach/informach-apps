import "server-only";

import { Agent, type Memory } from "@informach/ai-core/mastra";
import { RECIPE_REFINER_INSTRUCTIONS } from "./instructions";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

export function createRecipeRefinerAgent(opts: { model: AgentModel; memory?: Memory }): Agent {
  return new Agent({
    id: "recipeRefiner",
    name: "recipeRefiner",
    instructions: RECIPE_REFINER_INSTRUCTIONS,
    model: opts.model,
    memory: opts.memory,
  });
}
