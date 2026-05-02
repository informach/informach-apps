# `src/ai/` — agentes IA do app

Agentes, workflows e prompts específicos do app `cozya` moram aqui. Primitivas compartilhadas (Mastra, providers AI SDK, factories `createMastra`/`createPostgresStore`/`createSharedMemory`, recorder de auditoria, billing wrapper) vêm de `@informach/ai-core`.

## Contrato

1. **`src/ai/index.ts`** começa com `import "server-only";` — falha de build se algum Client Component puxar acidentalmente.
2. Use as factories de `@informach/ai-core/mastra`, `@informach/ai-core/providers` e `@informach/ai-core/logger`. Nada de `process.env` direto neste arquivo — leia tudo de `@/lib/env`.
3. **Owner do saldo** (para `withCredits`) neste app é sempre `{ type: "user", id: session.user.id }` — cozya é single-user, sem organizations.
4. **`runId`** passado para `agent.generate(input, { runId })` deve ser **o mesmo** `reservation.id` retornado por `withCredits`. É o que liga `ai.agent_runs.id` ↔ `billing.creditLedger.runId` ↔ `ai_mastra.mastra_traces.runId`.
5. Tabelas relevantes:
   - `ai.agent_runs`, `ai.usage_logs` — auditoria nossa (chamar `createAgentRunRecorder` ao redor do `withCredits`).
   - `ai_mastra.mastra_*` — Mastra cria/migra automaticamente no primeiro boot do agente.
6. Ao adicionar um novo agente, registre-o em `src/ai/index.ts` no objeto `agents` que é passado para `createMastra`.

## Esqueleto

```ts
import "server-only";
import {
  createMastra,
  createPostgresStore,
  createSharedMemory,
  Agent,
} from "@informach/ai-core/mastra";
import { createAnthropic } from "@informach/ai-core/providers";
import { createDefaultLogger } from "@informach/ai-core/logger";
import { env } from "@/lib/env";

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" });
const storage   = createPostgresStore({ connectionString: env.DATABASE_URL });
const memory    = createSharedMemory({ storage });

const exampleAgent = new Agent({
  name: "example",
  instructions: "...",
  model: anthropic("claude-opus-4-7"),
  memory,
});

export const mastra = createMastra({
  agents: { example: exampleAgent },
  storage,
  logger: createDefaultLogger({ name: "cozya", level: env.MASTRA_LOG_LEVEL }),
});
```

Detalhes de arquitetura: `docs/arquitetura-apps.md` §"Pasta `src/ai/`" e `packages/ai-core/CLAUDE.md`.
