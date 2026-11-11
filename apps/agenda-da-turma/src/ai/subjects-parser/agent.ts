import "server-only";

import { Agent } from "@informach/ai-core/mastra";
import { SUBJECTS_PARSER_INSTRUCTIONS } from "./instructions";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * Cria o agente parser de matérias. Por default, id/name são "subjectsParser"
 * (texto). Para o flavour de visão, passar `id: "subjectsParserVision"`,
 * `name: "subjectsParserVision"` e `model` apontando para um vision-capable
 * (gpt-4o).
 *
 * Extração sem memória de conversa; apenas métricas de execução são registradas.
 */
export function createSubjectsParserAgent(opts: {
  model: AgentModel;
  id?: string;
  name?: string;
}): Agent {
  return new Agent({
    maxRetries: 0,
    maxProcessorRetries: 0,
    errorProcessorDefaults: false,
    id: opts.id ?? "subjectsParser",
    name: opts.name ?? "subjectsParser",
    instructions: SUBJECTS_PARSER_INSTRUCTIONS,
    model: opts.model,
  });
}
