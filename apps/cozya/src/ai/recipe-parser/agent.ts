import "server-only";

import { Agent, type Memory } from "@informach/ai-core/mastra";
import { RECIPE_PARSER_INSTRUCTIONS } from "./instructions";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

export function createRecipeParserAgent(opts: {
  model: AgentModel;
  memory: Memory;
  id?: string;
  name?: string;
}): Agent {
  return new Agent({
    id: opts.id ?? "recipeParser",
    name: opts.name ?? "recipeParser",
    instructions: RECIPE_PARSER_INSTRUCTIONS,
    model: opts.model,
    memory: opts.memory,
  });
}
