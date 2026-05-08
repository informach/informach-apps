# `@informach/ai-core` — package guide

> Documentação primária do package para humanos e agentes. Para o billing wrapper que roda em volta de cada chamada paga (`withCredits`), ver também [`@informach/billing/CLAUDE.md`](../billing/CLAUDE.md). Para a camada de auditoria (tabelas `ai.*`), ver `packages/db/src/schema/ai.ts`.

---

## 1. Propósito

`@informach/ai-core` é a base de **agentes IA** dos apps do monorepo. Centraliza Mastra (`@mastra/core`, `@mastra/pg`, `@mastra/loggers`, `@mastra/memory`) e os providers AI SDK compatíveis com Mastra v1 atrás de factories puras que apps consomem por dependency injection. Hoje exporta wrappers para 3 providers — `@openrouter/ai-sdk-provider` (gateway preferido do projeto), `@ai-sdk/openai` e `@ai-sdk/anthropic`. **Os agentes propriamente ditos não vivem aqui** — moram em `apps/<app>/src/ai/` (ver `arquitetura-apps.md` §"Pasta `src/ai/`"). O package fornece:

- Factory `createMastra` que monta a instância `Mastra` do app com storage, logger e mapa de agentes.
- Factory `createPostgresStore` apontando para o schema dedicado `ai_mastra` no Postgres compartilhado.
- Factory `createSharedMemory` que reaproveita o storage para todos os agentes do app.
- Factories `createOpenRouter`/`createAnthropic`/`createOpenAI` com `apiKey` injetado (não lê `process.env`). `createOpenRouter` é o caminho preferido — gateway único cobre chat, vision, web search e Whisper transcription.
- `createDefaultLogger` (PinoLogger pré-configurado).
- `createDefaultObservability` (Mastra Observability com `DefaultExporter` e `SensitiveDataFilter`; `CloudExporter` é opt-in).
- `transcribeAudio` (sub-path `./transcription`): wrap fino sobre `/audio/transcriptions` JSON+base64. Aceita `apiKey` + `baseURL` + `model` + `headers`, então funciona contra OpenRouter (`baseURL: "https://openrouter.ai/api/v1"`, `model: "openai/whisper-1"`).
- `runRecordedAiCall`/`runBillableAiCall`: wrappers de execução com retry, auditoria `ai.agent_runs`, normalização de usage e, quando aplicável, reserve→commit/release de créditos.
- `withCredits`: wrapper reserve→commit/release acoplado ao `@informach/billing`, com validação de custo e correlação de `runId`.
- `createAgentRunRecorder` + `createDrizzleAgentRunStore`: camada de auditoria nossa em `ai.agent_runs`/`ai.usage_logs`.

---

## 2. Runtime e versões externas

Este package roda em **Node.js 22.13+**. O requisito vem do Mastra v1; mantenha `.nvmrc`, `package.json#engines` e CI na mesma linha antes de mexer em `@mastra/*`.

Dependências externas com contrato sensível:

| Família | Versão atual | Regra |
| --- | --- | --- |
| Mastra | `@mastra/core@1.31.0`, `@mastra/pg@1.9.4`, `@mastra/memory@1.17.4`, `@mastra/loggers@1.1.1`, `@mastra/observability@1.11.1` | pin literal; validar upgrade via Context7 antes de alterar |
| AI SDK providers | `@ai-sdk/anthropic@3.0.74`, `@ai-sdk/openai@3.0.58`, `@openrouter/ai-sdk-provider@2.9.0` | wrappers recebem `apiKey` do app; não usar default provider que lê env |
| Node types | `@types/node@^22.13.0` | acompanha runtime mínimo |

Notas confirmadas via Context7:

- `new Mastra({ agents, workflows, storage, logger, scorers, observability })` é o ponto de composição da instância.
- Storage Mastra v1 exige `id`; `createPostgresStore` fixa `id: "informach-mastra-storage"` e `schemaName: "ai_mastra"`.
- Mastra Observability usa `Observability` com exporters (`DefaultExporter`, `CloudExporter`) e `spanOutputProcessors` como `SensitiveDataFilter`.
- Providers AI SDK aceitam `apiKey`, `baseURL`, `headers` e opções específicas como `organization`/`project` no OpenAI. O wrapper OpenRouter expõe também `appName`, `appUrl`, `compatibility`, `extraBody` e `apiKeys`.
- `@openrouter/ai-sdk-provider` peerDep `ai@^6.0.0`; expõe `openrouter('openai/gpt-4o')`, `openrouter.tools.webSearch({ engine, maxResults })`, `appName` → `X-OpenRouter-Title`, `appUrl` → `HTTP-Referer`, e plugin `response-healing`. OpenRouter implementa também `/audio/transcriptions` OpenAI-compatible — por isso `transcribeAudio` apenas troca `baseURL` em vez de exigir provider próprio.
- AI SDK v6 gera objeto estruturado com `generateText({ output: Output.object({ schema }) })`; novos scorers/evals devem preferir esse formato em vez de adicionar usos novos de `generateObject`.

---

## 3. Como funciona (diagrama mental)

```
apps/<app>/src/ai/index.ts        ← agente "tradutor", "triagem", etc.
  ├ import "server-only"          (fence: nunca importável de client comp.)
  ├ createPostgresStore({ env.DATABASE_URL })
  ├ createSharedMemory({ storage })
  ├ Agent({ model: openrouter("openai/gpt-4o-mini"), memory })
  └ export const mastra = createMastra({ agents, storage, logger, observability })

apps/<app>/src/app/api/<feature>/route.ts (ou Server Action)
  ├ runBillableAiCall({ owner, app, feature, model,
  │     call: ({ runId }) => agent.generate(input, { runId }) })
  ├ runRecordedAiCall(...)                          ← estágios internos sem nova cobrança
  └ withCredits(...)                                ← apenas quando o fluxo precisa orquestrar múltiplos estágios

@informach/ai-core (este package)
  ├ src/index.ts            ← apenas tipos + billing + telemetry + tools (root leve)
  ├ src/types.ts            ← AppName, AgentRunStatus, TokenUsage, ToolContext
  ├ src/billing.ts          ← withCredits, computeCreditsFromUsage  (frame-agnostic)
  ├ src/execution.ts        ← runRecordedAiCall, runBillableAiCall (retry + audit + billing)
  ├ src/tools/index.ts      ← createToolContext (frame-agnostic)
  ├ src/telemetry/index.ts  ← AgentRunRecorder, AgentRunStore, createDrizzleAgentRunStore
  ├ src/logger.ts           ← createDefaultLogger
  ├ src/providers/index.ts  ← createOpenRouter, createAnthropic, createOpenAI (apiKey injetado)
  ├ src/transcription.ts    ← transcribeAudio (apiKey + baseURL + model + headers — OpenAI-compatible)
  └ src/mastra/index.ts     ← createMastra, createPostgresStore, createSharedMemory, createDefaultObservability
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

A ligação entre os dois é o `runId` (UUID): `ai.agent_runs.id` ≡ `billing.creditLedger.runId` ≡ `ai_mastra.mastra_traces.runId` ≡ `withCredits` `reservation.id`. `runBillableAiCall` preserva esse contrato para chamadas simples; em fluxos manuais, `withCredits` prealoca o UUID antes de chamar `reserveCredits`, então o `reservation.id` já nasce igual ao `runId` persistido no billing. **Sempre** que invocar `agent.generate(input, { runId })`, passe o mesmo UUID que veio do billing.

---

## 4. Funcionalidades expostas

| Sub-path | Símbolo | O que faz |
| --- | --- | --- |
| `.` (root) | `withCredits`, `computeCreditsFromUsage`, `CreditValidationError` | wrap reserve→commit/release em volta de chamada paga e validação de custo/usage |
| `.` (root) / `./execution` | `runRecordedAiCall`, `runBillableAiCall`, `runBillableAgentCall`, `runBillableTextCall` | execução padronizada com retry, auditoria, usage normalizado e billing opcional |
| `.` (root) | `createAgentRunRecorder`, `createDrizzleAgentRunStore`, `calculateTokenUsage` | escreve em `ai.agent_runs` / `ai.usage_logs` |
| `.` (root) | `createToolContext` | helper p/ `ToolContext` em tools customizadas |
| `.` (root) | tipos: `AppName`, `AgentName`, `AgentRunStatus`, `AgentRunTerminalStatus`, `TokenUsage`, `AiRuntimeConfig`, `ToolContext` | contratos frame-agnostic |
| `./mastra` | `createMastra`, `createPostgresStore`, `createSharedMemory`, `createDefaultObservability`, `MASTRA_SCHEMA_NAME` | factories puras, server-only |
| `./mastra` | re-exports `Agent`, `Memory`, `Mastra`, `PostgresStore`, `createTool`, `createStep`, `createWorkflow`, `Observability`, `DefaultExporter`, `CloudExporter`, `SensitiveDataFilter`, type `Workflow` | apps importam tudo daqui |
| `./providers` | `createOpenRouter`, `createAnthropic`, `createOpenAI` | wrappers AI SDK com `apiKey` injetado; OpenRouter também aceita `appName`, `appUrl`, `compatibility`, `extraBody`, `apiKeys` |
| `./logger` | `createDefaultLogger` | PinoLogger pronto pra `createMastra({ logger })` |
| `./transcription` | `transcribeAudio({ apiKey, audio, baseURL?, model?, headers?, language?, format? })` | wrap fino sobre o endpoint `/audio/transcriptions` do OpenRouter (JSON+base64). Default `baseURL=https://openrouter.ai/api/v1`, `model=openai/whisper-1`. NÃO usa multipart/form-data (OpenRouter não aceita) — confirmado lendo `@openrouter/sdk` `STTRequest` |
| `./billing`, `./telemetry`, `./tools`, `./types` | aliases granulares | só úteis em testes ou import seletivo |

Sub-paths removidos do scaffold inicial: `./models`, `./memory`, `./guardrails`, `./prompts`. Eles eram placeholders; absorvidos por `./mastra` ou movidos para `apps/<app>/src/ai/`.

---

## 5. Como cada app usa

Env vars (ver `apps/<app>/src/lib/env.ts`):

```ts
DATABASE_URL: z.string().url(),
// Caminho preferido — gateway único (cozya 2026-05+):
OPENROUTER_API_KEY: z.string().min(1),
OPENROUTER_HTTP_REFERER: z.string().url().optional(),
OPENROUTER_X_TITLE: z.string().min(1).optional(),
// Caminho legado — apps que ainda chamam OpenAI/Anthropic direto:
OPENAI_API_KEY: z.string().min(1).optional(),
ANTHROPIC_API_KEY: z.string().min(1).optional(),
MASTRA_LOG_LEVEL: z.enum(["debug","info","warn","error"]).default("info"),
```

Wire-up via OpenRouter (caminho atual do cozya — `apps/cozya/src/ai/index.ts`):

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
const storage = createPostgresStore({ connectionString: env.DATABASE_URL });
const memory  = createSharedMemory({ storage });

const recipeParser = new Agent({
  name: "recipeParser",
  instructions: "...",
  model: openrouter("openai/gpt-4o-mini"),
  memory,
});

export const mastra = createMastra({
  agents: { recipeParser },
  storage,
  logger: createDefaultLogger({ name: "cozya", level: env.MASTRA_LOG_LEVEL }),
  observability: createDefaultObservability({ serviceName: "cozya" }),
});
```

Wire-up via Anthropic direto (template para apps que precisem de provider isolado — não usado no cozya):

```ts
import { createAnthropic } from "@informach/ai-core/providers";
const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY ?? "" });
const triagem = new Agent({ name: "triagem", model: anthropic("claude-opus-4-7"), memory });
```

Web search (substitui o `webSearchPreview` da Responses API da OpenAI):

```ts
import { generateText } from "ai";
const result = await generateText({
  model: openrouter("openai/gpt-4o-mini"),
  tools: { web_search: openrouter.tools.webSearch({ engine: "auto", maxResults: 5 }) },
  toolChoice: "auto",
  prompt: "...",
});
```

Transcrição via OpenRouter (Whisper-1):

```ts
import { transcribeAudio } from "@informach/ai-core/transcription";
const result = await transcribeAudio({
  apiKey: env.OPENROUTER_API_KEY,
  audio,
  headers: {
    ...(env.OPENROUTER_HTTP_REFERER ? { "HTTP-Referer": env.OPENROUTER_HTTP_REFERER } : {}),
    ...(env.OPENROUTER_X_TITLE ? { "X-OpenRouter-Title": env.OPENROUTER_X_TITLE } : {}),
  },
  language: "pt",
});
// `baseURL` defaults to https://openrouter.ai/api/v1; `model` defaults to "openai/whisper-1".
// Format is inferred from Blob.type (audio/webm → "webm") com fallback "webm".
```

Chamada com billing + auditoria (em route handler ou server action):

```ts
import {
  createAgentRunRecorder,
  createDrizzleAgentRunStore,
  runBillableAiCall,
} from "@informach/ai-core";
import { db } from "@informach/db";
import { mastra } from "@/ai";
import { billing } from "@/lib/billing";

const recorder = createAgentRunRecorder({ store: createDrizzleAgentRunStore(db) });

const out = await runBillableAiCall({
  billing,
  owner: { type: "organization", id: activeOrgId }, // user.id em cozya
  app: "agenda-da-turma",
  agent: "triagem",
  feature: "triagem.generate",
  model: "claude-opus-4-7",
  recorder,
  call: ({ runId }) => mastra.getAgent("triagem").generate(input, { runId }),
  getUsage: (r) => r.usage,
});
```

`runBillableAiCall` usa custo default de 1 crédito. Para features variáveis, passe `estimateCost` e `computeActualCost` explicitamente. Se o retorno do provider vier no formato AI SDK atual (`inputTokens`/`outputTokens`/`totalTokens`), normalize antes de calcular créditos manualmente:

```ts
const usage = {
  promptTokens: r.usage.inputTokens ?? 0,
  completionTokens: r.usage.outputTokens ?? 0,
  totalTokens: r.usage.totalTokens ?? (r.usage.inputTokens ?? 0) + (r.usage.outputTokens ?? 0),
};
```

`computeCreditsFromUsage` exige inteiros não negativos e `totalTokens === promptTokens + completionTokens`. `withCredits` também exige `estimatedAmount` e `actualAmount` como inteiros positivos. Falha de validação antes da reserva não toca billing; falha depois da reserva libera com `reason: "validation_failed"`.

Owner por app:
- `agenda-da-turma`: `{ type: "organization", id: activeOrgId }` (multi-tenant, Better Auth organizations).
- `cozya`: `{ type: "user", id: session.user.id }` (single-user).

---

## 6. Decisões fixadas

1. **Schema `ai_mastra` separado** para tabelas auto-criadas pelo Mastra. Drizzle continua dono exclusivo de `ai`. Decidido para manter o invariante "Drizzle é fonte de verdade" sem tornar este package refém de mudanças de schema entre versões do Mastra.
2. **`disableInit` deixado como `false`** (default). Mastra auto-migra `mastra_*` no primeiro hit. Migration custom `0010_create_ai_mastra_schema.sql` só cria o schema vazio — DDL fora dos schemas geridos pelo Drizzle.
3. **AI SDK providers linha 3.x** — exigidos pelo `@mastra/core@1.31.0`. Não voltar para providers 2.x sem validar a compatibilidade Mastra/AI SDK via Context7.
4. **Sem pgvector / sem RAG** por padrão. Vector store é opt-in: para habilitar, adicionar `@mastra/pg` `PgVector` numa factory paralela à `createSharedMemory` e criar `CREATE EXTENSION IF NOT EXISTS vector` em migration custom.
5. **`runId` compartilhado** entre `runBillableAiCall`/`withCredits` (reservation.id), `agent.generate({ runId })` e `recorder.start/finish`. Sem isso, perdemos correlação billing↔agente↔mastra_traces.
6. **Pool separado**: `@informach/db` usa driver `postgres-js`; `@mastra/pg` usa `pg`. Dois pools no mesmo Postgres é aceitável — não tentar reaproveitar.
7. **`server-only` no sub-path `./mastra`**: garante falha de build se algum Client Component puxar acidentalmente. Tests Vitest aliasam para um stub via `vitest.config.ts`.
8. **PinoLogger via `@mastra/loggers`** — uma instância separada do pino do app. Não tente injetar o pino do app dentro do PinoLogger; co-existem fine, ambos JSON em prod.
9. **Camadas de auditoria coexistem**: `ai.*` (nossa, queries de billing/dashboards) + `ai_mastra.mastra_traces` (debug interno do framework). Nunca substituir uma pela outra.
10. **Pinning literal das deps Mastra/AI SDK**: bumps são intencionais. Antes de mudar `@mastra/*` ou `@ai-sdk/*`, validar via context7 (`/mastra-ai/mastra`, `/websites/ai-sdk_dev`) e rodar testes do `withCredits` + smoke local.
11. **`finish()` só aceita status terminal**: `succeeded`, `failed` ou `canceled`. `pending`/`running` são estados de abertura, nunca de finalização com `finishedAt`.
12. **Usage é contrato interno**: apps podem receber formatos diferentes do provider, mas persistem/cobram sempre `TokenUsage` (`promptTokens`, `completionTokens`, `totalTokens`) validado.

---

## 7. Testes

```
src/__tests__/
  billing.test.ts          ← 15 tests (withCredits + computeCreditsFromUsage + validações)
  execution.test.ts        ← 4 tests (runRecordedAiCall + runBillableAiCall)
  telemetry.test.ts        ← 7 tests (AgentRunRecorder + status terminal + calculateTokenUsage)
  logger.test.ts           ← 3 tests (createDefaultLogger shape)
  mastra-factory.test.ts   ← 4 tests (PostgresStore + Observability)
```

Roda com `pnpm --filter @informach/ai-core test`. Vitest aliasa `server-only` para `test/server-only-stub.ts` — é o que permite o sub-path `./mastra` ser carregado fora de RSC.

Não há teste de integração com Postgres real neste package — isso é responsabilidade dos apps (Vitest + testcontainers, conforme `arquitetura-apps.md` §Testes). Smoke E2E também vive no app consumidor, cobrindo rota/action real que chama `withCredits`, recorder e agente.

---

## 8. Regras para agentes

1. **Nunca** ler `process.env.X` em código deste package. Tudo entra via parâmetro de factory; o app injeta a partir do seu `lib/env.ts` (`@t3-oss/env-nextjs`).
2. **Nunca** importar `@informach/ai-core/mastra` (ou qualquer coisa em `src/mastra/`) de Client Component. O `import "server-only"` é a fence.
3. **Nunca** replicar tabelas `mastra_*` em `packages/db/src/schema/`. Schema `ai_mastra` é deliberadamente externo ao `schemaFilter` do Drizzle.
4. **Nunca** adicionar `"ai_mastra"` ao `schemaFilter` em `drizzle.config.ts` — quebra a fronteira de propriedade.
5. **Sempre** usar `runBillableAiCall` para chamada paga simples. Em fluxos multiestágio, use `withCredits` para a reserva única e `runRecordedAiCall` para cada estágio auditável.
6. **Sempre** que adicionar uma dependência Mastra/AI SDK nova, validar versão via context7 e rodar `pnpm --filter @informach/ai-core typecheck && test`.
7. **Owner do saldo** é fixado pelo app: org em agenda-da-turma, user em cozya. Não criar lógica de "decide owner pelo runtime" no package.
8. **Não exportar** símbolos no root (`src/index.ts`) que toquem Mastra. O root deve ficar leve para que `import { withCredits } from "@informach/ai-core"` em algum service Next-free não puxe o universo Mastra.
9. **Memory sem RAG**: não habilitar `semanticRecall`/`vector` no `createSharedMemory` default. RAG é opt-in com migration de pgvector + `PgVector`.
10. **Sempre** passar `runId = reservation.id` quando combinar `withCredits` + `agent.generate` manualmente. Sem isso, perde-se a correlação cross-schema.
11. **Nunca** passar usage bruto de provider para billing sem normalizar. O helper de custo espera `TokenUsage` interno e rejeita totais inconsistentes.

---

## 9. Próximos passos (backlog, sem compromisso)

- **Vector store opt-in**: factory `createSharedVector({ connectionString })` com migration adicional `CREATE EXTENSION vector` + ligação no `createMastra({ vectors })`.
- **Sweeper de runs órfãos**: cron que expira `ai.agent_runs` em `running` há mais de N min sem `usage_logs` correspondente. Análogo aos sweepers de billing.
- **Integração com Sentry**: passar um `mixin` ao `PinoLogger` que injeta `traceId` corrente, e capturar erros de `agent.generate` via `Sentry.captureException` no service do app.
- **Embedder opcional via Anthropic/OpenAI**: factory `createEmbedder({ provider, model })` para semantic recall sem amarrar provider.
- **OpenTelemetry exporter**: opcionalmente plugar `@mastra/otel-exporter` no `createMastra` quando o app rodar com Tempo/Grafana.
