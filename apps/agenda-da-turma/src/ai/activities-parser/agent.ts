import "server-only";

import { Agent, type Memory } from "@informach/ai-core/mastra";
import { ACTIVITIES_PARSER_INSTRUCTIONS } from "./instructions";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * Cria o agente parser de atividades. Por default, id/name são
 * "activitiesParser" (texto). Para o flavour de visão, passar
 * `id: "activitiesParserVision"`, `name: "activitiesParserVision"` e `model`
 * apontando para um vision-capable (gpt-4o).
 *
 * Mesma estratégia de `createSubjectsParserAgent` — memory compartilhada,
 * extração one-shot sem working memory persistida.
 */
export function createActivitiesParserAgent(opts: {
  model: AgentModel;
  memory: Memory;
  id?: string;
  name?: string;
}): Agent {
  return new Agent({
    id: opts.id ?? "activitiesParser",
    name: opts.name ?? "activitiesParser",
    instructions: ACTIVITIES_PARSER_INSTRUCTIONS,
    model: opts.model,
    memory: opts.memory,
  });
}
