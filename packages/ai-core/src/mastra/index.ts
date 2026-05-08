import "server-only";

import { Mastra } from "@mastra/core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import type { Workflow } from "@mastra/core/workflows";
import { createStep, createWorkflow } from "@mastra/core/workflows";
import type { PinoLogger } from "@mastra/loggers";
import { Memory } from "@mastra/memory";
import {
  CloudExporter,
  DefaultExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { PostgresStore } from "@mastra/pg";

/** Schema Postgres dedicado às tabelas auto-criadas pelo Mastra. */
export const MASTRA_SCHEMA_NAME = "ai_mastra" as const;

export type CreatePostgresStoreConfig = {
  /** DATABASE_URL completo. App injeta via `lib/env.ts`. */
  connectionString: string;
  /** Default `"ai_mastra"` (constante MASTRA_SCHEMA_NAME). */
  schemaName?: string;
  /** Tamanho máximo do pool. Default 10. */
  max?: number;
  /** Idle timeout em ms. Default 30000. */
  idleTimeoutMillis?: number;
  /**
   * Quando `true`, Mastra NÃO auto-cria nem migra tabelas. Use só quando
   * estiver replicando o schema via Drizzle (não é o caso atual — ai_mastra
   * deliberadamente fica fora do `schemaFilter` de drizzle.config.ts).
   */
  disableInit?: boolean;
};

/**
 * Cria um `PostgresStore` apontando para o schema `ai_mastra` do Postgres
 * compartilhado. O construtor não abre conexão; o pool subjacente (`pg.Pool`)
 * só dispara conexão na primeira query — seguro para `pnpm build` com env
 * dummy.
 *
 * As tabelas que o Mastra cria automaticamente neste schema:
 *   mastra_threads, mastra_messages, mastra_traces, mastra_scorers,
 *   mastra_evals, mastra_workflow_snapshot, mastra_resources.
 *
 * Drizzle não as conhece (schema `ai_mastra` ausente do `schemaFilter`),
 * então `pnpm db:generate` nunca propõe DROP nelas.
 */
export function createPostgresStore(config: CreatePostgresStoreConfig): PostgresStore {
  return new PostgresStore({
    id: "informach-mastra-storage",
    connectionString: config.connectionString,
    schemaName: config.schemaName ?? MASTRA_SCHEMA_NAME,
    max: config.max ?? 10,
    idleTimeoutMillis: config.idleTimeoutMillis ?? 30_000,
    ...(config.disableInit !== undefined ? { disableInit: config.disableInit } : {}),
  });
}

export type CreateSharedMemoryConfig = {
  /** Storage compartilhado (criado via `createPostgresStore`). */
  storage: PostgresStore;
  /**
   * Opções do Memory. Por padrão, `lastMessages: 40` e `generateTitle: false`
   * (alinhado com defaults v1 sem RAG/embeddings). Apps que queiram
   * `semanticRecall` ou customizar `workingMemory` por completo passam o
   * objeto cheio aqui (sobrescreve `workingMemoryTemplate`).
   */
  options?: NonNullable<ConstructorParameters<typeof Memory>[0]>["options"];
  /**
   * Atalho para habilitar working memory com um template markdown. Atalho do
   * caso comum: `options.workingMemory = { enabled: true, scope: "resource",
   * template }`. Se `options` for fornecido com `workingMemory`, esse atalho
   * é ignorado (o app tem controle total).
   *
   * `scope: "resource"` (default) faz a memória persistir entre todos os
   * threads do mesmo `resource` (typically `userId`/`orgId`) — ideal para
   * lembrar preferências do usuário entre chamadas. Storage `@mastra/pg`
   * suporta o table `mastra_resources` necessário.
   */
  workingMemoryTemplate?: string;
};

/**
 * Cria um `Memory` compartilhado entre todos os agentes do app. Sem vector
 * store / embedder por padrão (ver §"Vector store opt-in" no CLAUDE.md do
 * package). Para habilitar RAG/semantic recall depois, basta passar
 * `vector` + `embedder` num wrapper que reaproveite este factory.
 */
export function createSharedMemory(config: CreateSharedMemoryConfig): Memory {
  const optionsHasWorkingMemory = config.options !== undefined && "workingMemory" in config.options;
  const resolvedOptions =
    config.workingMemoryTemplate !== undefined && !optionsHasWorkingMemory
      ? {
          ...(config.options ?? {}),
          workingMemory: {
            enabled: true as const,
            scope: "resource" as const,
            template: config.workingMemoryTemplate,
          },
        }
      : config.options;

  return new Memory({
    storage: config.storage,
    ...(resolvedOptions ? { options: resolvedOptions } : {}),
  });
}

export type CreateMastraConfig = {
  /** Mapa de agentes do app, chaveado pelo nome de uso (ex: { triagem }). */
  agents: Record<string, Agent>;
  /** Workflows opcionais. */
  workflows?: Record<string, Workflow>;
  /** Scorers Mastra opcionais, registrados no runtime para eval/observability. */
  scorers?: NonNullable<ConstructorParameters<typeof Mastra>[0]>["scorers"];
  /** Observability Mastra opcional. Crie via `createDefaultObservability`. */
  observability?: NonNullable<ConstructorParameters<typeof Mastra>[0]>["observability"];
  /** Storage compartilhado. */
  storage: PostgresStore;
  /** Logger compatível (criar via `createDefaultLogger`). */
  logger: PinoLogger;
};

/**
 * Factory canônico para a instância `Mastra` do app. Tudo é injetado por
 * parâmetro: storage, logger, agents, workflows. Nada lê `process.env`.
 *
 * Padrão de uso (em `apps/<app>/src/ai/index.ts`, sempre com
 * `import "server-only"`):
 *
 * ```ts
 * const storage = createPostgresStore({ connectionString: env.DATABASE_URL });
 * const memory  = createSharedMemory({ storage });
 * const agente  = new Agent({ name: "x", model: anthropic("claude-opus-4-7"), memory, instructions: "..." });
 *
 * export const mastra = createMastra({
 *   agents: { agente },
 *   storage,
 *   logger: createDefaultLogger({ name: "agenda-da-turma" }),
 * });
 * ```
 */
export function createMastra(config: CreateMastraConfig): Mastra {
  return new Mastra({
    agents: config.agents,
    ...(config.workflows ? { workflows: config.workflows } : {}),
    ...(config.scorers ? { scorers: config.scorers } : {}),
    ...(config.observability ? { observability: config.observability } : {}),
    storage: config.storage,
    logger: config.logger,
  });
}

export type CreateDefaultObservabilityConfig = {
  /** Nome do serviço nos traces, ex.: "cozya". */
  serviceName: string;
  /** Nome da config no registry Mastra. Default `"default"`. */
  configName?: string;
  /**
   * Envia traces ao Mastra Cloud além do storage local. Default false para
   * evitar tráfego externo implícito; habilite apenas com credenciais Cloud.
   */
  cloud?: boolean;
};

/**
 * Observability default para apps Informach: persiste traces no storage do
 * Mastra e filtra dados sensíveis antes de exportar spans.
 */
export function createDefaultObservability(
  config: CreateDefaultObservabilityConfig,
): Observability {
  return new Observability({
    configs: {
      [config.configName ?? "default"]: {
        serviceName: config.serviceName,
        exporters: config.cloud
          ? [new DefaultExporter(), new CloudExporter()]
          : [new DefaultExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  });
}

export type { Workflow };
// Re-exports — apps importam tudo daqui sem precisar conhecer a topologia
// de sub-paths do `@mastra/core` (que muda entre minors).
export {
  Agent,
  CloudExporter,
  createStep,
  createTool,
  createWorkflow,
  DefaultExporter,
  Mastra,
  Memory,
  Observability,
  PostgresStore,
  SensitiveDataFilter,
};
