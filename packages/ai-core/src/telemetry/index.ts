import type { Database } from "@informach/db";
import { schema } from "@informach/db";
import { eq } from "drizzle-orm";
import type { AgentName, AgentRunStatus, AppName, TokenUsage } from "../types";

export type AgentRunTerminalStatus = Extract<AgentRunStatus, "succeeded" | "failed" | "canceled">;

/**
 * Backend de persistência da camada de auditoria nossa (`ai.agent_runs` /
 * `ai.usage_logs`). Distinta de `ai_mastra.mastra_traces` (que o framework
 * Mastra mantém de forma opaca). Liga billing ↔ agente via `runId`
 * compartilhado.
 *
 * Tipo abstrato propositalmente para que os testes mockem sem precisar
 * de Postgres real ou do Drizzle inteiro.
 */
export type AgentRunStore = {
  insertRun(input: {
    runId: string;
    app: AppName;
    agent: AgentName;
    status: AgentRunStatus;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  updateRun(input: {
    runId: string;
    status: AgentRunTerminalStatus;
    finishedAt: Date;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  insertUsage(input: { runId: string; usage: TokenUsage }): Promise<void>;
};

/**
 * Implementação Drizzle do `AgentRunStore` contra o `db` do `@informach/db`.
 * App injeta `db` (tipicamente o singleton lazy do package).
 */
export function createDrizzleAgentRunStore(db: Database): AgentRunStore {
  return {
    async insertRun(input) {
      await db.insert(schema.agentRuns).values({
        id: input.runId,
        app: input.app,
        agent: input.agent,
        status: input.status,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
    async updateRun(input) {
      await db
        .update(schema.agentRuns)
        .set({
          status: input.status,
          finishedAt: input.finishedAt,
          ...(input.metadata ? { metadata: input.metadata } : {}),
        })
        .where(eq(schema.agentRuns.id, input.runId));
    },
    async insertUsage(input) {
      await db.insert(schema.usageLogs).values({
        runId: input.runId,
        promptTokens: input.usage.promptTokens,
        completionTokens: input.usage.completionTokens,
        totalTokens: input.usage.totalTokens,
      });
    },
  };
}

export type AgentRunRecorder = {
  /** Marca o início do run em `ai.agent_runs` (status="running"). */
  start(input: {
    runId: string;
    app: AppName;
    agent: AgentName;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Finaliza o run: atualiza `ai.agent_runs.status/finished_at` e — se
   * `usage` for fornecido — insere uma linha em `ai.usage_logs`. Idempotente
   * por `runId` na medida em que `start` falha duas vezes (PK violation).
   */
  finish(input: {
    runId: string;
    status: AgentRunTerminalStatus;
    usage?: TokenUsage;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
};

/**
 * Cria um recorder que escreve em `ai.agent_runs` / `ai.usage_logs` via o
 * `AgentRunStore` injetado. Apps tipicamente fazem:
 *
 * ```ts
 * const recorder = createAgentRunRecorder({
 *   store: createDrizzleAgentRunStore(db),
 * });
 *
 * await recorder.start({ runId: reservation.id, app: "cozya", agent: "triagem" });
 * try {
 *   const out = await mastra.getAgent("triagem").generate(input, { runId: reservation.id });
 *   await recorder.finish({
 *     runId: reservation.id,
 *     status: "succeeded",
 *     usage: { promptTokens: out.usage.promptTokens, completionTokens: out.usage.completionTokens, totalTokens: out.usage.totalTokens },
 *   });
 * } catch (err) {
 *   await recorder.finish({ runId: reservation.id, status: "failed", metadata: { error: String(err) } });
 *   throw err;
 * }
 * ```
 */
export function createAgentRunRecorder(deps: { store: AgentRunStore }): AgentRunRecorder {
  return {
    async start(input) {
      await deps.store.insertRun({
        runId: input.runId,
        app: input.app,
        agent: input.agent,
        status: "running",
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
    async finish(input) {
      assertTerminalStatus(input.status);
      await deps.store.updateRun({
        runId: input.runId,
        status: input.status,
        finishedAt: new Date(),
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
      if (input.usage) {
        await deps.store.insertUsage({ runId: input.runId, usage: input.usage });
      }
    },
  };
}

function assertTerminalStatus(status: AgentRunStatus): asserts status is AgentRunTerminalStatus {
  if (status !== "succeeded" && status !== "failed" && status !== "canceled") {
    throw new Error("Agent run finish status must be terminal");
  }
}

/** Soma `promptTokens + completionTokens` num `TokenUsage` consistente. */
export function calculateTokenUsage(promptTokens: number, completionTokens: number): TokenUsage {
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}
