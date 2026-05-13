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
import { createActivitiesParserAgent } from "./activities-parser/agent";
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

  const subjectsTextModel = AGENDA_MODELS["agenda.subjects.parse_voice"];
  const subjectsVisionModel = AGENDA_MODELS["agenda.subjects.parse_image"];
  const activitiesTextModel = AGENDA_MODELS["agenda.activities.parse_voice"];
  const activitiesVisionModel = AGENDA_MODELS["agenda.activities.parse_image"];
  const activitiesPdfModel = AGENDA_MODELS["agenda.activities.parse_pdf"];

  const subjectsParser = createSubjectsParserAgent({
    model: openrouter(subjectsTextModel),
    memory,
  });

  const subjectsParserVision = createSubjectsParserAgent({
    id: "subjectsParserVision",
    name: "subjectsParserVision",
    model: openrouter(subjectsVisionModel),
    memory,
  });

  const activitiesParser = createActivitiesParserAgent({
    model: openrouter(activitiesTextModel),
    memory,
  });

  const activitiesParserVision = createActivitiesParserAgent({
    id: "activitiesParserVision",
    name: "activitiesParserVision",
    model: openrouter(activitiesVisionModel),
    memory,
  });

  // Sibling do vision parser — reusa as mesmas instructions/schema, só
  // diferencia o id pra tracing/logs. O caller envia `type: "file"` com
  // `mediaType: "application/pdf"` em vez de `type: "image"`. AI SDK v6
  // suporta nativamente PDF como input multimodal pro gpt-4o (OpenAI
  // Chat API com PDF support).
  const activitiesParserPdf = createActivitiesParserAgent({
    id: "activitiesParserPdf",
    name: "activitiesParserPdf",
    model: openrouter(activitiesPdfModel),
    memory,
  });

  cached = createMastra({
    agents: {
      subjectsParser,
      subjectsParserVision,
      activitiesParser,
      activitiesParserVision,
      activitiesParserPdf,
    },
    storage,
    logger: createDefaultLogger({ name: "agenda-da-turma", level: env.MASTRA_LOG_LEVEL }),
    observability: createDefaultObservability({ serviceName: "agenda-da-turma" }),
  });
  return cached;
}
