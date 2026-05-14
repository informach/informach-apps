# `src/ai/` — agentes IA do app

Agentes, workflows e prompts específicos do app `agenda-da-turma` moram aqui. Primitivas compartilhadas (Mastra, providers AI SDK, factories `createMastra`/`createPostgresStore`/`createSharedMemory`, recorder de auditoria, billing wrapper) vêm de `@informach/ai-core`.

> Status atual: agenda-da-turma **consome IA em produção** para importar matérias e atividades por imagem, áudio/voz e PDF. As features ativas estão em `src/ai/models.ts` e o preço em créditos é semeado por `packages/billing/src/seeds/credit-pricing.ts`.

## Contrato

1. **`src/ai/index.ts`** começa com `import "server-only";` — falha de build se algum Client Component puxar acidentalmente.
2. Use as factories de `@informach/ai-core/mastra`, `@informach/ai-core/providers` e `@informach/ai-core/logger`. Nada de `process.env` direto neste arquivo — leia tudo de `@/lib/env` (e adicione a env nova ao Zod schema antes).
3. **Owner do saldo** (para `withCredits`) neste app é sempre `{ type: "user", id: userId }` — agenda-da-turma é single-user (mesmo modelo do Cozya). Ao chamar `createBillingService`, passar `app: APPS.agendaDaTurma.slug` garante que créditos da Agenda ficam isolados dos do Cozya mesmo para o mesmo `user.id`.
4. **`runId`** passado para `agent.generate(input, { runId })` deve ser **o mesmo** `reservation.id` retornado por `withCredits`. É o que liga `ai.agent_runs.id` ↔ `billing.creditLedger.runId` ↔ `ai_mastra.mastra_traces.runId`.
5. Tabelas relevantes:
   - `ai.agent_runs`, `ai.usage_logs` — auditoria nossa (chamar `createAgentRunRecorder` ao redor do `withCredits`).
   - `ai_mastra.mastra_*` — criadas/atualizadas pelo migrator (`pnpm db:migrate` via `PostgresStore.init()`), não pelo runtime do app.
6. Ao adicionar um novo agente, registre-o em `src/ai/index.ts` no objeto `agents` que é passado para `createMastra`.

## Referência de composição

```ts
import "server-only";
import {
  createMastra,
  createPostgresStore,
  createSharedMemory,
  Agent,
} from "@informach/ai-core/mastra";
import { createOpenRouter } from "@informach/ai-core/providers";
import { createDefaultLogger } from "@informach/ai-core/logger";
import { env } from "@/lib/env";

// OPENROUTER_API_KEY e variantes opcionais são declaradas em src/lib/env.ts.
// OpenRouter é o gateway único.
const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
const storage    = createPostgresStore({
  connectionString: env.DATABASE_URL,
  disableInit: true,
});
const memory     = createSharedMemory({ storage });

const exampleAgent = new Agent({
  name: "example",
  instructions: "...",
  model: openrouter("openai/gpt-4o-mini"),
  memory,
});

export const mastra = createMastra({
  agents: { example: exampleAgent },
  storage,
  logger: createDefaultLogger({ name: "agenda-da-turma", level: env.MASTRA_LOG_LEVEL }),
});
```

Detalhes de arquitetura: `docs/arquitetura-apps.md` §"Pasta `src/ai/`" e `packages/ai-core/CLAUDE.md`.
