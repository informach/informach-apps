# `@informach/ai-core` — package guide

> Documentação primária do package para humanos e agentes. Para o billing wrapper que roda em volta de cada chamada paga (`withCredits`), ver também [`@informach/billing/CLAUDE.md`](../billing/CLAUDE.md). Para a camada de auditoria (tabelas `ai.*`), ver `packages/db/src/schema/ai.ts`.

---

## 1. Propósito

`@informach/ai-core` é a base de **agentes IA** dos apps do monorepo. Centraliza Mastra (`@mastra/core`, `@mastra/pg`, `@mastra/loggers`, `@mastra/memory`) e os providers AI SDK v5 (`@ai-sdk/anthropic`, `@ai-sdk/openai`) atrás de factories puras que apps consomem por dependency injection. **Os agentes propriamente ditos não vivem aqui** — moram em `apps/<app>/src/ai/` (ver `arquitetura-apps.md` §"Pasta `src/ai/`"). O package fornece:

- Factory `createMastra` que monta a instância `Mastra` do app com storage, logger e mapa de agentes.
- Factory `createPostgresStore` apontando para o schema dedicado `ai_mastra` no Postgres compartilhado.
- Factory `createSharedMemory` que reaproveita o storage para todos os agentes do app.
- Factories `createAnthropic`/`createOpenAI` com `apiKey` injetado (não lê `process.env`).
- `createDefaultLogger` (PinoLogger pré-configurado).
- `withCredits` (já existia, preservado): wrapper reserve→commit/release acoplado ao `@informach/billing`.
- `createAgentRunRecorder` + `createDrizzleAgentRunStore`: camada de auditoria nossa em `ai.agent_runs`/`ai.usage_logs`.

---

## 2. Como funciona (diagrama mental)

```
apps/<app>/src/ai/index.ts        ← agente "tradutor", "triagem", etc.
  ├ import "server-only"          (fence: nunca importável de client comp.)
  ├ createPostgresStore({ env.DATABASE_URL })
  ├ createSharedMemory({ storage })
  ├ Agent({ model: anthropic("claude-opus-4-7"), memory })
  └ export const mastra = createMastra({ agents, storage, logger })

apps/<app>/src/app/api/<feature>/route.ts (ou Server Action)
  └ withCredits({ billing, owner, ... })            ← reserva saldo
      ├ recorder.start({ runId: reservation.id })   ← auditoria nossa
      ├ mastra.getAgent("triagem").generate(input,
      │     { runId: reservation.id })              ← runId = reservation.id
      ├ recorder.finish({ runId, status, usage })
      └ commitReservation({ actualAmount })

@informach/ai-core (este package)
  ├ src/index.ts            ← apenas tipos + billing + telemetry + tools (root leve)
  ├ src/types.ts            ← AppName, AgentRunStatus, TokenUsage, ToolContext
  ├ src/billing.ts          ← withCredits, computeCreditsFromUsage  (frame-agnostic)
  ├ src/tools/index.ts      ← createToolContext (frame-agnostic)
  ├ src/telemetry/index.ts  ← AgentRunRecorder, AgentRunStore, createDrizzleAgentRunStore
  ├ src/logger.ts           ← createDefaultLogger
  ├ src/providers/index.ts  ← createAnthropic, createOpenAI (apiKey injetado)
  └ src/mastra/index.ts     ← createMastra, createPostgresStore, createSharedMemory
                              + re-exports (Agent, Memory, createTool, Workflow, …)
                              ← TUDO neste sub-path tem `import "server-only"`
```

### Tabelas usadas

Duas camadas separadas vivem no mesmo Postgres compartilhado, em schemas diferentes:

| Schema | Donos | Tabelas | Migra via |
| --- | --- | --- | --- |
| `ai` | nosso código (Drizzle) | `agent_runs`, `usage_logs` | `pnpm db:generate`/`db:migrate` |
| `ai_mastra` | Mastra (auto-init) | `mastra_threads`, `mastra_messages`, `mastra_traces`, `mastra_scorers`, `mastra_evals`, `mastra_workflow_snapshot`, `mastra_resources` | Mastra na primeira chamada após `CREATE SCHEMA` (migration `0010_create_ai_mastra_schema.sql`) |

`drizzle.config.ts` mantém `schemaFilter` apenas com `["core","agenda","cozya","audit","ai","billing"]` — `ai_mastra` deliberadamente fora, então `db:generate` nunca propõe DROP nas tabelas que o Mastra cria.

A ligação entre os dois é o `runId` (UUID): `ai.agent_runs.id` ≡ `billing.creditLedger.runId` ≡ `ai_mastra.mastra_traces.runId` ≡ `withCredits` `reservation.id`. **Sempre** que invocar `agent.generate(input, { runId })`, passe o mesmo UUID que veio do billing.

---

## 3. Funcionalidades expostas

| Sub-path | Símbolo | O que faz |
| --- | --- | --- |
| `.` (root) | `withCredits`, `computeCreditsFromUsage` | wrap reserve→commit/release em volta de chamada paga |
| `.` (root) | `createAgentRunRecorder`, `createDrizzleAgentRunStore`, `calculateTokenUsage` | escreve em `ai.agent_runs` / `ai.usage_logs` |
| `.` (root) | `createToolContext` | helper p/ `ToolContext` em tools customizadas |
| `.` (root) | tipos: `AppName`, `AgentName`, `AgentRunStatus`, `TokenUsage`, `AiRuntimeConfig`, `ToolContext` | |
| `./mastra` | `createMastra`, `createPostgresStore`, `createSharedMemory`, `MASTRA_SCHEMA_NAME` | factories puras, server-only |
| `./mastra` | re-exports `Agent`, `Memory`, `Mastra`, `PostgresStore`, `createTool`, `createStep`, `createWorkflow`, type `Workflow` | apps importam tudo daqui |
| `./providers` | `createAnthropic`, `createOpenAI` | wrappers AI SDK com `apiKey` injetado |
| `./logger` | `createDefaultLogger` | PinoLogger pronto pra `createMastra({ logger })` |
| `./billing`, `./telemetry`, `./tools`, `./types` | aliases granulares | só úteis em testes ou import seletivo |

Sub-paths removidos do scaffold inicial: `./models`, `./memory`, `./guardrails`, `./prompts`. Eles eram placeholders; absorvidos por `./mastra` ou movidos para `apps/<app>/src/ai/`.

---

## 4. Como cada app usa

Env vars (ver `apps/<app>/src/lib/env.ts`):

```ts
OPENAI_API_KEY: z.string().min(1).optional(),
ANTHROPIC_API_KEY: z.string().min(1).optional(),
MASTRA_LOG_LEVEL: z.enum(["debug","info","warn","error"]).default("info"),
```

Wire-up (`apps/<app>/src/ai/index.ts`):

```ts
import "server-only";
import { createMastra, createPostgresStore, createSharedMemory, Agent } from "@informach/ai-core/mastra";
import { createAnthropic } from "@informach/ai-core/providers";
import { createDefaultLogger } from "@informach/ai-core/logger";
import { env } from "@/lib/env";

const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" });
const storage   = createPostgresStore({ connectionString: env.DATABASE_URL });
const memory    = createSharedMemory({ storage });

const triagem = new Agent({
  name: "triagem",
  instructions: "...",
  model: anthropic("claude-opus-4-7"),
  memory,
});

export const mastra = createMastra({
  agents: { triagem },
  storage,
  logger: createDefaultLogger({ name: "agenda-da-turma", level: env.MASTRA_LOG_LEVEL }),
});
```

Chamada com billing + auditoria (em route handler ou server action):

```ts
import { withCredits, computeCreditsFromUsage,
         createAgentRunRecorder, createDrizzleAgentRunStore } from "@informach/ai-core";
import { db } from "@informach/db";
import { mastra } from "@/ai";
import { billing } from "@/lib/billing";

const recorder = createAgentRunRecorder({ store: createDrizzleAgentRunStore(db) });

const out = await withCredits({
  billing,
  owner: { type: "organization", id: activeOrgId }, // user.id em cozya
  app: "agenda-da-turma",
  feature: "triagem.generate",
  model: "claude-opus-4-7",
  estimateCost:      () => ({ estimatedAmount: estimateFromInputChars(input) }),
  call:              async ({ reservation }) => {
    await recorder.start({ runId: reservation.id, app: "agenda-da-turma", agent: "triagem" });
    try {
      const r = await mastra.getAgent("triagem").generate(input, { runId: reservation.id });
      await recorder.finish({ runId: reservation.id, status: "succeeded", usage: r.usage });
      return r;
    } catch (err) {
      await recorder.finish({ runId: reservation.id, status: "failed", metadata: { error: String(err) } });
      throw err;
    }
  },
  computeActualCost: r => ({
    actualAmount: computeCreditsFromUsage(r.usage, { promptCostPer1k: 30, completionCostPer1k: 150 }),
  }),
});
```

Owner por app:
- `agenda-da-turma`: `{ type: "organization", id: activeOrgId }` (multi-tenant, Better Auth organizations).
- `cozya`: `{ type: "user", id: session.user.id }` (single-user).

---

## 5. Decisões fixadas

1. **Schema `ai_mastra` separado** para tabelas auto-criadas pelo Mastra. Drizzle continua dono exclusivo de `ai`. Decidido para manter o invariante "Drizzle é fonte de verdade" sem tornar este package refém de mudanças de schema entre versões do Mastra.
2. **`disableInit` deixado como `false`** (default). Mastra auto-migra `mastra_*` no primeiro hit. Migration custom `0010_create_ai_mastra_schema.sql` só cria o schema vazio — DDL fora dos schemas geridos pelo Drizzle.
3. **AI SDK v5** (linha 3.x dos providers) — exigido pelo `@mastra/core@^1.31`. Não voltar para v4.
4. **Sem pgvector / sem RAG** por padrão. Vector store é opt-in: para habilitar, adicionar `@mastra/pg` `PgVector` numa factory paralela à `createSharedMemory` e criar `CREATE EXTENSION IF NOT EXISTS vector` em migration custom.
5. **`runId` compartilhado** entre `withCredits` (reservation.id), `agent.generate({ runId })` e `recorder.start/finish`. Sem isso, perdemos correlação billing↔agente↔mastra_traces.
6. **Pool separado**: `@informach/db` usa driver `postgres-js`; `@mastra/pg` usa `pg`. Dois pools no mesmo Postgres é aceitável — não tentar reaproveitar.
7. **`server-only` no sub-path `./mastra`**: garante falha de build se algum Client Component puxar acidentalmente. Tests Vitest aliasam para um stub via `vitest.config.ts`.
8. **PinoLogger via `@mastra/loggers`** — uma instância separada do pino do app. Não tente injetar o pino do app dentro do PinoLogger; co-existem fine, ambos JSON em prod.
9. **Camadas de auditoria coexistem**: `ai.*` (nossa, queries de billing/dashboards) + `ai_mastra.mastra_traces` (debug interno do framework). Nunca substituir uma pela outra.
10. **Pinning literal das deps Mastra/AI SDK**: bumps são intencionais. Antes de mudar `@mastra/*` ou `@ai-sdk/*`, validar via context7 (`/mastra-ai/mastra`, `/websites/ai-sdk_dev`) e rodar testes do `withCredits` + smoke local.

---

## 6. Testes

```
src/__tests__/
  billing.test.ts          ← 10 tests (preservado: withCredits + computeCreditsFromUsage)
  telemetry.test.ts        ← 6 tests (AgentRunRecorder + calculateTokenUsage)
  logger.test.ts           ← 3 tests (createDefaultLogger shape)
  mastra-factory.test.ts   ← 3 tests (createPostgresStore não abre conexão)
```

Roda com `pnpm --filter @informach/ai-core test`. Vitest aliasa `server-only` para `test/server-only-stub.ts` — é o que permite o sub-path `./mastra` ser carregado fora de RSC.

Não há teste de integração com Postgres real neste package — isso é responsabilidade dos apps (Vitest + testcontainers, conforme `arquitetura-apps.md` §Testes). O smoke E2E é descrito em §8.

---

## 7. Regras para agentes

1. **Nunca** ler `process.env.X` em código deste package. Tudo entra via parâmetro de factory; o app injeta a partir do seu `lib/env.ts` (`@t3-oss/env-nextjs`).
2. **Nunca** importar `@informach/ai-core/mastra` (ou qualquer coisa em `src/mastra/`) de Client Component. O `import "server-only"` é a fence.
3. **Nunca** replicar tabelas `mastra_*` em `packages/db/src/schema/`. Schema `ai_mastra` é deliberadamente externo ao `schemaFilter` do Drizzle.
4. **Nunca** adicionar `"ai_mastra"` ao `schemaFilter` em `drizzle.config.ts` — quebra a fronteira de propriedade.
5. **Sempre** passar `runId = reservation.id` quando combinar `withCredits` + `agent.generate`. Sem isso, perde-se a correlação cross-schema.
6. **Sempre** que adicionar uma dependência Mastra/AI SDK nova, validar versão via context7 e rodar `pnpm --filter @informach/ai-core typecheck && test`.
7. **Owner do saldo** é fixado pelo app: org em agenda-da-turma, user em cozya. Não criar lógica de "decide owner pelo runtime" no package.
8. **Não exportar** símbolos no root (`src/index.ts`) que toquem Mastra. O root deve ficar leve para que `import { withCredits } from "@informach/ai-core"` em algum service Next-free não puxe o universo Mastra.
9. **Memory sem RAG**: não habilitar `semanticRecall`/`vector` no `createSharedMemory` default. RAG é opt-in com migration de pgvector + `PgVector`.
10. **AgentRunRecorder fora do `withCredits` `call`** se quiser que falhas de auditoria não derrubem a chamada paga. Padrão recomendado é dentro do `call` (ver §4) para falhar fechado e não cobrar runs órfãos.

---

## 8. Próximos passos (backlog, sem compromisso)

- **Vector store opt-in**: factory `createSharedVector({ connectionString })` com migration adicional `CREATE EXTENSION vector` + ligação no `createMastra({ vectors })`.
- **Sweeper de runs órfãos**: cron que expira `ai.agent_runs` em `running` há mais de N min sem `usage_logs` correspondente. Análogo aos sweepers de billing.
- **Integração com Sentry**: passar um `mixin` ao `PinoLogger` que injeta `traceId` corrente, e capturar erros de `agent.generate` via `Sentry.captureException` no service do app.
- **Embedder opcional via Anthropic/OpenAI**: factory `createEmbedder({ provider, model })` para semantic recall sem amarrar provider.
- **OpenTelemetry exporter**: opcionalmente plugar `@mastra/otel-exporter` no `createMastra` quando o app rodar com Tempo/Grafana.
