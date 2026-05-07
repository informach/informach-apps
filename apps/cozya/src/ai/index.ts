import "server-only";

import { createDefaultLogger } from "@informach/ai-core/logger";
import { createMastra, createPostgresStore, createSharedMemory } from "@informach/ai-core/mastra";
import { createOpenAI } from "@informach/ai-core/providers";
import { env } from "@/lib/env";
import { createRecipeParserAgent } from "./recipe-parser/agent";

const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY ?? "" });
const storage = createPostgresStore({ connectionString: env.DATABASE_URL });
const memory = createSharedMemory({ storage });

const recipeParser = createRecipeParserAgent({
  model: openai("gpt-4o-mini"),
  memory,
});

export const mastra = createMastra({
  agents: { recipeParser },
  storage,
  logger: createDefaultLogger({ name: "cozya", level: env.MASTRA_LOG_LEVEL }),
});
