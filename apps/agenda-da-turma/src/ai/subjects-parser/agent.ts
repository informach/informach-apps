import "server-only";

import { Agent, type Memory } from "@informach/ai-core/mastra";
import { SUBJECTS_PARSER_INSTRUCTIONS } from "./instructions";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

/**
 * Cria o agente parser de matérias. Por default, id/name são "subjectsParser"
 * (texto). Para o flavour de visão, passar `id: "subjectsParserVision"`,
 * `name: "subjectsParserVision"` e `model` apontando para um vision-capable
 * (gpt-4o).
 *
 * Memory é compartilhada entre todos os agentes da app via
 * `createSharedMemory(storage)` em `src/ai/index.ts`. Para matérias não usamos
 * working memory persistida (extração é one-shot), mas a memory é necessária
 * pra Mastra rodar — passa pelos dois agentes.
 */
export function createSubjectsParserAgent(opts: {
  model: AgentModel;
  memory: Memory;
  id?: string;
  name?: string;
}): Agent {
  return new Agent({
    id: opts.id ?? "subjectsParser",
    name: opts.name ?? "subjectsParser",
    instructions: SUBJECTS_PARSER_INSTRUCTIONS,
    model: opts.model,
    memory: opts.memory,
  });
}
