import "server-only";
import { createMastra } from "@informach/ai-core/mastra";
import { getOpenRouter } from "@/lib/openrouter";
import { AGENDA_MODELS } from "./models";
import { createSubjectsParserAgent } from "./subjects-parser/agent";

let cached: ReturnType<typeof createMastra> | null = null;
/** One-shot parsers do not need a conversation store or content trace exporter. */
export function getMastra() {
  if (cached) return cached;
  const openrouter = getOpenRouter();
  const subjectsParser = createSubjectsParserAgent({
    model: openrouter(AGENDA_MODELS["agenda.subjects.parse_voice"], {
      provider: {
        only: ["openai"],
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 0.15, completion: 0.6 },
      },
    }),
  });
  const subjectsParserVision = createSubjectsParserAgent({
    id: "subjectsParserVision",
    name: "subjectsParserVision",
    model: openrouter(AGENDA_MODELS["agenda.subjects.parse_image"], {
      provider: {
        only: ["openai"],
        allow_fallbacks: false,
        require_parameters: true,
        max_price: { prompt: 2.5, completion: 10 },
      },
    }),
  });
  cached = createMastra({ agents: { subjectsParser, subjectsParserVision }, logger: false });
  return cached;
}
