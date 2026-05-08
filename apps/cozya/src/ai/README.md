# `src/ai/` — agentes IA do app

Agentes, workflows e prompts específicos do app `cozya` moram aqui. Primitivas compartilhadas (Mastra, providers AI SDK, factories `createMastra`/`createPostgresStore`/`createSharedMemory`, observabilidade, recorder de auditoria e wrappers de execução/billing) vêm de `@informach/ai-core`.

## Contrato

1. **`src/ai/index.ts`** começa com `import "server-only";` — falha de build se algum Client Component puxar acidentalmente.
2. Use as factories de `@informach/ai-core/mastra`, `@informach/ai-core/providers` e `@informach/ai-core/logger`. Nada de `process.env` direto neste arquivo — leia tudo de `@/lib/env`.
3. **Owner do saldo** (para `withCredits`) neste app é sempre `{ type: "user", id: session.user.id }` — cozya é single-user, sem organizations.
4. Chamada paga simples deve usar `runBillableAiCall`; fluxo multiestágio deve usar uma reserva de `withCredits` e `runRecordedAiCall` por estágio auditável.
5. **`runId`** passado para `agent.generate(input, { runId })` deve ser **o mesmo** `reservation.id` retornado pelo wrapper de billing, salvo estágios internos com `recordRunId` próprio e `reservationId` em metadata. É o que liga `ai.agent_runs.id` ↔ `billing.creditLedger.runId` ↔ `ai_mastra.mastra_traces.runId`.
6. Tabelas relevantes:
   - `ai.agent_runs`, `ai.usage_logs` — auditoria nossa (usar `createAgentRunRecorder` com `runBillableAiCall`/`runRecordedAiCall`).
   - `ai_mastra.mastra_*` — Mastra cria/migra automaticamente no primeiro boot do agente.
7. Ao adicionar um novo agente, registre-o em `src/ai/index.ts` no objeto `agents` que é passado para `createMastra`.

## Esqueleto

```ts
import "server-only";
import {
  Agent,
  createDefaultObservability,
  createMastra,
  createPostgresStore,
  createSharedMemory,
} from "@informach/ai-core/mastra";
import { createOpenRouter } from "@informach/ai-core/providers";
import { createDefaultLogger } from "@informach/ai-core/logger";
import { env } from "@/lib/env";

const openrouter = createOpenRouter({
  apiKey: env.OPENROUTER_API_KEY,
  ...(env.OPENROUTER_X_TITLE ? { appName: env.OPENROUTER_X_TITLE } : {}),
  ...(env.OPENROUTER_HTTP_REFERER ? { appUrl: env.OPENROUTER_HTTP_REFERER } : {}),
});
const storage   = createPostgresStore({ connectionString: env.DATABASE_URL });
const memory    = createSharedMemory({ storage });

const exampleAgent = new Agent({
  name: "example",
  instructions: "...",
  model: openrouter("openai/gpt-4o-mini"),
  memory,
});

export const mastra = createMastra({
  agents: { example: exampleAgent },
  storage,
  logger: createDefaultLogger({ name: "cozya", level: env.MASTRA_LOG_LEVEL }),
  observability: createDefaultObservability({ serviceName: "cozya" }),
});
```

Detalhes de arquitetura: `docs/arquitetura-apps.md` §"Pasta `src/ai/`" e `packages/ai-core/CLAUDE.md`.
