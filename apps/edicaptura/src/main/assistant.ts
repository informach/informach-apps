import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { grantAllows, isGrantLive, type McpGrant } from "@informach/edi-desktop/access";
import type { AiClientId, EngineEvent, TurnRequest } from "@informach/edi-desktop/ai-clients";
import {
  localMcpUrl,
  startLocalMcpServer,
  type ToolOutcome,
} from "@informach/edi-desktop/mcp-server";
import {
  ASSISTANT_GUIDE,
  ASSISTANT_TOOLS,
  type AssistantToolName,
  proposalFor,
  type TaskContext,
  taskContextSchema,
  taskMessage,
} from "../domain/assistant.ts";

/** The part of `createAssistantEngines` this service drives (a stand-in in tests). */
export interface TaskEngines {
  runClaudeCode(request: TurnRequest): Promise<void>;
  runCodex(request: TurnRequest): Promise<void>;
  stop(conversationId: string): boolean;
}
export type AssistantEvent =
  | ({ runId: string } & EngineEvent)
  | {
      runId: string;
      type: "proposal";
      task: TaskContext["task"];
      targetId: string;
      proposal: unknown;
    }
  | { runId: string; type: "ended" };

interface ActiveTask {
  runId: string;
  context: TaskContext;
  proposed: boolean;
}

/**
 * One assistant task at a time. The MCP server offers its tools only to the token of the task
 * being run (its grant's project is the run id); any other token, including an outside client,
 * sees nothing. Stopping, a new task, signing out or quitting end the task's authority: later
 * calls are refused and a late proposal is never delivered.
 */
export function createCaptureAssistant(deps: {
  engines: TaskEngines;
  emit(event: AssistantEvent): void;
  version: string;
}) {
  let task: ActiveTask | null = null;
  let server: Promise<{ http: Server; url: string }> | null = null;
  const owns = (grant: McpGrant) =>
    !!task && grant.projectId === task.runId && isGrantLive(grant.id);

  async function call(
    grant: McpGrant,
    name: AssistantToolName,
    args: unknown,
  ): Promise<ToolOutcome> {
    const active = task;
    if (!active || !owns(grant)) return { ok: false, text: "Nenhuma tarefa ativa do EdiCaptura." };
    if (name === "get_task") {
      if (!grantAllows(grant, "read")) return { ok: false, text: "Leitura não autorizada." };
      const { context } = active;
      const header = `${ASSISTANT_GUIDE}\n\n${taskMessage(context.task)}`;
      if (context.task === "capture-details")
        return {
          ok: true,
          text: `${header}\n\nNome atual: ${context.name}\nEtiquetas atuais: ${context.tags.join(", ") || "(nenhuma)"}\nTexto visível na imagem:\n${context.text || "(não compartilhado)"}`,
          images: [{ mime: "image/jpeg", data: context.image }],
        };
      return {
        ok: true,
        text: `${header}\n\nGuia: ${context.title}\n${context.steps
          .map(
            (step, index) =>
              `Passo ${index + 1} (id ${step.stepId}): título atual "${step.title}", descrição atual "${step.description}", texto alternativo atual "${step.alt}". A imagem ${index + 1} vem nesta ordem.`,
          )
          .join("\n")}`,
        images: context.steps.map((step) => ({ mime: "image/jpeg" as const, data: step.image })),
      };
    }
    if (!grantAllows(grant, "propose")) return { ok: false, text: "Proposta não autorizada." };
    let proposal: unknown;
    try {
      proposal = proposalFor(active.context, name, args);
    } catch (error) {
      return { ok: false, text: error instanceof Error ? error.message : "Proposta inválida." };
    }
    if (task !== active) return { ok: false, text: "A tarefa terminou." };
    active.proposed = true;
    deps.emit({
      runId: active.runId,
      type: "proposal",
      task: active.context.task,
      targetId: active.context.targetId,
      proposal,
    });
    return { ok: true, text: "Proposta entregue. A pessoa vai revisar e decidir." };
  }

  function listen() {
    server ??= startLocalMcpServer<AssistantToolName>({
      port: 0,
      name: "edicaptura",
      version: deps.version,
      instructions: ASSISTANT_GUIDE,
      tools: ASSISTANT_TOOLS,
      bodyLimit: 1_000_000,
      offered: (grant) => owns(grant),
      call,
    }).then((http) => ({ http, url: localMcpUrl((http.address() as AddressInfo).port) }));
    return server;
  }

  function stop() {
    const ended = task;
    task = null;
    if (ended) {
      deps.engines.stop(ended.runId);
      deps.emit({ runId: ended.runId, type: "ended" });
    }
    return !!ended;
  }

  async function start(input: { client: AiClientId; context: unknown }) {
    const context = taskContextSchema.parse(input.context);
    if (!["claude-code", "codex"].includes(input.client)) throw new Error("Cliente inválido.");
    stop();
    const { url } = await listen();
    const active: ActiveTask = { runId: randomUUID(), context, proposed: false };
    task = active;
    const request: TurnRequest = {
      conversationId: active.runId,
      grantProject: active.runId,
      text: taskMessage(context.task),
      url,
      emit: (event) => {
        if (task === active) deps.emit({ runId: active.runId, ...event });
      },
      check: () => {
        if (task !== active) throw new Error("A tarefa foi interrompida.");
      },
    };
    const run =
      input.client === "codex"
        ? deps.engines.runCodex(request)
        : deps.engines.runClaudeCode(request);
    void run
      .catch((error: unknown) => {
        if (task === active)
          deps.emit({
            runId: active.runId,
            type: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      })
      .finally(() => {
        if (task !== active) return;
        if (!active.proposed)
          deps.emit({
            runId: active.runId,
            type: "error",
            message: "O assistente terminou sem propor nada.",
          });
        task = null;
        deps.emit({ runId: active.runId, type: "ended" });
      });
    return { runId: active.runId };
  }

  return {
    start,
    stop,
    /** For tests and diagnostics: the endpoint the run is told about. */
    url: async () => (await listen()).url,
    call,
    async close() {
      stop();
      const current = server;
      server = null;
      if (current) {
        const { http } = await current;
        await new Promise<void>((resolve) => http.close(() => resolve()));
      }
    },
  };
}
