import "server-only";

import { createDefaultLogger } from "@informach/ai-core/logger";
import {
  createDefaultObservability,
  createMastra,
  createPostgresStore,
  createSharedMemory,
} from "@informach/ai-core/mastra";
import { env } from "@/lib/env";
import { getOpenRouter } from "@/lib/openrouter";
import { AGENDA_MODELS } from "./models";
import { createSubjectsParserAgent } from "./subjects-parser/agent";

type Mastra = ReturnType<typeof createMastra>;

let cached: Mastra | null = null;

/**
 * Lazy Mastra factory. Postpõe a abertura do pool Postgres + instanciação do
 * provider até a primeira chamada de IA (em vez de abrir no import). Cached
 * após primeira chamada — invocações subsequentes são zero-cost.
 *
 * Dois agentes parser compartilham as mesmas instruções/schema e diferem só
 * no modelo. Visão usa `openai/gpt-4o` (handwriting OCR + lista estruturada);
 * texto usa `openai/gpt-4o-mini` (5x mais barato, suficiente para extrair
 * estrutura de transcrição limpa).
 *
 * Todas as chamadas roteiam por OpenRouter (gateway único) — IDs prefixados
 * com `openai/` por convenção. Transcrição (whisper-style) tem fluxo
 * separado em `features/ai/transcribe-subjects-service.ts` apontando para o
 * mesmo gateway via `/audio/transcriptions` OpenAI-compatible.
 */
export function getMastra(): Mastra {
  if (cached) return cached;

  const openrouter = getOpenRouter();
  const storage = createPostgresStore({
    connectionString: env.DATABASE_URL,
    disableInit: true,
  });
  // Memória compartilhada entre os agentes do app. Sem working memory
  // persistida — matérias é extração one-shot, não conversa. Mastra exige
  // memory configurado para o agente; usamos a versão default.
  const memory = createSharedMemory({ storage });

  const textModel = AGENDA_MODELS["agenda.subjects.parse_voice"];
  const visionModel = AGENDA_MODELS["agenda.subjects.parse_image"];

  const subjectsParser = createSubjectsParserAgent({
    model: openrouter(textModel),
    memory,
  });

  const subjectsParserVision = createSubjectsParserAgent({
    id: "subjectsParserVision",
    name: "subjectsParserVision",
    model: openrouter(visionModel),
    memory,
  });

  cached = createMastra({
    agents: { subjectsParser, subjectsParserVision },
    storage,
    logger: createDefaultLogger({ name: "agenda-da-turma", level: env.MASTRA_LOG_LEVEL }),
    observability: createDefaultObservability({ serviceName: "agenda-da-turma" }),
  });
  return cached;
}
